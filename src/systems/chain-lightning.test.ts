import { describe, it, expect } from 'vitest';
import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { createGameState } from '@/game/state';
import { StatSheet } from '@/game/stats';
import { STATUS, applyStatus, incomingDamageFactor, type StatusController } from '@/game/status';
import { BALANCE } from '@/game/balance';
import type { SimContext } from './types';
import type { Entity } from '@/ecs/components';
import { AbilitySystem } from './ability';
import { StatusSystem } from './status';

function makeCtx(): SimContext {
  const world = createWorld();
  return {
    world,
    queries: createQueries(world),
    bus: new GameEventBus(),
    rng: new RngStreams(1),
    state: createGameState(),
    stats: new StatSheet(),
    arena: { halfWidth: 1000, halfHeight: 1000 },
    elapsed: 0,
  };
}

function addEnemy(ctx: SimContext, x: number, y: number, hp = 100000): Entity {
  return ctx.world.add({
    enemy: true,
    transform: { position: { x, y }, rotation: 0 },
    collider: { radius: 14 },
    health: { current: hp, max: hp },
    hitFlash: { timer: 0, duration: 0.1 },
  });
}

function addPlayer(ctx: SimContext, level = 1): Entity {
  return ctx.world.add({
    player: true,
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    caster: { abilities: [{ id: 'chainLightning', level, timer: 0 }] },
  });
}

describe('雷殛(shock) status', () => {
  it('caps at 5 stacks and refreshes duration', () => {
    const ctrl: StatusController = {};
    applyStatus(ctrl, 'shock', 1, 3);
    expect(ctrl.shock!.stacks).toBe(1);
    applyStatus(ctrl, 'shock', 10, 1);
    expect(ctrl.shock!.stacks).toBe(STATUS.shock.maxStacks);
    expect(ctrl.shock!.duration).toBe(3);
  });

  it('has no DoT (does not tick damage) but expires after duration', () => {
    const ctx = makeCtx();
    const e = addEnemy(ctx, 0, 0, 100);
    ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, 'shock', 3, 1);
    StatusSystem.update(ctx, 0.5);
    expect(e.health!.current).toBe(100); // 无持续伤害
    StatusSystem.update(ctx, 1);
    expect(e.status).toBeUndefined();
  });

  it('incomingDamageFactor amplifies by +8% per stack', () => {
    const ctrl: StatusController = {};
    expect(incomingDamageFactor(ctrl)).toBeCloseTo(1);
    applyStatus(ctrl, 'shock', 3, 3);
    expect(incomingDamageFactor(ctrl)).toBeCloseTo(1 + 3 * 0.08);
  });
});

describe('雷火连环 (chainLightning)', () => {
  it('bounces to up to `jumps` distinct enemies, applying shock + decaying damage', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const cfg = BALANCE.abilities.chainLightning;
    // 一串等距敌人（间距 < jumpRange），数量多于 Lv1 弹跳数。
    const enemies = [
      addEnemy(ctx, 100, 0),
      addEnemy(ctx, 200, 0),
      addEnemy(ctx, 300, 0),
      addEnemy(ctx, 400, 0),
    ];

    AbilitySystem.update(ctx, 0.016);

    // Lv1 弹跳 3 → 命中前 3 个敌人，第 4 个不受影响。
    expect(enemies[0]!.status?.shock?.stacks).toBe(cfg.shockStacks);
    expect(enemies[1]!.status?.shock?.stacks).toBe(cfg.shockStacks);
    expect(enemies[2]!.status?.shock?.stacks).toBe(cfg.shockStacks);
    expect(enemies[3]!.status).toBeUndefined();

    // 伤害逐跳按 (1-decay)^j 衰减。
    const d0 = 100000 - enemies[0]!.health!.current;
    const d1 = 100000 - enemies[1]!.health!.current;
    const d2 = 100000 - enemies[2]!.health!.current;
    expect(d0).toBeCloseTo(cfg.damage);
    expect(d1).toBeCloseTo(cfg.damage * (1 - cfg.decay));
    expect(d2).toBeCloseTo(cfg.damage * Math.pow(1 - cfg.decay, 2));

    // 三段弹跳 → 写入 3 条闪电线段。
    expect(ctx.state.bolts.length).toBe(3);
  });

  it('jump count and damage scale with level', () => {
    const ctx = makeCtx();
    addPlayer(ctx, 2);
    const cfg = BALANCE.abilities.chainLightning;
    const enemies = Array.from({ length: 6 }, (_, i) => addEnemy(ctx, 100 + i * 100, 0));

    AbilitySystem.update(ctx, 0.016);

    // Lv2 弹跳 = 3 + 1 = 4 → 命中前 4 个。
    const jumps = cfg.jumps + cfg.perLevel.jumps;
    for (let i = 0; i < jumps; i++) expect(enemies[i]!.status?.shock).toBeDefined();
    expect(enemies[jumps]!.status).toBeUndefined();

    const head = cfg.damage + cfg.perLevel.damage;
    expect(100000 - enemies[0]!.health!.current).toBeCloseTo(head);
  });

  it('stops chaining when next enemy is beyond jumpRange', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const cfg = BALANCE.abilities.chainLightning;
    const a = addEnemy(ctx, 100, 0);
    // 第二个敌人远在 jumpRange 之外 → 不应被链中。
    const b = addEnemy(ctx, 100 + cfg.jumpRange + 50, 0);

    AbilitySystem.update(ctx, 0.016);

    expect(a.status?.shock).toBeDefined();
    expect(b.status).toBeUndefined();
    expect(ctx.state.bolts.length).toBe(1);
  });

  it('retries shortly when no target in range', () => {
    const ctx = makeCtx();
    const p = addPlayer(ctx);
    addEnemy(ctx, 5000, 0);
    AbilitySystem.update(ctx, 0.016);
    expect(ctx.state.bolts.length).toBe(0);
    expect(p.caster!.abilities[0]!.timer).toBeCloseTo(BALANCE.abilities.chainLightning.retry);
  });

  it('shock amplifies subsequent hit damage (易伤生效)', () => {
    const ctx = makeCtx();
    const e = addEnemy(ctx, 0, 0, 100000);
    ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, 'shock', 5, 3); // 满层 5 → +40%
    // 玩家在敌人位置释放，单目标命中。
    ctx.world.add({
      player: true,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      caster: { abilities: [{ id: 'chainLightning', level: 1, timer: 0 }] },
    });

    AbilitySystem.update(ctx, 0.016);

    const cfg = BALANCE.abilities.chainLightning;
    // 首段伤害被 5 层雷殛放大 1.4×（叠加自身这跳前已有的层数）。
    expect(100000 - e.health!.current).toBeCloseTo(cfg.damage * (1 + 5 * 0.08));
  });
});

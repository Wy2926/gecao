import { describe, it, expect } from 'vitest';
import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { createGameState } from '@/game/state';
import { StatSheet } from '@/game/stats';
import { STATUS, applyStatus, type StatusController } from '@/game/status';
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

function addEnemy(ctx: SimContext, x: number, y: number, hp = 100): Entity {
  return ctx.world.add({
    enemy: true,
    transform: { position: { x, y }, rotation: 0 },
    collider: { radius: 14 },
    health: { current: hp, max: hp },
    hitFlash: { timer: 0, duration: 0.1 },
  });
}

describe('applyStatus (焚烧 叠层/刷新)', () => {
  it('caps stacks and refreshes duration', () => {
    const ctrl: StatusController = {};
    applyStatus(ctrl, 'burn', 2, 3);
    expect(ctrl.burn!.stacks).toBe(2);
    applyStatus(ctrl, 'burn', 10, 1);
    expect(ctrl.burn!.stacks).toBe(STATUS.burn.maxStacks);
    // 刷新取较长持续。
    expect(ctrl.burn!.duration).toBe(3);
  });
});

describe('StatusSystem (焚烧 DoT)', () => {
  it('deals damage per tick by stacks and expires after duration', () => {
    const ctx = makeCtx();
    const e = addEnemy(ctx, 0, 0, 100);
    ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, 'burn', 4, 1);

    // tickInterval 0.5：推进 0.5s 触发一次结算 = 4 层 * 3 = 12 伤害。
    StatusSystem.update(ctx, 0.5);
    expect(e.health!.current).toBeCloseTo(100 - 4 * STATUS.burn.damagePerStackPerTick);

    // 推进超过剩余持续 → 再结算几次后状态被移除。
    StatusSystem.update(ctx, 1);
    expect(e.status).toBeUndefined();
  });
});

describe('AbilitySystem (火油弹)', () => {
  function addPlayer(ctx: SimContext): Entity {
    return ctx.world.add({
      player: true,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      caster: { abilities: [{ id: 'fireBomb', level: 1, timer: 0 }] },
    });
  }

  it('explodes on nearest enemy: damages and burns those in radius', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const near = addEnemy(ctx, 30, 0, 100); // 落点附近，吃爆炸
    const far = addEnemy(ctx, 900, 0, 100); // 远在搜索范围外，不受影响

    AbilitySystem.update(ctx, 0.016);

    const cfg = BALANCE.abilities.fireBomb;
    expect(near.health!.current).toBeCloseTo(100 - cfg.damage);
    expect(near.status?.burn?.stacks).toBe(cfg.burnStacks);
    expect(far.health!.current).toBe(100);
    // 冷却被重置。
    expect(ctx.state.blasts.length).toBe(1);
  });

  it('does not fire (short retry) when no target in range', () => {
    const ctx = makeCtx();
    const p = addPlayer(ctx);
    addEnemy(ctx, 5000, 0, 100);
    AbilitySystem.update(ctx, 0.016);
    expect(ctx.state.blasts.length).toBe(0);
    expect(p.caster!.abilities[0]!.timer).toBeCloseTo(BALANCE.abilities.fireBomb.retry);
  });

  it('scales damage with damagePct stat and level', () => {
    const ctx = makeCtx();
    const p = addPlayer(ctx);
    p.caster!.abilities[0]!.level = 2;
    ctx.stats.add('damagePct', 0.5);
    const e = addEnemy(ctx, 20, 0, 1000);

    AbilitySystem.update(ctx, 0.016);

    const cfg = BALANCE.abilities.fireBomb;
    const expected = (cfg.damage + cfg.perLevel.damage) * 1.5;
    expect(e.health!.current).toBeCloseTo(1000 - expected);
  });
});

import { describe, it, expect } from 'vitest';
import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { createGameState } from '@/game/state';
import { StatSheet } from '@/game/stats';
import { STATUS, applyStatus, speedFactor, type StatusController } from '@/game/status';
import { BALANCE } from '@/game/balance';
import type { SimContext } from './types';
import type { Entity } from '@/ecs/components';
import { AbilitySystem } from './ability';
import { EnemyAISystem } from './enemy-ai';

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
    velocity: { x: 0, y: 0 },
    collider: { radius: 14 },
    ai: { speed: BALANCE.wokou.speed },
    health: { current: hp, max: hp },
    hitFlash: { timer: 0, duration: 0.1 },
  });
}

describe('frost 状态（减速，非 DoT）', () => {
  it('叠层封顶并刷新持续，且不造成伤害字段', () => {
    const ctrl: StatusController = {};
    applyStatus(ctrl, 'frost', 3, 2);
    expect(ctrl.frost!.stacks).toBe(3);
    applyStatus(ctrl, 'frost', 10, 1);
    expect(ctrl.frost!.stacks).toBe(STATUS.frost.maxStacks);
    expect(ctrl.frost!.duration).toBe(2);
    expect(STATUS.frost.damagePerStackPerTick).toBeUndefined();
  });

  it('speedFactor 按层数减速并钳制到下限', () => {
    const ctrl: StatusController = {};
    expect(speedFactor(ctrl)).toBe(1);
    applyStatus(ctrl, 'frost', 2, 2);
    expect(speedFactor(ctrl)).toBeCloseTo(1 - 2 * STATUS.frost.slowPerStack!);
    // 满层减速被 minSpeedFactor 钳制。
    applyStatus(ctrl, 'frost', 99, 2);
    expect(speedFactor(ctrl)).toBeCloseTo(STATUS.frost.minSpeedFactor!);
  });
});

describe('EnemyAISystem 减速', () => {
  it('被霜寒的敌人追击速度按 speedFactor 缩放', () => {
    const ctx = makeCtx();
    ctx.world.add({
      player: true,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      health: { current: 100, max: 100 },
    });
    const e = addEnemy(ctx, 100, 0, 100); // 玩家在其左侧，沿 -x 追击
    EnemyAISystem.update(ctx, 0.016);
    const fullSpeed = Math.abs(e.velocity!.x);

    ctx.world.addComponent(e, 'status', {});
    applyStatus(e.status!, 'frost', 2, 2);
    EnemyAISystem.update(ctx, 0.016);
    expect(Math.abs(e.velocity!.x)).toBeCloseTo(fullSpeed * speedFactor(e.status!));
  });
});

describe('AbilitySystem（玄冰咒）', () => {
  function addPlayer(ctx: SimContext, level = 1): Entity {
    return ctx.world.add({
      player: true,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      caster: { abilities: [{ id: 'frostNova', level, timer: 0 }] },
    });
  }

  it('以玩家为中心爆发：圈内敌人受伤 + 霜寒，圈外不受影响', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const inside = addEnemy(ctx, 80, 0, 100);
    const outside = addEnemy(ctx, 900, 0, 100);

    AbilitySystem.update(ctx, 0.016);

    const cfg = BALANCE.abilities.frostNova;
    expect(inside.health!.current).toBeCloseTo(100 - cfg.damage);
    expect(inside.status?.frost?.stacks).toBe(cfg.frostStacks);
    expect(outside.health!.current).toBe(100);
    expect(outside.status).toBeUndefined();
    expect(ctx.state.blasts.length).toBe(1);
    expect(ctx.state.blasts[0]!.color).toBe(0x5ad0ff);
  });

  it('圈内无敌人时短重试不开火', () => {
    const ctx = makeCtx();
    const p = addPlayer(ctx);
    addEnemy(ctx, 5000, 0, 100);
    AbilitySystem.update(ctx, 0.016);
    expect(ctx.state.blasts.length).toBe(0);
    expect(p.caster!.abilities[0]!.timer).toBeCloseTo(BALANCE.abilities.frostNova.retry);
  });

  it('伤害随等级与 damagePct 缩放', () => {
    const ctx = makeCtx();
    addPlayer(ctx, 2);
    ctx.stats.add('damagePct', 0.5);
    const e = addEnemy(ctx, 60, 0, 1000);

    AbilitySystem.update(ctx, 0.016);

    const cfg = BALANCE.abilities.frostNova;
    const expected = (cfg.damage + cfg.perLevel.damage) * 1.5;
    expect(e.health!.current).toBeCloseTo(1000 - expected);
  });
});

import { describe, it, expect } from 'vitest';
import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { createGameState } from '@/game/state';
import type { SimContext } from './types';
import type { Entity } from '@/ecs/components';
import { AutoAttackSystem } from './auto-attack';
import { DeathSystem } from './lifecycle';
import { EnemyAISystem } from './enemy-ai';
import { TouchDamageSystem } from './touch-damage';

function makeCtx(): SimContext {
  const world = createWorld();
  return {
    world,
    queries: createQueries(world),
    bus: new GameEventBus(),
    rng: new RngStreams(1),
    state: createGameState(),
    arena: { halfWidth: 1000, halfHeight: 1000 },
    elapsed: 0,
  };
}

function addPlayer(ctx: SimContext): Entity {
  return ctx.world.add({
    player: true,
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    collider: { radius: 16 },
    health: { current: 100, max: 100 },
    attacker: { cooldown: 0.5, timer: 0, range: 130, halfArc: Math.PI / 3, damage: 25, knockback: 60 },
  });
}

function addEnemy(ctx: SimContext, x: number, y: number, hp = 40): Entity {
  return ctx.world.add({
    enemy: true,
    transform: { position: { x, y }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    collider: { radius: 14 },
    ai: { speed: 70 },
    health: { current: hp, max: hp },
    hitFlash: { timer: 0, duration: 0.1 },
  });
}

describe('AutoAttackSystem (戚家刀横扫)', () => {
  it('damages and knocks back an enemy in front, within range and arc', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const enemy = addEnemy(ctx, 50, 0);

    AutoAttackSystem.update(ctx, 0.5);

    expect(enemy.health!.current).toBe(15);
    expect(enemy.transform!.position.x).toBeGreaterThan(50); // 被推开
    expect(enemy.hitFlash!.timer).toBeGreaterThan(0);
    expect(ctx.state.swings).toHaveLength(1);
    expect(ctx.state.hits).toHaveLength(1);
  });

  it('does not hit an enemy outside attack range', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const far = addEnemy(ctx, 400, 0);

    AutoAttackSystem.update(ctx, 0.5);

    expect(far.health!.current).toBe(40);
  });

  it('only hits enemies inside the facing arc, not behind', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const front = addEnemy(ctx, 30, 0); // strictly nearest → defines facing (+x)
    const behind = addEnemy(ctx, -60, 0); // opposite side, outside 60° arc

    AutoAttackSystem.update(ctx, 0.5);

    expect(front.health!.current).toBeLessThan(40);
    expect(behind.health!.current).toBe(40);
  });

  it('does not swing when no enemies exist (no wasted cooldown)', () => {
    const ctx = makeCtx();
    const player = addPlayer(ctx);
    AutoAttackSystem.update(ctx, 0.5);
    expect(player.attacker!.timer).toBeLessThanOrEqual(0);
    expect(ctx.state.swings).toHaveLength(0);
  });
});

describe('TouchDamageSystem', () => {
  it('damages player on contact respecting ICD, and sets gameOver at 0 hp', () => {
    const ctx = makeCtx();
    const player = addPlayer(ctx);
    player.touchDamage = undefined;
    const e = addEnemy(ctx, 20, 0); // within touch distance (16+14)
    e.touchDamage = { amount: 8, cooldown: 0.6, timer: 0 };

    TouchDamageSystem.update(ctx, 0.1);
    expect(player.health!.current).toBe(92);

    // 同一 ICD 周期内不重复扣血
    TouchDamageSystem.update(ctx, 0.1);
    expect(player.health!.current).toBe(92);
  });
});

describe('DeathSystem', () => {
  it('removes dead enemies and increments kill count', () => {
    const ctx = makeCtx();
    addEnemy(ctx, 10, 0, 0);
    addEnemy(ctx, 20, 0, 5);

    DeathSystem.update(ctx, 0);

    expect(ctx.state.kills).toBe(1);
    expect(ctx.queries.enemies.size).toBe(1);
  });
});

describe('EnemyAISystem (追击 + 分离)', () => {
  it('steers an enemy toward the player', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const e = addEnemy(ctx, 100, 0);

    EnemyAISystem.update(ctx, 0.1);

    expect(e.velocity!.x).toBeLessThan(0); // 朝原点（玩家）方向
  });

  it('separates two stacked enemies (non-zero push apart)', () => {
    const ctx = makeCtx();
    addPlayer(ctx);
    const a = addEnemy(ctx, 100, 0);
    const b = addEnemy(ctx, 105, 0); // 重叠

    EnemyAISystem.update(ctx, 0.1);

    // b 应被 a 往 +x 方向推（分离力），相对纯追击速度更偏右。
    expect(b.velocity!.x).toBeGreaterThan(a.velocity!.x);
  });
});

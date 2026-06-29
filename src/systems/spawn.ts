import type { System, SimContext } from './types';
import { BALANCE } from '@/game/balance';
import { TAU } from '@/core/math';

/** 刷怪时间轴：随时间提高频率，在玩家四周环上生成倭寇（用 spawn 子流，可复现）。 */
export const SpawnSystem: System = {
  name: 'SpawnSystem',
  update(ctx: SimContext, dt: number): void {
    if (ctx.state.gameOver) return;
    const player = ctx.queries.player.first;
    if (!player) return;

    const cfg = BALANCE.spawn;
    const interval = Math.max(
      cfg.minInterval,
      cfg.interval - ctx.elapsed * cfg.rampPerSecond,
    );

    ctx.state.spawnTimer -= dt;
    if (ctx.state.spawnTimer > 0) return;
    ctx.state.spawnTimer += interval;

    if (ctx.queries.enemies.size >= cfg.maxAlive) return;

    const rng = ctx.rng.stream('spawn');
    const angle = rng.float() * TAU;
    const px = player.transform.position.x + Math.cos(angle) * cfg.ring;
    const py = player.transform.position.y + Math.sin(angle) * cfg.ring;

    const w = BALANCE.wokou;
    ctx.world.add({
      enemy: true,
      faction: { faction: 'enemy' },
      transform: { position: { x: px, y: py }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      collider: { radius: w.radius },
      ai: { speed: w.speed },
      health: { current: w.maxHp, max: w.maxHp },
      touchDamage: { amount: w.touchDamage, cooldown: w.touchCooldown, timer: 0 },
      hitFlash: { timer: 0, duration: 0.12 },
      renderable: { spriteKey: 'enemy.wokou', prevPosition: { x: px, y: py } },
    });
  },
};

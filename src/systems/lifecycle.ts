import type { System, SimContext } from './types';

/** 受击闪白计时衰减（表现由场景读取 hitFlash.timer 着色）。 */
export const HitFlashSystem: System = {
  name: 'HitFlashSystem',
  update(ctx: SimContext, dt: number): void {
    for (const e of ctx.queries.enemies) {
      if (e.hitFlash && e.hitFlash.timer > 0) {
        e.hitFlash.timer = Math.max(0, e.hitFlash.timer - dt);
      }
    }
  },
};

/** 清理死亡敌人并累计击杀。 */
export const DeathSystem: System = {
  name: 'DeathSystem',
  update(ctx: SimContext): void {
    const dead = ctx.queries.enemies.entities.filter(
      (e) => e.health && e.health.current <= 0,
    );
    for (const e of dead) {
      ctx.world.remove(e);
      ctx.state.kills++;
    }
  },
};

/** 把实体限制在竞技场边界内（玩家与敌人都受限）。 */
export const ArenaBoundsSystem: System = {
  name: 'ArenaBoundsSystem',
  update(ctx: SimContext): void {
    const { halfWidth, halfHeight } = ctx.arena;
    for (const e of ctx.queries.moving) {
      const p = e.transform.position;
      if (p.x < -halfWidth) p.x = -halfWidth;
      else if (p.x > halfWidth) p.x = halfWidth;
      if (p.y < -halfHeight) p.y = -halfHeight;
      else if (p.y > halfHeight) p.y = halfHeight;
    }
  },
};

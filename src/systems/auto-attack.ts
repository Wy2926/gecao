import type { System, SimContext } from './types';
import { angleDelta } from '@/core/math';

/**
 * 戚家刀自动横扫：冷却到了朝最近敌人方向挥出扇形，对扇形内敌人造成伤害+击退，
 * 并写入横扫/命中表现缓冲供场景播放（逻辑不碰渲染）。
 */
export const AutoAttackSystem: System = {
  name: 'AutoAttackSystem',
  update(ctx: SimContext, dt: number): void {
    if (ctx.state.gameOver) return;
    const enemies = ctx.queries.enemies.entities;

    for (const a of ctx.queries.attackers) {
      const atk = a.attacker!;
      atk.timer -= dt;
      if (atk.timer > 0) continue;

      const origin = a.transform!.position;
      // 找最近敌人决定挥砍朝向。
      let nearest: (typeof enemies)[number] | undefined;
      let nearestD2 = Infinity;
      for (const e of enemies) {
        const dx = e.transform!.position.x - origin.x;
        const dy = e.transform!.position.y - origin.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearest = e;
        }
      }
      if (!nearest) continue; // 没有目标则不空挥，等下一帧。

      atk.timer = atk.cooldown;
      const facing = Math.atan2(
        nearest.transform!.position.y - origin.y,
        nearest.transform!.position.x - origin.x,
      );
      a.transform!.rotation = facing;

      const combat = ctx.rng.stream('combat');
      const rangeWithRadius = atk.range;
      for (const e of enemies) {
        const dx = e.transform!.position.x - origin.x;
        const dy = e.transform!.position.y - origin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rangeWithRadius + e.collider!.radius) continue;
        const ang = Math.atan2(dy, dx);
        if (angleDelta(ang, facing) > atk.halfArc) continue;

        const crit = combat.chance(atk.critChance);
        e.health!.current -= crit ? atk.damage * atk.critMult : atk.damage;
        if (e.hitFlash) e.hitFlash.timer = e.hitFlash.duration;
        // 击退：沿命中方向推开。
        if (dist > 0) {
          e.transform!.position.x += (dx / dist) * atk.knockback;
          e.transform!.position.y += (dy / dist) * atk.knockback;
        }
        ctx.state.hits.push({ x: e.transform!.position.x, y: e.transform!.position.y, crit });
      }

      ctx.state.swings.push({
        x: origin.x,
        y: origin.y,
        angle: facing,
        halfArc: atk.halfArc,
        range: atk.range,
      });
    }
  },
};

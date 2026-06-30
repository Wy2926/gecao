import type { System, SimContext } from './types';
import { BALANCE } from '@/game/balance';
import { normalize } from '@/core/math';
import { speedFactor } from '@/game/status';

/**
 * 敌人 AI：朝玩家追击 + 同类分离力（boids separation）防堆叠（A 档）。
 * 输出写入 velocity，由 MovementSystem 积分。
 */
export const EnemyAISystem: System = {
  name: 'EnemyAISystem',
  update(ctx: SimContext): void {
    const player = ctx.queries.player.first;
    if (!player) return;
    const target = player.transform.position;
    const sep = BALANCE.wokou.separation;

    const enemies = ctx.queries.enemies.entities;
    for (const e of enemies) {
      const pos = e.transform!.position;
      const toTarget = normalize(target.x - pos.x, target.y - pos.y);

      let sx = 0;
      let sy = 0;
      const r = e.collider!.radius;
      // 邻近同类施加分离力（O(n^2)，M1 规模可接受；M3 引入空间网格优化）。
      for (const o of enemies) {
        if (o === e) continue;
        const op = o.transform!.position;
        const dx = pos.x - op.x;
        const dy = pos.y - op.y;
        const d2 = dx * dx + dy * dy;
        const minDist = r + o.collider!.radius;
        if (d2 > 0 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          sx += (dx / d) * (1 - d / minDist);
          sy += (dy / d) * (1 - d / minDist);
        }
      }

      // 霜寒等减速状态按层数缩放追击速度（分离力不受影响，避免叠堆）。
      const speed = e.ai!.speed * (e.status ? speedFactor(e.status) : 1);
      e.velocity!.x = toTarget.x * speed + sx * sep;
      e.velocity!.y = toTarget.y * speed + sy * sep;
      e.transform!.rotation = Math.atan2(toTarget.y, toTarget.x);
    }
  },
};

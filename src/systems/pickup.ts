import type { System, SimContext } from './types';
import { BALANCE } from '@/game/balance';
import { xpForLevel } from '@/game/state';
import { rollDraft } from '@/content/cards';

/**
 * 经验球吸附 + 拾取 + 升级判定：
 * - 进入 magnetRadius 的经验球朝玩家加速（velocity 由 MovementSystem 积分）；
 * - 进入 pickupRadius 即被拾取，累加经验，并按经验曲线结算升级（可连升），
 *   每升一级给抽卡队列 +1（draft.pending）。
 */
export const PickupSystem: System = {
  name: 'PickupSystem',
  update(ctx: SimContext): void {
    if (ctx.state.gameOver) return;
    const player = ctx.queries.player.first;
    if (!player) return;
    const pp = player.transform.position;
    const pr = player.collider?.radius ?? 16;
    const cfg = BALANCE.xp;

    let gained = 0;
    // 复制一份再遍历：拾取时会从原型数组移除实体，避免边删边遍历漏元素。
    for (const orb of [...ctx.queries.pickups.entities]) {
      const op = orb.transform!.position;
      const dx = pp.x - op.x;
      const dy = pp.y - op.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= pr + cfg.pickupRadius) {
        gained += orb.pickup!.amount;
        ctx.world.remove(orb);
        continue;
      }
      if (orb.velocity) {
        if (dist <= orb.pickup!.magnetRadius && dist > 0) {
          orb.velocity.x = (dx / dist) * cfg.magnetSpeed;
          orb.velocity.y = (dy / dist) * cfg.magnetSpeed;
        } else {
          orb.velocity.x = 0;
          orb.velocity.y = 0;
        }
      }
    }

    if (gained > 0) {
      const prog = ctx.state.progression;
      prog.xp += gained;
      while (prog.xp >= prog.xpToNext) {
        prog.xp -= prog.xpToNext;
        prog.level++;
        prog.xpToNext = xpForLevel(prog.level);
        ctx.state.draft.pending++;
      }
    }
  },
};

/** 打开一次三选一抽卡（用 draft 子流，保证同种子可复现）。 */
export function openDraft(ctx: SimContext): void {
  const rng = ctx.rng.stream('draft');
  const draft = ctx.state.draft;
  draft.options = rollDraft(rng, 3);
  draft.rerollsLeft = 1;
  draft.active = true;
}

/** 有待处理升级且当前无抽卡进行时，打开三选一。 */
export const DraftSystem: System = {
  name: 'DraftSystem',
  update(ctx: SimContext): void {
    const draft = ctx.state.draft;
    if (!draft.active && draft.pending > 0) openDraft(ctx);
  },
};

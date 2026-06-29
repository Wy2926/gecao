import type { System, SimContext } from './types';
import { MovementSystem } from './movement';

export type { System, SimContext };

/**
 * 系统流水线顺序（09 第八节）。M0 仅含运动；
 * 后续按序插入：Input→Ability→Movement→Collision→Damage→Status→Augment→Cleanup→RenderSync。
 */
export const SYSTEM_PIPELINE: readonly System[] = [MovementSystem];

export function runPipeline(pipeline: readonly System[], ctx: SimContext, dt: number): void {
  for (const system of pipeline) {
    system.update(ctx, dt);
  }
  ctx.bus.flush();
}

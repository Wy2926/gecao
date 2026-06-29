import type { System, SimContext } from './types';

/** 按速度积分位置；记录 prevPosition 供渲染插值。 */
export const MovementSystem: System = {
  name: 'MovementSystem',
  update(ctx: SimContext, dt: number): void {
    for (const e of ctx.queries.moving) {
      if (e.renderable) {
        e.renderable.prevPosition.x = e.transform.position.x;
        e.renderable.prevPosition.y = e.transform.position.y;
      }
      e.transform.position.x += e.velocity.x * dt;
      e.transform.position.y += e.velocity.y * dt;
    }
  },
};

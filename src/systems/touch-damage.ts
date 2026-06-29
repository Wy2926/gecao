import type { System, SimContext } from './types';

/** 倭寇贴近玩家时按 ICD 持续造成接触伤害；玩家血尽则 gameOver。 */
export const TouchDamageSystem: System = {
  name: 'TouchDamageSystem',
  update(ctx: SimContext, dt: number): void {
    if (ctx.state.gameOver) return;
    const player = ctx.queries.player.first;
    if (!player) return;
    const pp = player.transform.position;
    const pr = player.collider?.radius ?? 16;

    for (const e of ctx.queries.enemies) {
      const td = e.touchDamage;
      if (!td) continue;
      td.timer -= dt;
      const dx = e.transform.position.x - pp.x;
      const dy = e.transform.position.y - pp.y;
      const touchDist = pr + e.collider.radius;
      if (dx * dx + dy * dy <= touchDist * touchDist && td.timer <= 0) {
        td.timer = td.cooldown;
        player.health.current -= td.amount;
        if (player.health.current <= 0) {
          player.health.current = 0;
          ctx.state.gameOver = true;
        }
      }
    }
  },
};

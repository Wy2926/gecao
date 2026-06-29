import type { System, SimContext } from './types';
import { STATUS, type StatusKind } from '@/game/status';

/**
 * 异常状态结算（M3）：按 tick 推进每个实体的状态。
 * - 焚烧（burn）：每 tick 按层数造成伤害（致死交给 DeathSystem 统一清理 + 掉落经验球）。
 * - 持续时间归零则移除该状态；状态全空则摘除组件。
 */
export const StatusSystem: System = {
  name: 'StatusSystem',
  update(ctx: SimContext, dt: number): void {
    // 复制后遍历：结算中可能摘除 status 组件触发原型重索引。
    for (const e of [...ctx.queries.afflicted.entities]) {
      const ctrl = e.status!;
      let any = false;
      for (const key of Object.keys(ctrl) as StatusKind[]) {
        const st = ctrl[key];
        if (!st) continue;
        const def = STATUS[key];
        st.duration -= dt;
        st.tickTimer -= dt;
        while (st.tickTimer <= 0) {
          if (key === 'burn') e.health!.current -= def.damagePerStackPerTick * st.stacks;
          st.tickTimer += def.tickInterval;
        }
        if (st.duration <= 0) delete ctrl[key];
        else any = true;
      }
      if (!any) ctx.world.removeComponent(e, 'status');
    }
  },
};

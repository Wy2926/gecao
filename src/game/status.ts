/**
 * 异常状态系统（M3，09 §异常状态 / 03-skills-pool）——MVP 子集：焚烧 DoT。
 *
 * 状态以「层数 + 剩余时长」存于实体的 StatusController；StatusSystem 按 tick 结算
 * （如焚烧每 tick 按层数造成伤害）。绝技/联动只调用 `applyStatus`，与结算解耦。
 */

export type StatusKind = 'burn' | 'frost';

export interface StatusDef {
  /** 最大叠加层数。 */
  maxStacks: number;
  /** 结算间隔（秒）。 */
  tickInterval: number;
  /** 每层每 tick 造成的伤害（仅 DoT 类，无则不掉血）。 */
  damagePerStackPerTick?: number;
  /** 减速类：每层降低的移动速度比例（无则不减速）。 */
  slowPerStack?: number;
  /** 减速下限：移动速度不低于基础值的此比例。 */
  minSpeedFactor?: number;
}

export const STATUS: Record<StatusKind, StatusDef> = {
  burn: { maxStacks: 8, tickInterval: 0.5, damagePerStackPerTick: 3 },
  frost: { maxStacks: 5, tickInterval: 0.5, slowPerStack: 0.12, minSpeedFactor: 0.4 },
};

export interface StatusStack {
  stacks: number;
  /** 剩余持续时间（秒）。 */
  duration: number;
  /** 距下次 tick 结算的剩余时间（秒）。 */
  tickTimer: number;
}

/** 实体身上的异常状态集合（按类别存一份叠层）。 */
export type StatusController = Partial<Record<StatusKind, StatusStack>>;

/** 施加/叠加一个状态：刷新持续时间，层数累加并钳制到上限。 */
export function applyStatus(
  controller: StatusController,
  kind: StatusKind,
  stacks: number,
  duration: number,
): void {
  const def = STATUS[kind];
  const cur = controller[kind];
  if (cur) {
    cur.stacks = Math.min(def.maxStacks, cur.stacks + stacks);
    cur.duration = Math.max(cur.duration, duration);
  } else {
    controller[kind] = {
      stacks: Math.min(def.maxStacks, stacks),
      duration,
      tickTimer: def.tickInterval,
    };
  }
}

/** 综合减速类状态算出移动速度因子（1=不减速），供 AI/移动按需缩放。 */
export function speedFactor(controller: StatusController): number {
  let factor = 1;
  for (const key of Object.keys(controller) as StatusKind[]) {
    const st = controller[key];
    const def = STATUS[key];
    if (!st || !def.slowPerStack) continue;
    const slowed = 1 - def.slowPerStack * st.stacks;
    factor *= Math.max(def.minSpeedFactor ?? 0, slowed);
  }
  return factor;
}

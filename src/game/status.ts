/**
 * 异常状态系统（M3，09 §异常状态 / 03-skills-pool）——MVP 子集：焚烧 DoT、雷殛 易伤。
 *
 * 状态以「层数 + 剩余时长」存于实体的 StatusController；StatusSystem 按 tick 结算
 * （如焚烧每 tick 按层数造成伤害）。绝技/联动只调用 `applyStatus`，与结算解耦。
 */

export type StatusKind = 'burn' | 'shock';

export interface StatusDef {
  /** 最大叠加层数。 */
  maxStacks: number;
  /** 结算间隔（秒）。 */
  tickInterval: number;
  /** 每层每 tick 造成的伤害（仅 DoT 类，无则不掉血）。 */
  damagePerStackPerTick?: number;
  /** 每层使目标受到的伤害提高的比例（易伤类，如雷殛/感电）。 */
  dmgTakenPerStack?: number;
}

/** 数值取自 04-skills-numbers.md §五【异常状态】基准表。 */
export const STATUS: Record<StatusKind, StatusDef> = {
  burn: { maxStacks: 8, tickInterval: 0.5, damagePerStackPerTick: 3 },
  // 雷殛（感电）：受伤 +8%/层，3s，上限 5 层（爆发「落雷范围麻痹」待控制系统接入）。
  shock: { maxStacks: 5, tickInterval: 0.5, dmgTakenPerStack: 0.08 },
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

/** 综合易伤类状态算出「受到伤害」的放大系数（1=无放大），供伤害结算统一乘上。 */
export function incomingDamageFactor(controller: StatusController): number {
  let factor = 1;
  for (const key of Object.keys(controller) as StatusKind[]) {
    const st = controller[key];
    const def = STATUS[key];
    if (!st || !def.dmgTakenPerStack) continue;
    factor += def.dmgTakenPerStack * st.stacks;
  }
  return factor;
}

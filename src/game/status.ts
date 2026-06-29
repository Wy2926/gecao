/**
 * 异常状态系统（M3，09 §异常状态 / 03-skills-pool）——MVP 子集：焚烧 DoT。
 *
 * 状态以「层数 + 剩余时长」存于实体的 StatusController；StatusSystem 按 tick 结算
 * （如焚烧每 tick 按层数造成伤害）。绝技/联动只调用 `applyStatus`，与结算解耦。
 */

export type StatusKind = 'burn';

export interface StatusDef {
  /** 最大叠加层数。 */
  maxStacks: number;
  /** 结算间隔（秒）。 */
  tickInterval: number;
  /** 每层每 tick 造成的伤害（仅 DoT 类）。 */
  damagePerStackPerTick: number;
}

export const STATUS: Record<StatusKind, StatusDef> = {
  burn: { maxStacks: 8, tickInterval: 0.5, damagePerStackPerTick: 3 },
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

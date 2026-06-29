/**
 * 属性表（StatSheet）——M2 数值成长内核（09 StatSheet 乘区管线的 MVP 子集）。
 *
 * 词条/升级只往属性表里累加「修饰量」，由 `applyStats` 把基础值经乘区算成派生值，
 * 写回玩家的 attacker/health 组件与移动速度。换卡=改属性表，战斗系统无需感知卡牌。
 */

import type { Entity } from '@/ecs/components';

/** 可被词条修饰的属性键。 */
export type StatKey =
  | 'damagePct' // 攻击力百分比（磨刀石）
  | 'attackSpeedPct' // 攻速百分比 → 缩短横扫冷却（战意）
  | 'areaPct' // 范围百分比 → 横扫射程（纪效新书）
  | 'critChance' // 暴击率（加法，鹰眼）
  | 'maxHpPct' // 最大生命百分比（铁布衫）
  | 'moveSpeedPct' // 移动速度百分比（疾行）
  | 'cdrPct'; // 冷却缩减（操典）——MVP 暂作用于横扫冷却

export const STAT_KEYS: readonly StatKey[] = [
  'damagePct',
  'attackSpeedPct',
  'areaPct',
  'critChance',
  'maxHpPct',
  'moveSpeedPct',
  'cdrPct',
];

/** 玩家基础数值（乘区前），从 BALANCE 派生，作为属性表的计算起点。 */
export interface PlayerBaseStats {
  maxHp: number;
  moveSpeed: number;
  damage: number;
  cooldown: number;
  range: number;
  halfArc: number;
  knockback: number;
  critChance: number;
  critMult: number;
}

/** 累加各属性修饰量的属性表。get 缺省为 0。 */
export class StatSheet {
  private mods = new Map<StatKey, number>();

  add(key: StatKey, amount: number): void {
    this.mods.set(key, (this.mods.get(key) ?? 0) + amount);
  }

  get(key: StatKey): number {
    return this.mods.get(key) ?? 0;
  }

  /** 快照（调试/HUD/测试用）。 */
  snapshot(): Record<StatKey, number> {
    const out = {} as Record<StatKey, number>;
    for (const k of STAT_KEYS) out[k] = this.get(k);
    return out;
  }
}

/** 派生数值（供战斗系统读取的最终值）。 */
export interface DerivedStats {
  maxHp: number;
  moveSpeed: number;
  damage: number;
  cooldown: number;
  range: number;
  halfArc: number;
  knockback: number;
  critChance: number;
  critMult: number;
}

/** 由基础值 + 属性表算出派生数值（集中乘区，便于测试/调参）。 */
export function deriveStats(base: PlayerBaseStats, sheet: StatSheet): DerivedStats {
  const cooldownDiv = (1 + sheet.get('attackSpeedPct')) * (1 + sheet.get('cdrPct'));
  return {
    maxHp: base.maxHp * (1 + sheet.get('maxHpPct')),
    moveSpeed: base.moveSpeed * (1 + sheet.get('moveSpeedPct')),
    damage: base.damage * (1 + sheet.get('damagePct')),
    cooldown: base.cooldown / cooldownDiv,
    range: base.range * (1 + sheet.get('areaPct')),
    halfArc: base.halfArc,
    knockback: base.knockback,
    critChance: Math.min(1, base.critChance + sheet.get('critChance')),
    critMult: base.critMult,
  };
}

/**
 * 把派生数值写回玩家组件。最大生命变化时按当前血量比例缩放，避免吃满血卡瞬间回满或掉血。
 * 返回派生移动速度（由 Simulation 持有，setPlayerMove 使用）。
 */
export function applyStats(player: Entity, base: PlayerBaseStats, sheet: StatSheet): DerivedStats {
  const d = deriveStats(base, sheet);
  if (player.health) {
    const ratio = player.health.max > 0 ? player.health.current / player.health.max : 1;
    player.health.max = d.maxHp;
    player.health.current = Math.min(d.maxHp, Math.max(0, d.maxHp * ratio));
  }
  if (player.attacker) {
    player.attacker.damage = d.damage;
    player.attacker.cooldown = d.cooldown;
    player.attacker.range = d.range;
    player.attacker.knockback = d.knockback;
    player.attacker.critChance = d.critChance;
    player.attacker.critMult = d.critMult;
  }
  return d;
}

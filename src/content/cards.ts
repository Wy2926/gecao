/**
 * 升级卡池（MVP 词条档）——数据驱动，三选一抽到即往属性表累加修饰量。
 *
 * 这是 10 卡引擎在 MVP 的最小落地：每张卡 = 一条声明式数据（作用属性 + 每层数值）。
 * 后续绝技/联动卡接入同一抽卡通路，只需扩展 `CardKind` 与应用逻辑，UI/抽卡无需改动。
 */

import type { Rng } from '@/core/rng';
import type { StatKey } from '@/game/stats';

export type Rarity = 'common' | 'rare' | 'epic';

/** 稀有度抽取权重（白/蓝/金三档，08 MVP 简化）。 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 0.62,
  rare: 0.3,
  epic: 0.08,
};

/** 稀有度数值倍率：越稀有，单张词条增益越高。 */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.8,
  epic: 3,
};

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xc9d2dd,
  rare: 0x4ea3ff,
  epic: 0xffb23e,
};

export type CardKind = 'term' | 'ability';

/** 词条卡：抽到即往属性表累加修饰量。 */
export interface TermCard {
  id: string;
  kind: 'term';
  /** 作用的属性键。 */
  stat: StatKey;
  /** 数值单位：百分比（0.12=+12%）或绝对值（暴击率 0.05）。 */
  unit: 'pct' | 'flat';
  /** 白卡（common）单层增益，稀有度再乘倍率。 */
  basePerStack: number;
  /** 卡面主题色（UI 用）。 */
  color: number;
}

/** 绝技卡：抽到则获得该绝技，重复抽到则升级（稀有度越高、初始等级越高）。 */
export interface AbilityCard {
  id: string;
  kind: 'ability';
  /** 对应的绝技 id（BALANCE.abilities 键）。 */
  abilityId: string;
  color: number;
}

export type CardDef = TermCard | AbilityCard;

/** MVP 词条池（08 §五：约 6 个托底）。文案走 i18n（card.<id>.name / .desc）。 */
export const CARD_POOL: readonly CardDef[] = [
  {
    id: 'whetstone',
    kind: 'term',
    stat: 'damagePct',
    unit: 'pct',
    basePerStack: 0.12,
    color: 0xe05a3b,
  },
  {
    id: 'morale',
    kind: 'term',
    stat: 'attackSpeedPct',
    unit: 'pct',
    basePerStack: 0.1,
    color: 0xffd24a,
  },
  { id: 'jixiao', kind: 'term', stat: 'areaPct', unit: 'pct', basePerStack: 0.12, color: 0x4ec3a8 },
  {
    id: 'hawkeye',
    kind: 'term',
    stat: 'critChance',
    unit: 'flat',
    basePerStack: 0.05,
    color: 0xff7ad1,
  },
  {
    id: 'ironcloth',
    kind: 'term',
    stat: 'maxHpPct',
    unit: 'pct',
    basePerStack: 0.14,
    color: 0xa05ad0,
  },
  { id: 'drill', kind: 'term', stat: 'cdrPct', unit: 'pct', basePerStack: 0.08, color: 0x5a9ad0 },
  { id: 'fireBomb', kind: 'ability', abilityId: 'fireBomb', color: 0xff7a33 },
  { id: 'skyfire', kind: 'ability', abilityId: 'skyfire', color: 0xff5a3c },
  { id: 'frostNova', kind: 'ability', abilityId: 'frostNova', color: 0x5ad0ff },
] as const;

/** 一个抽卡选项 = 卡 + 本次随机到的稀有度 + 实际数值。 */
export interface DraftOption {
  card: CardDef;
  rarity: Rarity;
  /** 实际增益量（已含稀有度倍率）。 */
  amount: number;
}

const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic'];

/** 按权重抽一个稀有度。 */
function rollRarity(rng: Rng): Rarity {
  const total = RARITIES.reduce((s, r) => s + RARITY_WEIGHT[r], 0);
  let roll = rng.float() * total;
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHT[r];
    if (roll < 0) return r;
  }
  return 'common';
}

/**
 * 选项数值：词条为实际增益量（含稀有度倍率）；绝技为本次获得/提升的等级数。
 * 金卡绝技一次给 2 级，蓝 1 级、白 1 级（以初始强度体现稀有度）。
 */
export function optionAmount(card: CardDef, rarity: Rarity): number {
  if (card.kind === 'ability') return rarity === 'epic' ? 2 : 1;
  return card.basePerStack * RARITY_MULT[rarity];
}

/**
 * 生成 `count` 个互不相同的抽卡选项（用 draft 子流，保证同种子可复现）。
 * 池子不足时取池子全部。
 */
export function rollDraft(rng: Rng, count = 3): DraftOption[] {
  const pool = [...CARD_POOL];
  // Fisher–Yates，用注入的 rng 保证确定性。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const n = Math.min(count, pool.length);
  const out: DraftOption[] = [];
  for (let i = 0; i < n; i++) {
    const card = pool[i]!;
    const rarity = rollRarity(rng);
    out.push({ card, rarity, amount: optionAmount(card, rarity) });
  }
  return out;
}

/** 一局对局的非实体级状态 + 表现缓冲（供场景消费后清空，逻辑保持纯净）。 */

import type { DraftOption } from '@/content/cards';

export interface SwingFx {
  x: number;
  y: number;
  angle: number;
  halfArc: number;
  range: number;
}

export interface HitFx {
  x: number;
  y: number;
  /** 是否暴击（用于更夸张的命中特效）。 */
  crit: boolean;
}

/** 玩家成长进度（经验/等级）。 */
export interface Progression {
  level: number;
  /** 当前等级已累计经验。 */
  xp: number;
  /** 升到下一级所需经验。 */
  xpToNext: number;
}

/** 升级三选一抽卡的运行态。`active` 时场景暂停推进逻辑、弹出选牌。 */
export interface DraftState {
  active: boolean;
  options: DraftOption[];
  /** 剩余免费重抽次数（08：1 次）。 */
  rerollsLeft: number;
  /** 待处理的升级次数（同帧多次升级时排队）。 */
  pending: number;
}

export interface GameState {
  kills: number;
  spawnTimer: number;
  gameOver: boolean;
  progression: Progression;
  draft: DraftState;
  /** 本帧产生的横扫表现，场景读取后清空。 */
  swings: SwingFx[];
  /** 本帧命中点，用于火花特效。 */
  hits: HitFx[];
}

/** 升到 `level` 级（即从 level 升到 level+1）所需经验。 */
export function xpForLevel(level: number): number {
  return Math.floor(5 + level * 3 + Math.pow(level, 1.7));
}

export function createGameState(): GameState {
  return {
    kills: 0,
    spawnTimer: 0,
    gameOver: false,
    progression: { level: 1, xp: 0, xpToNext: xpForLevel(1) },
    draft: { active: false, options: [], rerollsLeft: 0, pending: 0 },
    swings: [],
    hits: [],
  };
}

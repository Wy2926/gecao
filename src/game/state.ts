/** 一局对局的非实体级状态 + 表现缓冲（供场景消费后清空，逻辑保持纯净）。 */

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
}

export interface GameState {
  kills: number;
  spawnTimer: number;
  gameOver: boolean;
  /** 本帧产生的横扫表现，场景读取后清空。 */
  swings: SwingFx[];
  /** 本帧命中点，用于火花特效。 */
  hits: HitFx[];
}

export function createGameState(): GameState {
  return { kills: 0, spawnTimer: 0, gameOver: false, swings: [], hits: [] };
}

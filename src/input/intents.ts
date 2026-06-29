/**
 * 统一输入抽象（B2）：键鼠/手柄/触控都映射到同一"意图"层，
 * 逻辑只消费 Intent，不关心物理输入设备。M0 预埋形状。
 */

export interface MoveIntent {
  /** 归一化方向向量 [-1,1]。 */
  x: number;
  y: number;
}

export interface IntentState {
  move: MoveIntent;
  pause: boolean;
  confirm: boolean;
  cancel: boolean;
}

export function emptyIntentState(): IntentState {
  return {
    move: { x: 0, y: 0 },
    pause: false,
    confirm: false,
    cancel: false,
  };
}

/** 输入源把原始输入翻译成 IntentState 的统一接口。 */
export interface InputSource {
  readonly name: string;
  poll(): IntentState;
}

/**
 * 定步长逻辑循环（09 第八节）：逻辑固定 1/60s 步进，与渲染帧率解耦。
 * 含 spiral-of-death 防护：单帧最多消化 maxSubSteps 步，超出丢弃累积。
 */

export const FIXED_DT = 1 / 60;

export interface FixedStepOptions {
  fixedDt?: number;
  maxSubSteps?: number;
}

export class FixedTimestep {
  readonly fixedDt: number;
  readonly maxSubSteps: number;
  private accumulator = 0;

  constructor(opts: FixedStepOptions = {}) {
    this.fixedDt = opts.fixedDt ?? FIXED_DT;
    this.maxSubSteps = opts.maxSubSteps ?? 5;
  }

  /**
   * 喂入真实帧间隔（秒），回调按固定步长被调用 0..maxSubSteps 次。
   * @returns 实际执行的步数
   */
  advance(frameDt: number, step: (dt: number) => void): number {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      step(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    // 防 spiral-of-death：积压过多则丢弃，避免逻辑越追越卡。
    if (this.accumulator > this.fixedDt * this.maxSubSteps) {
      this.accumulator = 0;
    }
    return steps;
  }

  /** 渲染插值系数 [0,1)。 */
  get alpha(): number {
    return this.accumulator / this.fixedDt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { FixedTimestep } from '@/core/fixed-timestep';
import { SYSTEM_PIPELINE, runPipeline, type SimContext } from '@/systems';

export interface SimulationOptions {
  seed: number;
}

/**
 * 一局对局的纯逻辑模拟核心，**不依赖 Phaser**，可 headless 跑一局做集成测试。
 * 场景层只负责把真实帧 dt 喂给 advance() 并读取实体做渲染。
 */
export class Simulation {
  readonly ctx: SimContext;
  private clock = new FixedTimestep();

  constructor(opts: SimulationOptions) {
    const world = createWorld();
    this.ctx = {
      world,
      queries: createQueries(world),
      bus: new GameEventBus(),
      rng: new RngStreams(opts.seed),
      elapsed: 0,
    };
  }

  /** 喂入真实帧间隔（秒），内部按定步长推进逻辑。返回执行的逻辑步数。 */
  advance(frameDt: number): number {
    return this.clock.advance(frameDt, (dt) => {
      runPipeline(SYSTEM_PIPELINE, this.ctx, dt);
      this.ctx.elapsed += dt;
    });
  }

  /** 渲染插值系数。 */
  get alpha(): number {
    return this.clock.alpha;
  }
}

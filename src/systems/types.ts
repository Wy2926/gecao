import type { GameWorld, Queries } from '@/ecs/world';
import type { GameEventBus } from '@/core/event-bus';
import type { RngStreams } from '@/core/rng';

/** 系统运行上下文：系统只依赖此接口，不直接依赖 Phaser，保证 headless 可跑。 */
export interface SimContext {
  world: GameWorld;
  queries: Queries;
  bus: GameEventBus;
  rng: RngStreams;
  /** 已逝逻辑时间（秒）。 */
  elapsed: number;
}

/** 系统 = 每逻辑步对世界做一次批处理的纯函数式单元。 */
export interface System {
  readonly name: string;
  update(ctx: SimContext, dt: number): void;
}

import type { GameWorld, Queries } from '@/ecs/world';
import type { GameEventBus } from '@/core/event-bus';
import type { RngStreams } from '@/core/rng';
import type { GameState } from '@/game/state';
import type { StatSheet } from '@/game/stats';

/** 系统运行上下文：系统只依赖此接口，不直接依赖 Phaser，保证 headless 可跑。 */
export interface SimContext {
  world: GameWorld;
  queries: Queries;
  bus: GameEventBus;
  rng: RngStreams;
  state: GameState;
  /** 玩家属性表（词条修饰量），绝技/战斗系统读取派生加成。 */
  stats: StatSheet;
  /** 竞技场半边长（玩家与敌人活动范围，以原点为中心的正方形）。 */
  arena: { halfWidth: number; halfHeight: number };
  /** 已逝逻辑时间（秒）。 */
  elapsed: number;
}

/** 系统 = 每逻辑步对世界做一次批处理的纯函数式单元。 */
export interface System {
  readonly name: string;
  update(ctx: SimContext, dt: number): void;
}

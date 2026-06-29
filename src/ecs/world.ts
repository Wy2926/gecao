import { World } from 'miniplex';
import type { Entity } from './components';

/** 全局 ECS 世界类型别名。 */
export type GameWorld = World<Entity>;

export function createWorld(): GameWorld {
  return new World<Entity>();
}

/**
 * 常用查询（archetype）集中定义，供各 System 复用。
 * miniplex 的 with() 返回可迭代的实时归档查询。
 */
export function createQueries(world: GameWorld) {
  return {
    moving: world.with('transform', 'velocity'),
    renderable: world.with('transform', 'renderable'),
    enemies: world.with('enemy', 'transform', 'collider'),
    attackers: world.with('attacker', 'transform'),
    player: world.with('player', 'transform', 'health'),
    pickups: world.with('pickup', 'transform'),
    casters: world.with('caster', 'transform'),
    afflicted: world.with('status', 'health', 'transform'),
  };
}

export type Queries = ReturnType<typeof createQueries>;

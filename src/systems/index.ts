import type { System, SimContext } from './types';
import { MovementSystem } from './movement';
import { SpawnSystem } from './spawn';
import { EnemyAISystem } from './enemy-ai';
import { AutoAttackSystem } from './auto-attack';
import { TouchDamageSystem } from './touch-damage';
import { HitFlashSystem, DeathSystem, ArenaBoundsSystem } from './lifecycle';

export type { System, SimContext };

/**
 * 系统流水线顺序（09 第八节）。M1：刷怪→AI→移动→横扫→接触伤害→边界→闪白→清理。
 * 后续插入：Ability/Collision/Status/Augment/RenderSync 等。
 */
export const SYSTEM_PIPELINE: readonly System[] = [
  SpawnSystem,
  EnemyAISystem,
  MovementSystem,
  AutoAttackSystem,
  TouchDamageSystem,
  ArenaBoundsSystem,
  HitFlashSystem,
  DeathSystem,
];

export function runPipeline(pipeline: readonly System[], ctx: SimContext, dt: number): void {
  for (const system of pipeline) {
    system.update(ctx, dt);
  }
  ctx.bus.flush();
}

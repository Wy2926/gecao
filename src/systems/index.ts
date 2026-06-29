import type { System, SimContext } from './types';
import { MovementSystem } from './movement';
import { SpawnSystem } from './spawn';
import { EnemyAISystem } from './enemy-ai';
import { AutoAttackSystem } from './auto-attack';
import { TouchDamageSystem } from './touch-damage';
import { PickupSystem, DraftSystem } from './pickup';
import { AbilitySystem } from './ability';
import { StatusSystem } from './status';
import { HitFlashSystem, DeathSystem, ArenaBoundsSystem } from './lifecycle';

export type { System, SimContext };

/**
 * 系统流水线顺序（09 第八节）。
 * 刷怪→AI→拾取(吸附/升级)→移动→横扫→绝技→异常状态→接触伤害→边界→闪白→清理(掉落)→抽卡。
 * 后续插入：Collision/Augment/RenderSync 等。
 */
export const SYSTEM_PIPELINE: readonly System[] = [
  SpawnSystem,
  EnemyAISystem,
  PickupSystem,
  MovementSystem,
  AutoAttackSystem,
  AbilitySystem,
  StatusSystem,
  TouchDamageSystem,
  ArenaBoundsSystem,
  HitFlashSystem,
  DeathSystem,
  DraftSystem,
];

export function runPipeline(pipeline: readonly System[], ctx: SimContext, dt: number): void {
  for (const system of pipeline) {
    system.update(ctx, dt);
  }
  ctx.bus.flush();
}

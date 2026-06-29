/**
 * ECS 组件定义（09 第二节之二）。组件 = 纯数据。
 * M0 仅预埋核心若干组件；随里程碑增补（StatSheet/Status/AbilityRuntime/MovementBehavior…）。
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Transform {
  position: Vec2;
  /** 朝向弧度 */
  rotation: number;
}

export interface Velocity {
  x: number;
  y: number;
}

/** 阵营，用于敌我判定与渲染区分。 */
export type Faction = 'player' | 'enemy' | 'neutral';

export interface FactionTag {
  faction: Faction;
}

/** 简单生命值（完整数值表 StatSheet 在 M2 接入）。 */
export interface Health {
  current: number;
  max: number;
}

/** 渲染同步信息：逻辑层只存渲染 key，由 RenderSyncSystem 桥接到 Phaser。 */
export interface Renderable {
  /** AssetRegistry 中的精灵/动画 key（M0 用占位）。 */
  spriteKey: string;
  /** 上一逻辑步的位置，供渲染插值。 */
  prevPosition: Vec2;
}

/**
 * 实体 = 组件的部分集合。miniplex 以对象存组件，缺省即不具备该组件。
 */
export interface Entity {
  transform?: Transform;
  velocity?: Velocity;
  faction?: FactionTag;
  health?: Health;
  renderable?: Renderable;
  /** 标记为玩家控制实体。 */
  player?: true;
}

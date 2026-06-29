/**
 * ECS 组件定义（09 第二节之二）。组件 = 纯数据。
 * M1 增补战斗所需组件；完整数值表 StatSheet 在 M2 接入。
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

export interface Health {
  current: number;
  max: number;
}

/** 圆形碰撞体（M1 用圆做命中/分离判定）。 */
export interface Collider {
  radius: number;
}

/** 追击 AI：朝目标移动，叠加同类分离力防堆叠。 */
export interface ChaseAI {
  speed: number;
}

/** 近战自动攻击（戚家刀横扫）：周期性对前方扇形内敌人造成伤害。 */
export interface MeleeAttacker {
  cooldown: number;
  timer: number;
  range: number;
  /** 扇形半角（弧度）。 */
  halfArc: number;
  damage: number;
  knockback: number;
  /** 暴击率 [0,1]（M2 词条注入）。 */
  critChance: number;
  /** 暴击伤害倍率。 */
  critMult: number;
}

/** 可拾取物（M2：经验球）。玩家靠近吸附、接触拾取。 */
export interface Pickup {
  kind: 'xp';
  amount: number;
  /** 进入此半径后被玩家吸附。 */
  magnetRadius: number;
}

/** 接触伤害（倭寇贴近玩家时按 ICD 持续造成伤害）。 */
export interface TouchDamage {
  amount: number;
  cooldown: number;
  timer: number;
}

/** 受击闪白计时（A 档打击感）。 */
export interface HitFlash {
  timer: number;
  duration: number;
}

/** 渲染同步信息：逻辑层只存渲染 key，由场景桥接到 Phaser。 */
export interface Renderable {
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
  collider?: Collider;
  ai?: ChaseAI;
  attacker?: MeleeAttacker;
  pickup?: Pickup;
  touchDamage?: TouchDamage;
  hitFlash?: HitFlash;
  renderable?: Renderable;
  player?: true;
  enemy?: true;
}

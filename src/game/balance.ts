/** M1 数值（占位平衡，完整数值表/成长在 M2 接入）。集中放置便于调参。 */
export const BALANCE = {
  arena: { halfWidth: 1200, halfHeight: 800 },

  player: {
    speed: 200,
    maxHp: 100,
    radius: 16,
  },

  /** 戚家刀横扫：朝最近敌人方向的扇形挥砍。 */
  qijiaSaber: {
    cooldown: 0.7,
    range: 130,
    halfArcDeg: 60,
    damage: 25,
    knockback: 60,
    /** 基础暴击率与暴击倍率（词条可再叠加暴击率）。 */
    critChance: 0.05,
    critMult: 1.6,
  },

  /** 经验球：倭寇死亡掉落，玩家靠近吸附、接触拾取。 */
  xp: {
    /** 每只倭寇掉落的经验值。 */
    perKill: 1,
    /** 经验球半径与拾取/吸附半径。 */
    radius: 7,
    pickupRadius: 22,
    magnetRadius: 150,
    /** 吸附时朝玩家的移动速度。 */
    magnetSpeed: 460,
  },

  wokou: {
    speed: 70,
    maxHp: 40,
    radius: 14,
    touchDamage: 8,
    touchCooldown: 0.6,
    /** 同类分离力强度。 */
    separation: 90,
  },

  spawn: {
    interval: 1.1,
    /** 随时间线性缩短刷怪间隔的下限。 */
    minInterval: 0.35,
    rampPerSecond: 0.004,
    /** 在玩家四周这个半径的环上生成。 */
    ring: 700,
    maxAlive: 220,
  },
} as const;

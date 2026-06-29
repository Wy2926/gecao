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

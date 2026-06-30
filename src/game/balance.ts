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

  /** 绝技：按内部冷却自动释放（M3）。词条 伤害/范围/冷却 会再叠加。 */
  abilities: {
    /** 火油弹：朝最近敌人投掷，落点范围爆炸 + 施加焚烧。 */
    fireBomb: {
      cooldown: 2.6,
      radius: 70,
      damage: 14,
      /** 命中施加的焚烧层数与持续（秒）。 */
      burnStacks: 2,
      burnDuration: 3,
      /** 选取目标的最大搜索半径。 */
      targetRange: 360,
      /** 无目标时的重试间隔。 */
      retry: 0.25,
      /** 每级加成。 */
      perLevel: { damage: 7, radius: 8 },
    },
    /** 神火天降：周期性向随机敌人天降数发火球，落点范围爆炸 + 焚烧。 */
    skyfire: {
      cooldown: 4,
      radius: 60,
      damage: 10,
      burnStacks: 1,
      burnDuration: 3,
      targetRange: 520,
      retry: 0.25,
      /** 基础落雷数；每级 +1。 */
      meteors: 2,
      /** 每级加成。 */
      perLevel: { damage: 5, meteors: 1 },
    },
    /** 玄冰咒：以玩家为中心爆发冰环，范围内敌人受伤 + 霜寒减速。 */
    frostNova: {
      cooldown: 3.2,
      radius: 150,
      damage: 6,
      /** 命中施加的霜寒层数与持续（秒）。 */
      frostStacks: 2,
      frostDuration: 2.5,
      /** 触发所需的最近敌人搜索半径（与爆发半径一致：圈内有敌就放）。 */
      targetRange: 150,
      /** 无目标时的重试间隔。 */
      retry: 0.25,
      /** 每级加成。 */
      perLevel: { damage: 3, radius: 12 },
    },
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

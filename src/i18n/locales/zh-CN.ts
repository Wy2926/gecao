/** 简体中文文案（B1：文本 key 化，便于 Steam 全球化）。 */
export const zhCN = {
  'game.title': '明朝抗倭',
  'menu.start': '开始游戏',
  'hud.level': '等级',
  'hud.kills': '击杀',
  'hud.hp': '生命',
  'hud.time': '时间',
  'hud.xp': '经验',
  'hud.hint': 'WASD / 方向键移动 · 戚家刀自动横扫',
  'game.over': '阵亡',
  'game.restart': '按 R 重新开始',

  'draft.title': '升级！三选一',
  'draft.hint': '点击卡牌或按 1 / 2 / 3 选择',
  'draft.reroll': '重抽（剩 {n}）',
  'rarity.common': '普通',
  'rarity.rare': '稀有',
  'rarity.epic': '史诗',

  'card.whetstone.name': '磨刀石',
  'card.whetstone.desc': '攻击力 +{amount}%',
  'card.morale.name': '战意',
  'card.morale.desc': '攻击速度 +{amount}%',
  'card.jixiao.name': '纪效新书',
  'card.jixiao.desc': '攻击范围 +{amount}%',
  'card.hawkeye.name': '鹰眼',
  'card.hawkeye.desc': '暴击率 +{amount}%',
  'card.ironcloth.name': '铁布衫',
  'card.ironcloth.desc': '最大生命 +{amount}%',
  'card.drill.name': '操典',
  'card.drill.desc': '冷却缩减 +{amount}%',
  'card.fireBomb.name': '火油弹',
  'card.fireBomb.desc': '获得/强化绝技：投掷火油弹，落点范围爆炸并点燃敌人',
  'card.skyfire.name': '神火天降',
  'card.skyfire.desc': '获得/强化绝技：周期向随机敌人天降数发火球，爆炸点燃',
  'card.chainLightning.name': '雷火连环',
  'card.chainLightning.desc':
    '获得/强化绝技：雷球在敌群间连锁弹跳，每跳叠雷殛（受伤加深），伤害逐跳衰减',
} as const;

export type MessageKey = keyof typeof zhCN;

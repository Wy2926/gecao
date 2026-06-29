/** 简体中文文案（B1：文本 key 化，便于 Steam 全球化）。 */
export const zhCN = {
  'game.title': '明朝抗倭',
  'menu.start': '开始游戏',
  'hud.level': '等级',
  'hud.kills': '击杀',
  'hud.hp': '生命',
  'hud.time': '时间',
  'hud.hint': 'WASD / 方向键移动 · 戚家刀自动横扫',
  'game.over': '阵亡',
  'game.restart': '按 R 重新开始',
} as const;

export type MessageKey = keyof typeof zhCN;

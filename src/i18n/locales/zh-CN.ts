/** 简体中文文案（B1：文本 key 化，便于 Steam 全球化）。 */
export const zhCN = {
  'game.title': '明朝抗倭',
  'menu.start': '开始游戏',
  'hud.level': '等级',
  'hud.kills': '击杀',
} as const;

export type MessageKey = keyof typeof zhCN;

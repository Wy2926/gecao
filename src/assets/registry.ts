/**
 * 资源注册表（12-assets.md）：key → 图集/帧动画/粒子/音频。
 * 逻辑只引用 key，"换素材=零逻辑改动"。M0 用占位定义跑通管线。
 */

export interface SpriteAsset {
  kind: 'sprite';
  key: string;
  /** 占位：M0 用纯色矩形，M1+ 替换为真实图集路径。 */
  placeholderColor: number;
  width: number;
  height: number;
}

export type AssetDef = SpriteAsset;

/** MVP 占位资源清单（逐里程碑替换为生产级素材）。 */
export const PLACEHOLDER_ASSETS: readonly AssetDef[] = [
  { kind: 'sprite', key: 'player.daopaishou', placeholderColor: 0xe23b3b, width: 28, height: 28 },
  { kind: 'sprite', key: 'enemy.wokou', placeholderColor: 0x8a7a5c, width: 24, height: 24 },
];

export function getAsset(key: string): AssetDef | undefined {
  return PLACEHOLDER_ASSETS.find((a) => a.key === key);
}

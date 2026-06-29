/**
 * 资源注册表（12-assets.md）：key → 图集/帧动画/粒子/音频。
 * 逻辑只引用 key，"换素材=零逻辑改动"。
 * M1 起接入生产级位图（public/assets/*.png）；缺图时回退占位纯色。
 */

export interface SpriteAsset {
  kind: 'sprite';
  key: string;
  /** 真实贴图路径（相对站点根）。缺省则用 placeholderColor 占位。 */
  texturePath?: string;
  /** 占位纯色（无贴图时使用）。 */
  placeholderColor: number;
  /** 在世界中的绘制尺寸（像素）。 */
  width: number;
  height: number;
}

export interface TileAsset {
  kind: 'tile';
  key: string;
  texturePath: string;
  /** 单块平铺尺寸（像素）。 */
  tileSize: number;
}

export type AssetDef = SpriteAsset | TileAsset;

/** MVP 资源清单（逐里程碑扩充）。 */
export const ASSETS: readonly AssetDef[] = [
  {
    kind: 'sprite',
    key: 'player.daopaishou',
    texturePath: 'assets/player-daopaishou.png',
    placeholderColor: 0xe23b3b,
    width: 44,
    height: 44,
  },
  {
    kind: 'sprite',
    key: 'enemy.wokou',
    texturePath: 'assets/enemy-wokou.png',
    placeholderColor: 0x8a7a5c,
    width: 38,
    height: 38,
  },
  {
    kind: 'tile',
    key: 'ground.watertown',
    texturePath: 'assets/ground-watertown.png',
    tileSize: 256,
  },
];

export function getAsset(key: string): AssetDef | undefined {
  return ASSETS.find((a) => a.key === key);
}

export function getSprite(key: string): SpriteAsset | undefined {
  const a = getAsset(key);
  return a && a.kind === 'sprite' ? a : undefined;
}

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

/** 一段帧动画片段（单行 strip spritesheet）。 */
export interface AnimClipDef {
  /** 动作名（idle/walk/attack…），与逻辑状态对应。 */
  name: string;
  /** strip spritesheet 路径（帧横向排列）。 */
  texturePath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate: number;
  /** 是否循环（idle/walk=true，attack=false 播一次）。 */
  loop: boolean;
}

/**
 * 多动作角色素材：逻辑只引用 key，按状态切动作。
 * 第一段片段为默认（待机）。换素材=改 clips，零逻辑改动。
 */
export interface CharacterAsset {
  kind: 'character';
  key: string;
  /** 世界中的绘制尺寸（像素）。 */
  width: number;
  height: number;
  clips: readonly AnimClipDef[];
}

export type AssetDef = SpriteAsset | TileAsset | CharacterAsset;

/** MVP 资源清单（逐里程碑扩充）。 */
export const ASSETS: readonly AssetDef[] = [
  {
    kind: 'character',
    key: 'player.daopaishou',
    width: 56,
    height: 56,
    clips: [
      {
        name: 'idle',
        texturePath: 'assets/player-idle.png',
        frameWidth: 256,
        frameHeight: 256,
        frameCount: 4,
        frameRate: 6,
        loop: true,
      },
      {
        name: 'walk',
        texturePath: 'assets/player-walk.png',
        frameWidth: 256,
        frameHeight: 256,
        frameCount: 4,
        frameRate: 10,
        loop: true,
      },
      {
        name: 'attack',
        texturePath: 'assets/player-attack.png',
        frameWidth: 256,
        frameHeight: 256,
        frameCount: 6,
        frameRate: 18,
        loop: false,
      },
    ],
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

export function getCharacter(key: string): CharacterAsset | undefined {
  const a = getAsset(key);
  return a && a.kind === 'character' ? a : undefined;
}

/** Phaser 动画 key：`<角色key>:<动作名>`。 */
export function animKey(characterKey: string, clipName: string): string {
  return `${characterKey}:${clipName}`;
}

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

/**
 * 特效图集：一段序列帧（单行 strip spritesheet），不绑定实体，由场景按需播放
 * （挥砍刀光 / 命中火花 / 绝技爆炸 / 异常覆盖…）。`loop` 用于异常覆盖等持续特效。
 */
export interface EffectAsset {
  kind: 'effect';
  key: string;
  texturePath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate: number;
  /** 世界中的默认绘制边长（像素，正方形）；场景可再按范围缩放。 */
  displaySize: number;
  /** 是否循环（异常覆盖=true，一次性命中/爆炸=false）。 */
  loop: boolean;
}

export type AssetDef = SpriteAsset | TileAsset | CharacterAsset | EffectAsset;

/** MVP 资源清单（逐里程碑扩充）。 */
export const ASSETS: readonly AssetDef[] = [
  {
    kind: 'character',
    key: 'player.daopaishou',
    width: 64,
    height: 64,
    clips: [
      {
        name: 'idle',
        texturePath: 'assets/player-idle.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 4,
        frameRate: 6,
        loop: true,
      },
      {
        name: 'walk',
        texturePath: 'assets/player-walk.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 6,
        frameRate: 12,
        loop: true,
      },
      {
        name: 'attack',
        texturePath: 'assets/player-attack.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 8,
        frameRate: 20,
        loop: false,
      },
      {
        name: 'hit',
        texturePath: 'assets/player-hit.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 6,
        frameRate: 18,
        loop: false,
      },
      {
        name: 'death',
        texturePath: 'assets/player-death.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 6,
        frameRate: 10,
        loop: false,
      },
    ],
  },
  {
    kind: 'character',
    key: 'enemy.wokou',
    width: 52,
    height: 52,
    clips: [
      {
        name: 'idle',
        texturePath: 'assets/enemy-idle.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 4,
        frameRate: 6,
        loop: true,
      },
      {
        name: 'walk',
        texturePath: 'assets/enemy-walk.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 4,
        frameRate: 9,
        loop: true,
      },
      {
        name: 'hit',
        texturePath: 'assets/enemy-hit.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 6,
        frameRate: 18,
        loop: false,
      },
      {
        name: 'death',
        texturePath: 'assets/enemy-death.png',
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 6,
        frameRate: 10,
        loop: false,
      },
    ],
  },
  {
    kind: 'tile',
    key: 'ground.watertown',
    texturePath: 'assets/ground-watertown.png',
    tileSize: 256,
  },
  {
    kind: 'sprite',
    key: 'pickup.xp',
    placeholderColor: 0x57e07a,
    width: 14,
    height: 14,
  },

  // 打击感 / 绝技 / 异常 像素帧特效（单行 strip，统一品红抠图，process_pixel.py 产出）。
  {
    kind: 'effect',
    key: 'fx.slash',
    texturePath: 'assets/fx-slash.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 8,
    frameRate: 50,
    displaySize: 128,
    loop: false,
  },
  {
    kind: 'effect',
    key: 'fx.spark',
    texturePath: 'assets/fx-spark.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 40,
    displaySize: 44,
    loop: false,
  },
  {
    kind: 'effect',
    key: 'fx.explosion',
    texturePath: 'assets/fx-explosion.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 8,
    frameRate: 32,
    displaySize: 128,
    loop: false,
  },
  {
    kind: 'effect',
    key: 'fx.shockhit',
    texturePath: 'assets/fx-shockhit.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 40,
    displaySize: 72,
    loop: false,
  },
  {
    kind: 'effect',
    key: 'fx.burn',
    texturePath: 'assets/fx-burn.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 10,
    displaySize: 56,
    loop: true,
  },
  {
    kind: 'effect',
    key: 'fx.shock',
    texturePath: 'assets/fx-shock.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 12,
    displaySize: 60,
    loop: true,
  },

  // 状态图标（焚烧/雷殛）与绝技图标（火油弹/神火天降/雷火连环），用于覆盖指示与 HUD。
  {
    kind: 'sprite',
    key: 'icon.burn',
    texturePath: 'assets/icon-burn.png',
    placeholderColor: 0xff7a33,
    width: 18,
    height: 18,
  },
  {
    kind: 'sprite',
    key: 'icon.shock',
    texturePath: 'assets/icon-shock.png',
    placeholderColor: 0x9a5ad0,
    width: 18,
    height: 18,
  },
  {
    kind: 'sprite',
    key: 'icon.fireBomb',
    texturePath: 'assets/icon-firebomb.png',
    placeholderColor: 0xff7a33,
    width: 40,
    height: 40,
  },
  {
    kind: 'sprite',
    key: 'icon.skyfire',
    texturePath: 'assets/icon-skyfire.png',
    placeholderColor: 0xff9a3c,
    width: 40,
    height: 40,
  },
  {
    kind: 'sprite',
    key: 'icon.chainLightning',
    texturePath: 'assets/icon-chain.png',
    placeholderColor: 0x9a5ad0,
    width: 40,
    height: 40,
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

export function getEffect(key: string): EffectAsset | undefined {
  const a = getAsset(key);
  return a && a.kind === 'effect' ? a : undefined;
}

/** Phaser 特效动画 key。 */
export function effectAnimKey(key: string): string {
  return `${key}:play`;
}

/** Phaser 动画 key：`<角色key>:<动作名>`。 */
export function animKey(characterKey: string, clipName: string): string {
  return `${characterKey}:${clipName}`;
}

import Phaser from 'phaser';
import { Simulation } from '@/game/simulation';
import { KeyboardInputSource } from '@/input/keyboard';
import { ASSETS, getSprite, getCharacter, animKey, type CharacterAsset } from '@/assets/registry';
import { BALANCE } from '@/game/balance';
import { t } from '@/i18n';
import type { Entity } from '@/ecs/components';

const SEED = 0x9e3779b1;

/**
 * M1 战斗场景：刀牌手自动横扫 + 倭寇成波追击 + 相机跟随 + HUD。
 * 仅此处与 Phaser 耦合；逻辑全在 Simulation（headless 可测）。
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private input$!: KeyboardInputSource;

  private sprites = new Map<Entity, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>();
  private playerSprite?: Phaser.GameObjects.Sprite;
  private facingLeft = false;
  private attackTimer = 0;
  private currentClip = '';
  private swingGfx!: Phaser.GameObjects.Graphics;

  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private killsText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;

  private prevHp: number = BALANCE.player.maxHp;

  constructor() {
    super('GameScene');
  }

  preload(): void {
    for (const a of ASSETS) {
      if (a.kind === 'sprite' && a.texturePath) this.load.image(a.key, a.texturePath);
      if (a.kind === 'tile') this.load.image(a.key, a.texturePath);
      if (a.kind === 'character') {
        for (const clip of a.clips) {
          this.load.spritesheet(animKey(a.key, clip.name), clip.texturePath, {
            frameWidth: clip.frameWidth,
            frameHeight: clip.frameHeight,
          });
        }
      }
    }
  }

  create(): void {
    const { halfWidth, halfHeight } = BALANCE.arena;

    // 水乡地表：平铺贴图覆盖整个竞技场。
    this.add
      .tileSprite(0, 0, halfWidth * 2, halfHeight * 2, 'ground.watertown')
      .setOrigin(0.5)
      .setDepth(-10);

    this.swingGfx = this.add.graphics().setDepth(5);

    this.registerAnimations();
    this.sim = new Simulation({ seed: SEED });
    this.input$ = new KeyboardInputSource(this.input.keyboard!);
    this.input.keyboard!.on('keydown-R', () => {
      if (this.sim.ctx.state.gameOver) this.restart();
    });

    // 相机：有界 + 跟随玩家 + 死区。
    const cam = this.cameras.main;
    cam.setBounds(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
    this.syncSprites(1);
    const playerSprite = this.sprites.get(this.sim.player);
    if (playerSprite) cam.startFollow(playerSprite, true, 0.12, 0.12);
    cam.setDeadzone(120, 90);

    this.buildHud();
  }

  /** 为所有角色素材注册帧动画（动作名 → Phaser 动画）。 */
  private registerAnimations(): void {
    for (const a of ASSETS) {
      if (a.kind !== 'character') continue;
      for (const clip of a.clips) {
        const key = animKey(a.key, clip.name);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: clip.frameCount - 1 }),
          frameRate: clip.frameRate,
          repeat: clip.loop ? -1 : 0,
        });
      }
    }
  }

  /** 创建多动作角色精灵：默认播放第一段（待机）。 */
  private createCharacterSprite(c: CharacterAsset): Phaser.GameObjects.Sprite {
    const idle = c.clips[0];
    const sprite = this.add.sprite(0, 0, animKey(c.key, idle.name)).setDepth(1);
    sprite.setDisplaySize(c.width, c.height);
    sprite.play(animKey(c.key, idle.name));
    return sprite;
  }

  /** 按逻辑状态（挥刀/移动/待机）驱动玩家帧动画与朝向翻转。 */
  private updatePlayerAnim(dt: number): void {
    const sprite = this.playerSprite;
    if (!sprite) return;
    const key = 'player.daopaishou';

    this.attackTimer = Math.max(0, this.attackTimer - dt);

    // 本帧发生横扫 → 触发挥刀动画并朝向命中方向。
    const swings = this.sim.ctx.state.swings;
    if (swings.length > 0) {
      const a = swings[swings.length - 1].angle;
      this.facingLeft = Math.cos(a) < 0;
      this.attackTimer = 6 / 18; // attack 帧数 / 帧率
      sprite.play(animKey(key, 'attack')); // 连续横扫则重头播放
      this.currentClip = 'attack';
    }

    const v = this.sim.player.velocity!;
    const moving = Math.hypot(v.x, v.y) > 1;
    if (Math.abs(v.x) > 5) this.facingLeft = v.x < 0;

    if (this.attackTimer <= 0) {
      const want = moving ? 'walk' : 'idle';
      if (this.currentClip !== want) {
        sprite.play(animKey(key, want), true);
        this.currentClip = want;
      }
    }

    sprite.setFlipX(this.facingLeft);
  }

  override update(_time: number, delta: number): void {
    if (this.sim.ctx.state.gameOver) {
      if (!this.overlay) this.showGameOver();
      return;
    }

    const intent = this.input$.poll();
    this.sim.setPlayerMove(intent.move.x, intent.move.y);

    this.sim.advance(delta / 1000);

    this.syncSprites(this.sim.alpha);
    this.updatePlayerAnim(delta / 1000);
    this.drawCombatFx();
    this.updateHud();

    // 受击震屏（A 档打击感）。
    const hp = this.sim.player.health!.current;
    if (hp < this.prevHp) this.cameras.main.shake(110, 0.006);
    this.prevHp = hp;
  }

  /** ECS → Phaser 渲染同步：建/删精灵 + 位置插值 + 受击闪白。 */
  private syncSprites(alpha: number): void {
    const seen = new Set<Entity>();
    for (const e of this.sim.ctx.queries.renderable) {
      seen.add(e);
      let sprite = this.sprites.get(e);
      if (!sprite) {
        const character = getCharacter(e.renderable.spriteKey);
        if (character) {
          sprite = this.createCharacterSprite(character);
          if (e.player) this.playerSprite = sprite as Phaser.GameObjects.Sprite;
        } else {
          const def = getSprite(e.renderable.spriteKey);
          sprite = this.add.image(0, 0, e.renderable.spriteKey).setDepth(0);
          if (def) sprite.setDisplaySize(def.width, def.height);
        }
        this.sprites.set(e, sprite);
      }
      const r = e.renderable;
      const p = e.transform.position;
      sprite.x = r.prevPosition.x + (p.x - r.prevPosition.x) * alpha;
      sprite.y = r.prevPosition.y + (p.y - r.prevPosition.y) * alpha;
      // 角色精灵用翻转表达朝向，不旋转身体；其余精灵跟随逻辑旋转。
      if (e.renderable.spriteKey !== 'player.daopaishou') sprite.rotation = e.transform.rotation;
      const flashing = !!e.hitFlash && e.hitFlash.timer > 0;
      if (flashing) sprite.setTintFill(0xffffff);
      else sprite.clearTint();
    }
    for (const [e, sprite] of this.sprites) {
      if (!seen.has(e)) {
        sprite.destroy();
        this.sprites.delete(e);
      }
    }
  }

  /** 消费本帧横扫/命中表现缓冲，播放扇形挥砍与命中火花。 */
  private drawCombatFx(): void {
    const state = this.sim.ctx.state;
    for (const s of state.swings) {
      const gfx = this.add.graphics().setDepth(5);
      gfx.fillStyle(0xfff2c4, 0.32);
      gfx.slice(s.x, s.y, s.range, s.angle - s.halfArc, s.angle + s.halfArc, false);
      gfx.fillPath();
      gfx.lineStyle(2, 0xffffff, 0.6);
      gfx.beginPath();
      gfx.arc(s.x, s.y, s.range, s.angle - s.halfArc, s.angle + s.halfArc, false);
      gfx.strokePath();
      this.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 160,
        onComplete: () => gfx.destroy(),
      });
    }
    for (const h of state.hits) {
      const spark = this.add.circle(h.x, h.y, 6, 0xffe08a, 0.9).setDepth(6);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 2,
        duration: 180,
        onComplete: () => spark.destroy(),
      });
    }
    state.swings.length = 0;
    state.hits.length = 0;
  }

  private buildHud(): void {
    const pad = 14;
    this.add
      .rectangle(pad, pad, 220, 18, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.hpBarFill = this.add
      .rectangle(pad + 2, pad + 2, 216, 14, 0xd33b3b)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);

    const w = this.scale.width;
    this.killsText = this.add
      .text(w - pad, pad, '', { fontSize: '16px', color: '#f1e6cf' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.timeText = this.add
      .text(w - pad, pad + 22, '', { fontSize: '14px', color: '#b9c2cf' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(w / 2, this.scale.height - 18, t('hud.hint'), {
        fontSize: '13px',
        color: '#9aa6b3',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);

    this.updateHud();
  }

  private updateHud(): void {
    const hp = this.sim.player.health!;
    const ratio = Math.max(0, hp.current / hp.max);
    this.hpBarFill.width = 216 * ratio;
    this.killsText.setText(`${t('hud.kills')} ${this.sim.ctx.state.kills}`);
    this.timeText.setText(`${t('hud.time')} ${Math.floor(this.sim.ctx.elapsed)}s`);
  }

  private showGameOver(): void {
    this.updateHud();
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.55).setOrigin(0).setScrollFactor(0);
    const title = this.add
      .text(w / 2, h / 2 - 16, t('game.over'), { fontSize: '40px', color: '#e23b3b' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const sub = this.add
      .text(w / 2, h / 2 + 30, t('game.restart'), { fontSize: '18px', color: '#f1e6cf' })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.overlay = this.add.container(0, 0, [bg, title, sub]).setDepth(200);
  }

  private restart(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.playerSprite = undefined;
    this.currentClip = '';
    this.attackTimer = 0;
    this.facingLeft = false;
    this.swingGfx.clear();

    this.sim = new Simulation({ seed: SEED });
    this.prevHp = BALANCE.player.maxHp;
    this.syncSprites(1);
    const playerSprite = this.sprites.get(this.sim.player);
    if (playerSprite) this.cameras.main.startFollow(playerSprite, true, 0.12, 0.12);
    this.updateHud();
  }
}

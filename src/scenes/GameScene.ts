import Phaser from 'phaser';
import { Simulation } from '@/game/simulation';
import { KeyboardInputSource } from '@/input/keyboard';
import {
  ASSETS,
  getSprite,
  getCharacter,
  getEffect,
  animKey,
  effectAnimKey,
  type CharacterAsset,
} from '@/assets/registry';
import type { StatusKind } from '@/game/status';
import { BALANCE } from '@/game/balance';
import { t } from '@/i18n';
import type { MessageKey } from '@/i18n/locales/zh-CN';
import { RARITY_COLOR, CARD_POOL } from '@/content/cards';
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
  private animState = new Map<
    Entity,
    { clip: string; faceLeft: boolean; attack: number; hit: number; prevFlash: number }
  >();
  /** 角色最近一帧的元信息，用于实体被移除（死亡）时在原地补播 death 帧。 */
  private charMeta = new Map<
    Entity,
    { key: string; x: number; y: number; faceLeft: boolean; w: number; h: number }
  >();
  /** 异常覆盖序列帧 + 状态图标精灵（随实体跟随，状态消失即销毁）。 */
  private statusFx = new Map<
    Entity,
    Partial<
      Record<StatusKind, { overlay: Phaser.GameObjects.Sprite; icon: Phaser.GameObjects.Image }>
    >
  >();
  private playerDeathPlayed = false;
  private swingGfx!: Phaser.GameObjects.Graphics;

  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  private draftOverlay?: Phaser.GameObjects.Container;

  /** 绝技冷却图标（按绝技 id 复用，新获得时补建）。 */
  private abilityIcons = new Map<
    string,
    { cd: Phaser.GameObjects.Rectangle; lv: Phaser.GameObjects.Text }
  >();

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
      if (a.kind === 'effect') {
        this.load.spritesheet(effectAnimKey(a.key), a.texturePath, {
          frameWidth: a.frameWidth,
          frameHeight: a.frameHeight,
        });
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

    this.ensurePlaceholderTextures();
    this.registerAnimations();
    this.sim = new Simulation({ seed: SEED });
    this.input$ = new KeyboardInputSource(this.input.keyboard!);
    this.input.keyboard!.on('keydown-R', () => {
      if (this.sim.ctx.state.gameOver) this.restart();
    });
    this.input.keyboard!.on('keydown-ONE', () => this.chooseCard(0));
    this.input.keyboard!.on('keydown-TWO', () => this.chooseCard(1));
    this.input.keyboard!.on('keydown-THREE', () => this.chooseCard(2));
    this.input.keyboard!.on('keydown-E', () => this.rerollCards());

    // 相机：有界 + 跟随玩家 + 死区。
    const cam = this.cameras.main;
    cam.setBounds(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
    this.syncSprites(1);
    const playerSprite = this.sprites.get(this.sim.player);
    if (playerSprite) cam.startFollow(playerSprite, true, 0.12, 0.12);
    cam.setDeadzone(120, 90);

    this.buildHud();
  }

  /** 为无贴图的占位 sprite 资源生成纯色纹理（12-assets：缺图回退占位纯色）。 */
  private ensurePlaceholderTextures(): void {
    for (const a of ASSETS) {
      if (a.kind !== 'sprite' || a.texturePath) continue;
      if (this.textures.exists(a.key)) continue;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(a.placeholderColor, 1);
      g.fillCircle(a.width / 2, a.height / 2, a.width / 2);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(a.width / 2, a.height / 2, a.width / 2 - 1);
      g.generateTexture(a.key, a.width, a.height);
      g.destroy();
    }
  }

  /** 为所有角色/特效素材注册帧动画（动作名 → Phaser 动画）。 */
  private registerAnimations(): void {
    for (const a of ASSETS) {
      if (a.kind === 'character') {
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
      if (a.kind === 'effect') {
        const key = effectAnimKey(a.key);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: a.frameCount - 1 }),
          frameRate: a.frameRate,
          repeat: a.loop ? -1 : 0,
        });
      }
    }
  }

  /**
   * 播放一段一次性像素帧特效（刀光/火花/爆炸/雷击），播完自动销毁。
   * 纯表现：不读写任何逻辑状态。
   */
  private playEffect(
    key: string,
    x: number,
    y: number,
    opts?: { rotation?: number; displaySize?: number; depth?: number; additive?: boolean },
  ): void {
    const fx = getEffect(key);
    if (!fx || !this.anims.exists(effectAnimKey(key))) return;
    const s = this.add.sprite(x, y, effectAnimKey(key)).setDepth(opts?.depth ?? 6);
    const ds = opts?.displaySize ?? fx.displaySize;
    s.setDisplaySize(ds, ds);
    if (opts?.rotation !== undefined) s.setRotation(opts.rotation);
    if (opts?.additive) s.setBlendMode(Phaser.BlendModes.ADD);
    s.play(effectAnimKey(key));
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /** 创建多动作角色精灵：默认播放第一段（待机）。 */
  private createCharacterSprite(c: CharacterAsset): Phaser.GameObjects.Sprite {
    const idle = c.clips[0];
    const sprite = this.add.sprite(0, 0, animKey(c.key, idle.name)).setDepth(1);
    sprite.setDisplaySize(c.width, c.height);
    sprite.play(animKey(c.key, idle.name));
    return sprite;
  }

  /**
   * 数据驱动角色帧动画：所有 CharacterAsset 实体按逻辑状态选动作。
   * - 玩家本帧横扫 → 播 attack（朝命中方向）；
   * - 否则速度>1 → walk（循环），静止 → idle（循环）；
   * - 用 flipX 表达左右朝向。缺失的动作回退到第一段。
   */
  private updateAnims(dt: number): void {
    const swings = this.sim.ctx.state.swings;
    const swung = swings.length > 0;
    const swingAngle = swung ? swings[swings.length - 1].angle : 0;

    for (const e of this.sim.ctx.queries.renderable) {
      const character = getCharacter(e.renderable.spriteKey);
      if (!character) continue;
      const sprite = this.sprites.get(e) as Phaser.GameObjects.Sprite | undefined;
      if (!sprite) continue;

      let st = this.animState.get(e);
      if (!st) {
        st = { clip: '', faceLeft: false, attack: 0, hit: 0, prevFlash: 0 };
        this.animState.set(e, st);
      }
      st.attack = Math.max(0, st.attack - dt);
      st.hit = Math.max(0, st.hit - dt);

      const clips = character.clips;
      const has = (name: string): boolean => clips.some((c) => c.name === name);
      const v = e.velocity;
      const moving = !!v && Math.hypot(v.x, v.y) > 1;
      if (v && Math.abs(v.x) > 5) st.faceLeft = v.x < 0;

      // 受击：hitFlash 计时器从 0 跳到峰值即为「本帧新挨打」→ 播一次 hit 顿挫帧。
      const flash = e.hitFlash?.timer ?? 0;
      const newlyHit = flash > st.prevFlash + 1e-4;
      st.prevFlash = flash;
      if (newlyHit && has('hit') && st.hit <= 0) {
        const hc = clips.find((c) => c.name === 'hit')!;
        st.hit = hc.frameCount / hc.frameRate;
        st.attack = 0;
        sprite.play(animKey(character.key, 'hit'), true);
        st.clip = 'hit';
      }

      if (e.player && swung && has('attack') && st.hit <= 0) {
        st.faceLeft = Math.cos(swingAngle) < 0;
        const ac = clips.find((c) => c.name === 'attack')!;
        st.attack = ac.frameCount / ac.frameRate;
        sprite.play(animKey(character.key, 'attack')); // 连续横扫则重头播放
        st.clip = 'attack';
      }

      if (st.attack <= 0 && st.hit <= 0) {
        let want = moving && has('walk') ? 'walk' : 'idle';
        if (!has(want)) want = clips[0].name;
        if (st.clip !== want) {
          sprite.play(animKey(character.key, want), true);
          st.clip = want;
        }
      }

      sprite.setFlipX(st.faceLeft);

      // 记录元信息：实体被移除（死亡）时用于在原地补播 death 帧。
      this.charMeta.set(e, {
        key: character.key,
        x: sprite.x,
        y: sprite.y,
        faceLeft: st.faceLeft,
        w: character.width,
        h: character.height,
      });
    }
  }

  override update(_time: number, delta: number): void {
    if (this.sim.ctx.state.gameOver) {
      if (!this.overlay) this.showGameOver();
      return;
    }

    // 升级三选一进行时定格：暂停推进逻辑，弹出选牌。
    if (this.sim.ctx.state.draft.active) {
      if (!this.draftOverlay) this.showDraft();
      return;
    }
    if (this.draftOverlay) this.hideDraft();

    const intent = this.input$.poll();
    this.sim.setPlayerMove(intent.move.x, intent.move.y);

    this.sim.advance(delta / 1000);

    this.syncSprites(this.sim.alpha);
    this.updateAnims(delta / 1000);
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
      if (!getCharacter(e.renderable.spriteKey)) sprite.rotation = e.transform.rotation;
      const flashing = !!e.hitFlash && e.hitFlash.timer > 0;
      if (flashing) sprite.setTintFill(0xffffff);
      else if (e.status?.burn) sprite.setTint(0xff7a33);
      else if (e.status?.shock) sprite.setTint(0x9a5ad0);
      else sprite.clearTint();

      // 异常覆盖序列帧 + 状态图标，随实体跟随。
      this.syncStatusFx(e, sprite);
    }
    for (const [e, sprite] of this.sprites) {
      if (!seen.has(e)) {
        // 角色实体被移除（仅死亡会移除）→ 在原地补播一次 death 帧。
        this.spawnDeathFx(e);
        sprite.destroy();
        this.sprites.delete(e);
        this.animState.delete(e);
        this.charMeta.delete(e);
        this.clearStatusFx(e);
      }
    }
  }

  /** 死亡补帧：实体被移除时用上一帧元信息在原地播放 death 序列帧。 */
  private spawnDeathFx(e: Entity): void {
    const meta = this.charMeta.get(e);
    if (!meta) return;
    const character = getCharacter(meta.key);
    if (!character) return;
    const death = character.clips.find((c) => c.name === 'death');
    if (!death) return;
    const s = this.add.sprite(meta.x, meta.y, animKey(meta.key, 'death')).setDepth(0);
    s.setDisplaySize(meta.w, meta.h);
    s.setFlipX(meta.faceLeft);
    s.play(animKey(meta.key, 'death'));
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      // 尸体停留片刻再淡出，强化「割草」战果反馈。
      this.tweens.add({
        targets: s,
        alpha: 0,
        delay: 500,
        duration: 400,
        onComplete: () => s.destroy(),
      });
    });
  }

  /** 维护单个实体的异常覆盖特效与状态图标（按 burn/shock 增删）。 */
  private syncStatusFx(
    e: Entity,
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  ): void {
    const kinds: { kind: StatusKind; fx: string; icon: string }[] = [
      { kind: 'burn', fx: 'fx.burn', icon: 'icon.burn' },
      { kind: 'shock', fx: 'fx.shock', icon: 'icon.shock' },
    ];
    let bucket = this.statusFx.get(e);
    let iconRow = 0;
    for (const { kind, fx, icon } of kinds) {
      const active = !!e.status?.[kind];
      const existing = bucket?.[kind];
      if (active && !existing) {
        if (!this.anims.exists(effectAnimKey(fx))) continue;
        const overlay = this.add.sprite(sprite.x, sprite.y, effectAnimKey(fx)).setDepth(3);
        const def = getEffect(fx)!;
        overlay.setDisplaySize(def.displaySize, def.displaySize);
        overlay.play(effectAnimKey(fx));
        const ic = this.add.image(sprite.x, sprite.y, icon).setDepth(8);
        if (this.textures.exists(icon)) ic.setDisplaySize(16, 16);
        if (!bucket) {
          bucket = {};
          this.statusFx.set(e, bucket);
        }
        bucket[kind] = { overlay, icon: ic };
      } else if (!active && existing) {
        existing.overlay.destroy();
        existing.icon.destroy();
        delete bucket![kind];
      }
    }
    // 跟随定位：覆盖居中，图标在头顶按行堆叠。
    bucket = this.statusFx.get(e);
    if (bucket) {
      for (const { kind } of kinds) {
        const cur = bucket[kind];
        if (!cur) continue;
        cur.overlay.setPosition(sprite.x, sprite.y - sprite.displayHeight * 0.1);
        cur.icon.setPosition(sprite.x + iconRow * 18 - 9, sprite.y - sprite.displayHeight * 0.65);
        iconRow++;
      }
    }
  }

  private clearStatusFx(e: Entity): void {
    const bucket = this.statusFx.get(e);
    if (!bucket) return;
    for (const k of Object.keys(bucket) as StatusKind[]) {
      bucket[k]?.overlay.destroy();
      bucket[k]?.icon.destroy();
    }
    this.statusFx.delete(e);
  }

  /** 消费本帧横扫/命中表现缓冲，播放扇形挥砍与命中火花。 */
  private drawCombatFx(): void {
    const state = this.sim.ctx.state;
    const hasSlash = this.anims.exists(effectAnimKey('fx.slash'));
    for (const s of state.swings) {
      if (hasSlash) {
        // 像素刀光：贴图新月开口朝 +x，旋转到挥砍方向，位于身前。
        const fwd = s.range * 0.55;
        this.playEffect('fx.slash', s.x + Math.cos(s.angle) * fwd, s.y + Math.sin(s.angle) * fwd, {
          rotation: s.angle,
          displaySize: s.range * 2.1,
          depth: 5,
          additive: true,
        });
      } else {
        const gfx = this.add.graphics().setDepth(5);
        gfx.fillStyle(0xfff2c4, 0.32);
        gfx.slice(s.x, s.y, s.range, s.angle - s.halfArc, s.angle + s.halfArc, false);
        gfx.fillPath();
        this.tweens.add({ targets: gfx, alpha: 0, duration: 160, onComplete: () => gfx.destroy() });
      }
    }
    for (const h of state.hits) {
      // 像素命中火花：暴击更大更亮，叠加发光。
      this.playEffect('fx.spark', h.x, h.y, {
        displaySize: h.crit ? 88 : 48,
        depth: 7,
        additive: true,
      });
    }
    for (const b of state.blasts) {
      // 像素火爆：贴图按爆炸半径缩放。
      this.playEffect('fx.explosion', b.x, b.y, { displaySize: b.radius * 2.4, depth: 4 });
    }
    for (const bolt of state.bolts) {
      // 雷链连接线（程序化，连接相邻目标）+ 命中点像素雷击爆。
      const gfx = this.add.graphics().setDepth(6);
      gfx.lineStyle(3, 0xc89aff, 0.95);
      gfx.beginPath();
      gfx.moveTo(bolt.x1, bolt.y1);
      gfx.lineTo(bolt.x2, bolt.y2);
      gfx.strokePath();
      this.tweens.add({ targets: gfx, alpha: 0, duration: 200, onComplete: () => gfx.destroy() });
      this.playEffect('fx.shockhit', bolt.x2, bolt.y2, {
        displaySize: 72,
        depth: 7,
        additive: true,
      });
    }
    state.swings.length = 0;
    state.hits.length = 0;
    state.blasts.length = 0;
    state.bolts.length = 0;
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

    // 经验条（血条下方更细的一条）。
    this.add
      .rectangle(pad, pad + 24, 220, 10, 0x000000, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.xpBarFill = this.add
      .rectangle(pad + 2, pad + 26, 216, 6, 0x4ea3ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(101);
    this.levelText = this.add
      .text(pad, pad + 38, '', { fontSize: '14px', color: '#f1e6cf' })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);

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
    this.hpBarFill.width = 216 * Math.max(0, hp.current / hp.max);
    const prog = this.sim.ctx.state.progression;
    this.xpBarFill.width = 216 * Math.max(0, Math.min(1, prog.xp / prog.xpToNext));
    this.levelText.setText(`${t('hud.level')} ${prog.level}`);
    this.killsText.setText(`${t('hud.kills')} ${this.sim.ctx.state.kills}`);
    this.timeText.setText(`${t('hud.time')} ${Math.floor(this.sim.ctx.elapsed)}s`);
    this.updateAbilityIcons();
  }

  /**
   * 左下角绝技冷却条：每个已拥有绝技一格，遮罩高度表示剩余冷却（满=就绪）。
   * 绝技通过抽卡动态获得，故按需补建图标。
   */
  private updateAbilityIcons(): void {
    const abilities = this.sim.player.caster?.abilities;
    if (!abilities) return;
    const size = 40;
    const gap = 8;
    const x0 = 16;
    const y0 = this.scale.height - 64;
    const cdr = 1 + this.sim.ctx.stats.get('cdrPct');
    abilities.forEach((ab, i) => {
      const cfg = BALANCE.abilities[ab.id as keyof typeof BALANCE.abilities];
      if (!cfg) return;
      const x = x0 + i * (size + gap);
      let icon = this.abilityIcons.get(ab.id);
      if (!icon) {
        const card = CARD_POOL.find((c) => c.kind === 'ability' && c.abilityId === ab.id);
        const color = card?.color ?? 0xff7a33;
        this.add
          .rectangle(x, y0, size, size, 0x0c1118, 0.85)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(100)
          .setStrokeStyle(2, color);
        const iconKey = `icon.${ab.id}`;
        if (this.textures.exists(iconKey)) {
          // 绝技像素图标（火油弹/神火天降/雷火连环）。
          this.add
            .image(x + size / 2, y0 + size / 2, iconKey)
            .setDisplaySize(size - 4, size - 4)
            .setScrollFactor(0)
            .setDepth(101);
        } else {
          this.add
            .text(
              x + size / 2,
              y0 + size / 2,
              GameScene.wrapCjk(t(`card.${ab.id}.name` as MessageKey), 2),
              {
                fontSize: '12px',
                color: '#f3ecd9',
                align: 'center',
              },
            )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(101);
        }
        const cd = this.add
          .rectangle(x, y0, size, 0, 0x000000, 0.6)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(102);
        const lv = this.add
          .text(x + size - 2, y0 + size - 2, '', { fontSize: '12px', color: '#ffd27a' })
          .setOrigin(1, 1)
          .setScrollFactor(0)
          .setDepth(103);
        icon = { cd, lv };
        this.abilityIcons.set(ab.id, icon);
      }
      const max = cfg.cooldown / cdr;
      const frac = Math.max(0, Math.min(1, ab.timer / max));
      icon.cd.height = size * frac;
      icon.lv.setText(ab.level > 1 ? `Lv${ab.level}` : '');
    });
  }

  /** 弹出升级三选一选牌界面（读取 draft.options 渲染卡面）。 */
  private showDraft(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const draft = this.sim.ctx.state.draft;
    const items: Phaser.GameObjects.GameObject[] = [];

    items.push(
      this.add.rectangle(0, 0, w, h, 0x05080d, 0.72).setOrigin(0).setScrollFactor(0),
      this.add
        .text(w / 2, h * 0.18, t('draft.title'), { fontSize: '30px', color: '#ffe9a8' })
        .setOrigin(0.5)
        .setScrollFactor(0),
    );

    const n = draft.options.length;
    const cardW = 230;
    const cardH = 272;
    const gap = 28;
    const totalW = n * cardW + (n - 1) * gap;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h * 0.5;
    const pad = 18;
    draft.options.forEach((opt, i) => {
      const cx = startX + i * (cardW + gap);
      const top = cy - cardH / 2;
      const color = RARITY_COLOR[opt.rarity];
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      const id = opt.card.id;
      const panel = this.add
        .rectangle(cx, cy, cardW, cardH, 0x121821, 1)
        .setScrollFactor(0)
        .setStrokeStyle(3, color)
        .setInteractive({ useHandCursor: true });
      panel.on('pointerdown', () => this.chooseCard(i));
      items.push(
        panel,
        this.add
          .text(cx, top + pad, GameScene.wrapCjk(t(`card.${id}.name` as MessageKey), 8), {
            fontSize: '21px',
            color: '#f3ecd9',
            align: 'center',
          })
          .setOrigin(0.5, 0)
          .setScrollFactor(0),
        this.add
          .text(cx, top + pad + 40, t(`rarity.${opt.rarity}` as MessageKey), {
            fontSize: '14px',
            color: hex,
          })
          .setOrigin(0.5, 0)
          .setScrollFactor(0),
        this.add
          .text(
            cx,
            cy + 6,
            GameScene.wrapCjk(
              t(`card.${id}.desc` as MessageKey, { amount: Math.round(opt.amount * 100) }),
              11,
            ),
            {
              fontSize: '15px',
              color: '#c8d2de',
              align: 'center',
              lineSpacing: 4,
            },
          )
          .setOrigin(0.5)
          .setScrollFactor(0),
        this.add
          .text(cx, cy + cardH / 2 - pad, String(i + 1), { fontSize: '18px', color: '#8b97a5' })
          .setOrigin(0.5, 1)
          .setScrollFactor(0),
      );
    });

    items.push(
      this.add
        .text(w / 2, h * 0.78, t('draft.hint'), { fontSize: '14px', color: '#9aa6b3' })
        .setOrigin(0.5)
        .setScrollFactor(0),
    );
    if (draft.rerollsLeft > 0) {
      const reroll = this.add
        .text(w / 2, h * 0.84, t('draft.reroll', { n: draft.rerollsLeft }), {
          fontSize: '15px',
          color: '#ffd27a',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      reroll.on('pointerdown', () => this.rerollCards());
      items.push(reroll);
    }

    this.draftOverlay = this.add.container(0, 0, items).setDepth(150);
  }

  private hideDraft(): void {
    this.draftOverlay?.destroy(true);
    this.draftOverlay = undefined;
  }

  /**
   * 中日韩文本无空格，Phaser 的 wordWrap 不会断行 → 长描述会溢出卡框。
   * 这里按「每行最多 maxChars 个字符」手动断行（标点不另起一行更自然）。
   */
  private static wrapCjk(text: string, maxChars: number): string {
    const lines: string[] = [];
    let line = '';
    for (const ch of text) {
      if (ch === '\n') {
        lines.push(line);
        line = '';
        continue;
      }
      line += ch;
      if (line.length >= maxChars) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }

  /** 选择第 i 张卡：应用词条并关闭选牌（如仍有待处理升级，下一帧重开）。 */
  private chooseCard(i: number): void {
    if (!this.sim.ctx.state.draft.active) return;
    this.sim.pickDraft(i);
    this.hideDraft();
    this.updateHud();
  }

  /** 免费重抽当前三选一。 */
  private rerollCards(): void {
    const draft = this.sim.ctx.state.draft;
    if (!draft.active || draft.rerollsLeft <= 0) return;
    this.sim.rerollDraft();
    this.hideDraft();
  }

  private showGameOver(): void {
    this.updateHud();
    // 玩家死亡帧动画：在玩家精灵上播一次 death（仅一次）。
    if (!this.playerDeathPlayed) {
      this.playerDeathPlayed = true;
      const ps = this.sprites.get(this.sim.player) as Phaser.GameObjects.Sprite | undefined;
      const character = getCharacter(this.sim.player.renderable?.spriteKey ?? '');
      if (ps && character?.clips.some((c) => c.name === 'death')) {
        ps.clearTint();
        ps.play(animKey(character.key, 'death'));
      }
    }
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
    this.hideDraft();
    for (const e of this.statusFx.keys()) this.clearStatusFx(e);
    this.statusFx.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.animState.clear();
    this.charMeta.clear();
    this.playerDeathPlayed = false;
    this.swingGfx.clear();

    this.sim = new Simulation({ seed: SEED });
    this.prevHp = BALANCE.player.maxHp;
    this.syncSprites(1);
    const playerSprite = this.sprites.get(this.sim.player);
    if (playerSprite) this.cameras.main.startFollow(playerSprite, true, 0.12, 0.12);
    this.updateHud();
  }
}

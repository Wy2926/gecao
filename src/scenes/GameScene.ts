import Phaser from 'phaser';
import { Simulation } from '@/game/simulation';
import { KeyboardInputSource } from '@/input/keyboard';
import { ASSETS, getSprite, getCharacter, animKey, type CharacterAsset } from '@/assets/registry';
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
  private animState = new Map<Entity, { clip: string; faceLeft: boolean; attack: number }>();
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
        st = { clip: '', faceLeft: false, attack: 0 };
        this.animState.set(e, st);
      }
      st.attack = Math.max(0, st.attack - dt);

      const clips = character.clips;
      const has = (name: string): boolean => clips.some((c) => c.name === name);
      const v = e.velocity;
      const moving = !!v && Math.hypot(v.x, v.y) > 1;
      if (v && Math.abs(v.x) > 5) st.faceLeft = v.x < 0;

      if (e.player && swung && has('attack')) {
        st.faceLeft = Math.cos(swingAngle) < 0;
        const ac = clips.find((c) => c.name === 'attack')!;
        st.attack = ac.frameCount / ac.frameRate;
        sprite.play(animKey(character.key, 'attack')); // 连续横扫则重头播放
        st.clip = 'attack';
      }

      if (st.attack <= 0) {
        let want = moving && has('walk') ? 'walk' : 'idle';
        if (!has(want)) want = clips[0].name;
        if (st.clip !== want) {
          sprite.play(animKey(character.key, want), true);
          st.clip = want;
        }
      }

      sprite.setFlipX(st.faceLeft);
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
    }
    for (const [e, sprite] of this.sprites) {
      if (!seen.has(e)) {
        sprite.destroy();
        this.sprites.delete(e);
        this.animState.delete(e);
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
      const spark = this.add
        .circle(h.x, h.y, h.crit ? 10 : 6, h.crit ? 0xff5a3c : 0xffe08a, 0.95)
        .setDepth(6);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scale: h.crit ? 2.6 : 2,
        duration: h.crit ? 220 : 180,
        onComplete: () => spark.destroy(),
      });
    }
    for (const b of state.blasts) {
      const ring = this.add.circle(b.x, b.y, b.radius, 0xff7a33, 0.28).setDepth(4);
      ring.setStrokeStyle(3, 0xffd24a, 0.9);
      ring.setScale(0.4);
      this.tweens.add({
        targets: ring,
        alpha: 0,
        scale: 1,
        duration: 320,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    for (const bolt of state.bolts) {
      const gfx = this.add.graphics().setDepth(6);
      gfx.lineStyle(3, 0xc89aff, 0.95);
      gfx.beginPath();
      gfx.moveTo(bolt.x1, bolt.y1);
      gfx.lineTo(bolt.x2, bolt.y2);
      gfx.strokePath();
      this.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 200,
        onComplete: () => gfx.destroy(),
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
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.animState.clear();
    this.swingGfx.clear();

    this.sim = new Simulation({ seed: SEED });
    this.prevHp = BALANCE.player.maxHp;
    this.syncSprites(1);
    const playerSprite = this.sprites.get(this.sim.player);
    if (playerSprite) this.cameras.main.startFollow(playerSprite, true, 0.12, 0.12);
    this.updateHud();
  }
}

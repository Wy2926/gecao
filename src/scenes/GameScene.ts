import Phaser from 'phaser';
import { Simulation } from '@/game/simulation';
import { KeyboardInputSource } from '@/input/keyboard';
import { getAsset } from '@/assets/registry';
import { GAME_WIDTH, GAME_HEIGHT } from '@/game/config';
import { t } from '@/i18n';
import type { Entity } from '@/ecs/components';

const PLAYER_SPEED = 180;

/**
 * M0 可玩验证场景：跑通「定步长逻辑 → ECS → 渲染同步」全链路。
 * 玩家用 WASD/方向键移动一个占位方块，证明 Simulation 与渲染解耦后能正确驱动。
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private input$!: KeyboardInputSource;
  private player!: Entity;
  private playerRect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.sim = new Simulation({ seed: 12345 });
    this.input$ = new KeyboardInputSource(this.input.keyboard!);

    const asset = getAsset('player.daopaishou')!;
    this.player = this.sim.ctx.world.add({
      player: true,
      faction: { faction: 'player' },
      transform: { position: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      renderable: {
        spriteKey: asset.key,
        prevPosition: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 },
      },
    });

    this.playerRect = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      asset.width,
      asset.height,
      asset.placeholderColor,
    );

    this.add
      .text(GAME_WIDTH / 2, 24, `${t('game.title')} · M0`, {
        fontSize: '18px',
        color: '#cfd8e3',
      })
      .setOrigin(0.5, 0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'WASD / 方向键移动（脚手架验证）', {
        fontSize: '13px',
        color: '#7f8c9b',
      })
      .setOrigin(0.5, 0.5);
  }

  override update(_time: number, delta: number): void {
    const intent = this.input$.poll();
    if (this.player.velocity) {
      this.player.velocity.x = intent.move.x * PLAYER_SPEED;
      this.player.velocity.y = intent.move.y * PLAYER_SPEED;
    }

    this.sim.advance(delta / 1000);

    // 渲染插值：在上一逻辑位与当前逻辑位间按 alpha 插值，画面平滑。
    const r = this.player.renderable!;
    const p = this.player.transform!.position;
    const a = this.sim.alpha;
    this.playerRect.x = r.prevPosition.x + (p.x - r.prevPosition.x) * a;
    this.playerRect.y = r.prevPosition.y + (p.y - r.prevPosition.y) * a;
  }
}

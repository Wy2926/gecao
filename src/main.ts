import Phaser from 'phaser';
import { baseGameConfig } from '@/game/config';
import { GameScene } from '@/scenes/GameScene';

new Phaser.Game({
  ...baseGameConfig,
  scene: [GameScene],
});

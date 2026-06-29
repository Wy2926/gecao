import Phaser from 'phaser';
import { emptyIntentState, type InputSource, type IntentState } from './intents';

/** 键盘输入源：WASD/方向键 → 移动意图。M0 演示输入意图层（B2）。 */
export class KeyboardInputSource implements InputSource {
  readonly name = 'keyboard';
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,ENTER') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  poll(): IntentState {
    const s = emptyIntentState();
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) s.move.x -= 1;
    if (k.D.isDown || k.RIGHT.isDown) s.move.x += 1;
    if (k.W.isDown || k.UP.isDown) s.move.y -= 1;
    if (k.S.isDown || k.DOWN.isDown) s.move.y += 1;
    const len = Math.hypot(s.move.x, s.move.y);
    if (len > 0) {
      s.move.x /= len;
      s.move.y /= len;
    }
    s.pause = k.ESC.isDown;
    s.confirm = k.ENTER.isDown;
    return s;
  }
}

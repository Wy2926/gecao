import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { FixedTimestep } from '@/core/fixed-timestep';
import { SYSTEM_PIPELINE, runPipeline, type SimContext } from '@/systems';
import { createGameState } from './state';
import { BALANCE } from './balance';
import type { Entity } from '@/ecs/components';

export interface SimulationOptions {
  seed: number;
}

/**
 * 一局对局的纯逻辑模拟核心，**不依赖 Phaser**，可 headless 跑一局做集成测试。
 * 场景层只负责把玩家意图与真实帧 dt 喂进来、读取实体做渲染。
 */
export class Simulation {
  readonly ctx: SimContext;
  readonly player: Entity;
  private clock = new FixedTimestep();

  constructor(opts: SimulationOptions) {
    const world = createWorld();
    this.ctx = {
      world,
      queries: createQueries(world),
      bus: new GameEventBus(),
      rng: new RngStreams(opts.seed),
      state: createGameState(),
      arena: { halfWidth: BALANCE.arena.halfWidth, halfHeight: BALANCE.arena.halfHeight },
      elapsed: 0,
    };

    const p = BALANCE.player;
    const s = BALANCE.qijiaSaber;
    this.player = world.add({
      player: true,
      faction: { faction: 'player' },
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      collider: { radius: p.radius },
      health: { current: p.maxHp, max: p.maxHp },
      attacker: {
        cooldown: s.cooldown,
        timer: s.cooldown,
        range: s.range,
        halfArc: (s.halfArcDeg * Math.PI) / 180,
        damage: s.damage,
        knockback: s.knockback,
      },
      renderable: { spriteKey: 'player.daopaishou', prevPosition: { x: 0, y: 0 } },
    });
  }

  /** 设置玩家移动意图（归一化方向 × 速度）。 */
  setPlayerMove(dirX: number, dirY: number): void {
    if (!this.player.velocity) return;
    this.player.velocity.x = dirX * BALANCE.player.speed;
    this.player.velocity.y = dirY * BALANCE.player.speed;
  }

  /** 喂入真实帧间隔（秒），内部按定步长推进逻辑。返回执行的逻辑步数。 */
  advance(frameDt: number): number {
    return this.clock.advance(frameDt, (dt) => {
      runPipeline(SYSTEM_PIPELINE, this.ctx, dt);
      this.ctx.elapsed += dt;
    });
  }

  get alpha(): number {
    return this.clock.alpha;
  }
}

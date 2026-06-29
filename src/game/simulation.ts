import { createWorld, createQueries } from '@/ecs/world';
import { GameEventBus } from '@/core/event-bus';
import { RngStreams } from '@/core/rng';
import { FixedTimestep } from '@/core/fixed-timestep';
import { SYSTEM_PIPELINE, runPipeline, type SimContext } from '@/systems';
import { openDraft } from '@/systems/pickup';
import { rollDraft } from '@/content/cards';
import { createGameState } from './state';
import { BALANCE } from './balance';
import { StatSheet, applyStats, type PlayerBaseStats } from './stats';
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
  /** 玩家属性表（词条累加），换卡后重算派生数值。 */
  readonly stats = new StatSheet();
  private readonly base: PlayerBaseStats;
  private playerSpeed: number;
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
    this.base = {
      maxHp: p.maxHp,
      moveSpeed: p.speed,
      damage: s.damage,
      cooldown: s.cooldown,
      range: s.range,
      halfArc: (s.halfArcDeg * Math.PI) / 180,
      knockback: s.knockback,
      critChance: s.critChance,
      critMult: s.critMult,
    };
    this.playerSpeed = this.base.moveSpeed;

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
        halfArc: this.base.halfArc,
        damage: s.damage,
        knockback: s.knockback,
        critChance: s.critChance,
        critMult: s.critMult,
      },
      renderable: { spriteKey: 'player.daopaishou', prevPosition: { x: 0, y: 0 } },
    });
  }

  /** 设置玩家移动意图（归一化方向 × 派生速度）。 */
  setPlayerMove(dirX: number, dirY: number): void {
    if (!this.player.velocity) return;
    this.player.velocity.x = dirX * this.playerSpeed;
    this.player.velocity.y = dirY * this.playerSpeed;
  }

  /** 喂入真实帧间隔（秒），内部按定步长推进逻辑。返回执行的逻辑步数。 */
  advance(frameDt: number): number {
    return this.clock.advance(frameDt, (dt) => {
      runPipeline(SYSTEM_PIPELINE, this.ctx, dt);
      this.ctx.elapsed += dt;
    });
  }

  /** 选择三选一中的一张：累加词条 → 重算派生数值 → 结算队列里下一次抽卡。 */
  pickDraft(index: number): void {
    const draft = this.ctx.state.draft;
    if (!draft.active) return;
    const opt = draft.options[index];
    if (!opt) return;

    this.stats.add(opt.card.stat, opt.amount);
    this.recomputeStats();

    draft.pending = Math.max(0, draft.pending - 1);
    draft.active = false;
    draft.options = [];
    if (draft.pending > 0) openDraft(this.ctx);
  }

  /** 免费重抽当前三选一（消耗一次重抽次数），重新抽一组选项。 */
  rerollDraft(): void {
    const draft = this.ctx.state.draft;
    if (!draft.active || draft.rerollsLeft <= 0) return;
    draft.rerollsLeft--;
    draft.options = rollDraft(this.ctx.rng.stream('draft'), 3);
  }

  /** 把属性表算成派生值写回玩家组件，并缓存派生移动速度。 */
  private recomputeStats(): void {
    const d = applyStats(this.player, this.base, this.stats);
    this.playerSpeed = d.moveSpeed;
  }

  get alpha(): number {
    return this.clock.alpha;
  }
}

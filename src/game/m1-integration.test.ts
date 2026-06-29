import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation';
import { FIXED_DT } from '@/core/fixed-timestep';

/** headless 跑一局：验证刷怪→AI追击→玩家自动横扫→击杀 的端到端闭环 + 可复现。 */
describe('M1 headless integration', () => {
  function run(seconds: number, seed = 42) {
    const sim = new Simulation({ seed });
    const steps = Math.round(seconds / FIXED_DT);
    for (let i = 0; i < steps; i++) sim.advance(FIXED_DT);
    return sim;
  }

  it('spawns wokou over time', () => {
    const sim = run(3);
    expect(sim.ctx.queries.enemies.size).toBeGreaterThan(0);
  });

  it('player auto-attacks and racks up kills within a short run', () => {
    const sim = run(25);
    expect(sim.ctx.state.kills).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed (kills match)', () => {
    const a = run(20, 7);
    const b = run(20, 7);
    expect(a.ctx.state.kills).toBe(b.ctx.state.kills);
    expect(a.ctx.queries.enemies.size).toBe(b.ctx.queries.enemies.size);
  });

  it('keeps player alive through an early run (sanity: not instantly overwhelmed)', () => {
    const sim = run(15);
    expect(sim.ctx.state.gameOver).toBe(false);
    expect(sim.player.health!.current).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { Simulation } from './simulation';
import { FIXED_DT } from '@/core/fixed-timestep';

describe('Simulation (headless)', () => {
  it('integrates velocity into transform deterministically over a fixed step', () => {
    const sim = new Simulation({ seed: 1 });
    const e = sim.ctx.world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 60, y: 0 },
    });

    sim.advance(FIXED_DT);

    expect(e.transform!.position.x).toBeCloseTo(60 * FIXED_DT, 6);
    expect(e.transform!.position.y).toBe(0);
  });

  it('two simulations with same seed and inputs stay in sync', () => {
    const make = () => {
      const sim = new Simulation({ seed: 777 });
      const e = sim.ctx.world.add({
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
        velocity: { x: 30, y: -15 },
      });
      return { sim, e };
    };
    const a = make();
    const b = make();
    for (let i = 0; i < 120; i++) {
      a.sim.advance(FIXED_DT);
      b.sim.advance(FIXED_DT);
    }
    expect(a.e.transform!.position).toEqual(b.e.transform!.position);
  });
});

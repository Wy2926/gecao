import { describe, it, expect } from 'vitest';
import { FixedTimestep, FIXED_DT } from './fixed-timestep';

describe('FixedTimestep', () => {
  it('runs exactly one step for one fixed dt', () => {
    const ts = new FixedTimestep();
    let steps = 0;
    const n = ts.advance(FIXED_DT, () => steps++);
    expect(n).toBe(1);
    expect(steps).toBe(1);
  });

  it('accumulates fractional frames', () => {
    const ts = new FixedTimestep();
    let steps = 0;
    ts.advance(FIXED_DT / 2, () => steps++);
    expect(steps).toBe(0);
    ts.advance(FIXED_DT / 2, () => steps++);
    expect(steps).toBe(1);
  });

  it('clamps to maxSubSteps (spiral-of-death guard)', () => {
    const ts = new FixedTimestep({ maxSubSteps: 5 });
    let steps = 0;
    // 一帧塞入远超预算的时间
    const n = ts.advance(FIXED_DT * 100, () => steps++);
    expect(n).toBe(5);
    expect(steps).toBe(5);
  });

  it('alpha reflects leftover accumulator', () => {
    const ts = new FixedTimestep();
    ts.advance(FIXED_DT * 1.5, () => {});
    expect(ts.alpha).toBeGreaterThan(0.49);
    expect(ts.alpha).toBeLessThan(0.51);
  });
});

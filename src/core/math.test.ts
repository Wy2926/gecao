import { describe, it, expect } from 'vitest';
import { normalize, wrapAngle, angleDelta, clamp, length } from './math';

describe('math', () => {
  it('normalize returns unit vector and zero for zero input', () => {
    const n = normalize(3, 4);
    expect(length(n.x, n.y)).toBeCloseTo(1, 6);
    expect(normalize(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('wrapAngle maps to (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(0)).toBe(0);
  });

  it('angleDelta is symmetric and within [0, PI]', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(0.2, 6);
    expect(angleDelta(0, 2 * Math.PI)).toBeCloseTo(0, 6);
  });

  it('clamp bounds the value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

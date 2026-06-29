import { describe, it, expect } from 'vitest';
import { Rng, RngStreams, seedFromString, hashString } from './rng';

describe('Rng', () => {
  it('same seed produces identical sequence (reproducible)', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.float());
    const seqB = Array.from({ length: 10 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.float()).not.toEqual(b.float());
  });

  it('float in [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int is within inclusive range', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('pick throws on empty array', () => {
    const r = new Rng(1);
    expect(() => r.pick([])).toThrow();
  });
});

describe('RngStreams', () => {
  it('streams are independent but reproducible from total seed', () => {
    const s1 = new RngStreams(seedFromString('run-001'));
    const s2 = new RngStreams(seedFromString('run-001'));
    expect(s1.stream('combat').float()).toEqual(s2.stream('combat').float());
    expect(s1.stream('draft').float()).toEqual(s2.stream('draft').float());
  });

  it('different streams do not produce the same first value', () => {
    const s = new RngStreams(123);
    expect(s.stream('combat').float()).not.toEqual(s.stream('spawn').float());
  });
});

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('abc')).toEqual(hashString('abc'));
    expect(hashString('abc')).not.toEqual(hashString('abd'));
  });
});

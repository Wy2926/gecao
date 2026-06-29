/**
 * 种子化 RNG（B3：多 RNG 流）。
 * 每条逻辑用途独立子流，互不串味，保证同一总种子下对局可复现。
 */

export type RngStreamName = 'combat' | 'draft' | 'spawn' | 'loot';

/** mulberry32：快速、确定性的 32 位 PRNG。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把任意字符串散列成 32 位整数，用于从总种子派生子流种子。 */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** [0, 1) */
  float(): number {
    return this.next();
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** 概率判定 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.int(0, arr.length - 1)]!;
  }
}

/**
 * 一局对局的多 RNG 流容器。由总种子派生各子流。
 */
export class RngStreams {
  readonly seed: number;
  private streams = new Map<RngStreamName, Rng>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  stream(name: RngStreamName): Rng {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = new Rng((this.seed ^ hashString(name)) >>> 0);
      this.streams.set(name, rng);
    }
    return rng;
  }
}

/** 从字符串（如玩家分享的种子码）生成总种子。 */
export function seedFromString(str: string): number {
  return hashString(str);
}

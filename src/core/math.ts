export const TAU = Math.PI * 2;

export function length(x: number, y: number): number {
  return Math.hypot(x, y);
}

/** 归一化向量；零向量返回 (0,0)。 */
export function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** 把角度规约到 (-PI, PI]。 */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  if (r > Math.PI) r -= TAU;
  return r;
}

/** 两角的最小夹角绝对值 [0, PI]。 */
export function angleDelta(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

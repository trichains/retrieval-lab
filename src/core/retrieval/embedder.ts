/**
 * Anything that turns texts into fixed-size vectors. Implementations must return one vector per
 * input, in input order, all with the same length.
 */
export interface Embedder {
  /** Identifies the model and its settings; used as a cache key. */
  readonly id: string;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i]! * vector[i]!;
  if (sum === 0) return vector;
  const inv = 1 / Math.sqrt(sum);
  for (let i = 0; i < vector.length; i++) vector[i]! *= inv;
  return vector;
}

export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new RangeError(`dimension mismatch: ${a.length} vs ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const denom = Math.sqrt(dot(a, a) * dot(b, b));
  return denom === 0 ? 0 : dot(a, b) / denom;
}

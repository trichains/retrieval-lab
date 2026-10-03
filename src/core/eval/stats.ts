import { mean } from "./metrics";

/** Seeded PRNG (mulberry32). Same seed, same sequence, in every JS engine. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The q-quantile (0..1) of a sorted array, with linear interpolation between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface BootstrapOptions {
  samples?: number;
  seed?: number;
  /** Two-sided confidence level. Default 0.95. */
  confidence?: number;
}

/** Means of `samples` bootstrap resamples (with replacement) of `values`, sorted ascending. */
function bootstrapMeans(values: readonly number[], samples: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const n = values.length;
  const means = new Array<number>(samples);
  for (let s = 0; s < samples; s++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[Math.floor(rand() * n)]!;
    means[s] = sum / n;
  }
  return means.sort((a, b) => a - b);
}

/** Percentile bootstrap confidence interval for the mean of `values`. */
export function bootstrapMeanCI(values: readonly number[], options: BootstrapOptions = {}): [number, number] {
  if (values.length === 0) return [0, 0];
  const { samples = 2000, seed = 42, confidence = 0.95 } = options;
  const means = bootstrapMeans(values, samples, seed);
  const tail = (1 - confidence) / 2;
  return [quantile(means, tail), quantile(means, 1 - tail)];
}

export interface PairedComparison {
  n: number;
  meanA: number;
  meanB: number;
  /** mean(B − A). Positive means B scored higher. */
  delta: number;
  ci: [number, number];
  /**
   * Two-sided bootstrap p-value: twice the share of resampled mean deltas on the far side of zero
   * (capped at 1). A rough guide, not an exact test.
   */
  pValue: number;
  /** True when the confidence interval excludes 0. */
  significant: boolean;
  /** How many queries B won, lost and tied against A. */
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Paired bootstrap over queries (Efron & Tibshirani; common in IR evaluation, e.g. Sakai 2006).
 * The same queries were run through both systems, so we resample the per-query differences, which
 * removes the large query-difficulty variance that an unpaired comparison would drown in.
 */
export function pairedBootstrap(
  a: readonly number[],
  b: readonly number[],
  options: BootstrapOptions = {},
): PairedComparison {
  if (a.length !== b.length) throw new RangeError("paired samples must have the same length");
  const { samples = 10_000, seed = 42, confidence = 0.95 } = options;
  const deltas = a.map((x, i) => b[i]! - x);
  const n = deltas.length;
  const delta = mean(deltas);
  let wins = 0;
  let losses = 0;
  for (const d of deltas) {
    if (d > 1e-12) wins++;
    else if (d < -1e-12) losses++;
  }
  if (n === 0) {
    return { n, meanA: 0, meanB: 0, delta: 0, ci: [0, 0], pValue: 1, significant: false, wins, losses, ties: 0 };
  }
  const means = bootstrapMeans(deltas, samples, seed);
  const tail = (1 - confidence) / 2;
  const ci: [number, number] = [quantile(means, tail), quantile(means, 1 - tail)];
  const atOrBelow = means.filter((m) => m <= 0).length / samples;
  const atOrAbove = means.filter((m) => m >= 0).length / samples;
  const pValue = Math.min(1, 2 * Math.min(atOrBelow, atOrAbove));
  return {
    n,
    meanA: mean(a),
    meanB: mean(b),
    delta,
    ci,
    pValue,
    significant: ci[0] > 0 || ci[1] < 0,
    wins,
    losses,
    ties: n - wins - losses,
  };
}

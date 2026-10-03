import type { Qrels } from "./dataset";

/**
 * Ranking metrics over a ranked list of document ids and the graded judgments of one query.
 * Conventions (all values in [0, 1]):
 * - "relevant" means grade > 0; only nDCG uses the grade itself.
 * - `ranked` is best first; duplicate ids after the first occurrence are ignored.
 * - A query is expected to have at least one relevant document (the dataset schema enforces it); with
 *   none, recall-like metrics return 0 rather than NaN.
 */

function topUnique(ranked: readonly string[], k: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ranked) {
    if (out.length >= k) break;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function relevantCount(qrels: Qrels): number {
  let n = 0;
  for (const grade of qrels.values()) if (grade > 0) n++;
  return n;
}

const isRelevant = (qrels: Qrels, id: string) => (qrels.get(id) ?? 0) > 0;

/** Fraction of the top k that is relevant. Missing positions (fewer than k results) count as misses. */
export function precisionAt(ranked: readonly string[], qrels: Qrels, k: number): number {
  if (k <= 0) return 0;
  return topUnique(ranked, k).filter((id) => isRelevant(qrels, id)).length / k;
}

/** Fraction of all relevant documents that appear in the top k. */
export function recallAt(ranked: readonly string[], qrels: Qrels, k: number): number {
  const total = relevantCount(qrels);
  if (total === 0) return 0;
  return topUnique(ranked, k).filter((id) => isRelevant(qrels, id)).length / total;
}

/** 1 if any relevant document is in the top k (a.k.a. success@k). */
export function hitAt(ranked: readonly string[], qrels: Qrels, k: number): number {
  return topUnique(ranked, k).some((id) => isRelevant(qrels, id)) ? 1 : 0;
}

/** 1 / rank of the first relevant document within the top k, else 0. MRR is its mean over queries. */
export function reciprocalRank(ranked: readonly string[], qrels: Qrels, k: number): number {
  const top = topUnique(ranked, k);
  const i = top.findIndex((id) => isRelevant(qrels, id));
  return i === -1 ? 0 : 1 / (i + 1);
}

/**
 * Average precision with cutoff k: the mean of precision@i over the ranks i ≤ k that hold a relevant
 * document, divided by min(|relevant|, k) so that a perfect top-k scores 1. MAP is its mean.
 */
export function averagePrecision(ranked: readonly string[], qrels: Qrels, k: number): number {
  const total = Math.min(relevantCount(qrels), k);
  if (total === 0) return 0;
  let hits = 0;
  let sum = 0;
  topUnique(ranked, k).forEach((id, i) => {
    if (!isRelevant(qrels, id)) return;
    hits++;
    sum += hits / (i + 1);
  });
  return sum / total;
}

/** Exponential gain (2^grade − 1) with a log2(rank + 1) discount, as in Burges et al. (2005). */
export function dcgAt(grades: readonly number[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, grades.length); i++) {
    dcg += (2 ** (grades[i] ?? 0) - 1) / Math.log2(i + 2);
  }
  return dcg;
}

/**
 * nDCG@k = DCG@k of the ranking / DCG@k of the ideal ranking (all judged grades, sorted descending).
 * Uses the graded judgments, so ranking a grade-3 document above a grade-1 one is rewarded.
 */
export function ndcgAt(ranked: readonly string[], qrels: Qrels, k: number): number {
  const ideal = [...qrels.values()].filter((g) => g > 0).sort((a, b) => b - a);
  const idcg = dcgAt(ideal, k);
  if (idcg === 0) return 0;
  const grades = topUnique(ranked, k).map((id) => qrels.get(id) ?? 0);
  return dcgAt(grades, k) / idcg;
}

export type MetricName = "ndcg" | "recall" | "precision" | "hit" | "mrr" | "map";

/** Metric keys look like "ndcg@10". MRR and MAP are computed at the largest cutoff. */
export function metricKeys(cutoffs: readonly number[]): string[] {
  const sorted = [...new Set(cutoffs)].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1] ?? 10;
  const keys: string[] = [];
  for (const name of ["ndcg", "recall", "precision", "hit"] as const) for (const k of sorted) keys.push(`${name}@${k}`);
  keys.push(`mrr@${max}`, `map@${max}`);
  return keys;
}

export function computeMetrics(
  ranked: readonly string[],
  qrels: Qrels,
  cutoffs: readonly number[],
): Record<string, number> {
  const sorted = [...new Set(cutoffs)].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1] ?? 10;
  const out: Record<string, number> = {};
  for (const k of sorted) {
    out[`ndcg@${k}`] = ndcgAt(ranked, qrels, k);
    out[`recall@${k}`] = recallAt(ranked, qrels, k);
    out[`precision@${k}`] = precisionAt(ranked, qrels, k);
    out[`hit@${k}`] = hitAt(ranked, qrels, k);
  }
  out[`mrr@${max}`] = reciprocalRank(ranked, qrels, max);
  out[`map@${max}`] = averagePrecision(ranked, qrels, max);
  return out;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

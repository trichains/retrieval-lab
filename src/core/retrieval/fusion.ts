import { compareScored, type ScoredId } from "./types";

/** A ranked list, best first. */
export interface RankedList {
  name: string;
  hits: readonly ScoredId[];
}

/**
 * Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, 2009):
 *
 *   rrf(d) = Σ_lists 1 / (k + rank_list(d))      (ranks start at 1; absent items contribute 0)
 *
 * Only ranks matter, so lists with incomparable score scales (BM25 vs cosine) fuse cleanly. Larger
 * `k` flattens the advantage of the very top positions. The usual default is 60.
 */
export function reciprocalRankFusion(lists: readonly RankedList[], k = 60): ScoredId[] {
  if (!(k >= 0)) throw new RangeError(`k must be >= 0, got ${k}`);
  const scores = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.hits.forEach((hit, i) => {
      if (seen.has(hit.id)) return; // count an item once per list, at its best rank
      seen.add(hit.id);
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort(compareScored);
}

/**
 * Rescales scores to [0, 1] with (s − min) / (max − min). When every score is equal (including a
 * single hit), they all map to 1: the list expresses no preference, but its items were retrieved.
 */
export function minMaxNormalize(hits: readonly ScoredId[]): Map<string, number> {
  const out = new Map<string, number>();
  if (hits.length === 0) return out;
  let min = Infinity;
  let max = -Infinity;
  for (const h of hits) {
    min = Math.min(min, h.score);
    max = Math.max(max, h.score);
  }
  const range = max - min;
  for (const h of hits) {
    if (!out.has(h.id)) out.set(h.id, range === 0 ? 1 : (h.score - min) / range);
  }
  return out;
}

/**
 * Weighted score fusion: Σ weight_i · minmax_i(d), where an item missing from a list scores 0 there.
 * Sensitive to each list's score distribution (one outlier compresses everything else), which is
 * exactly the weakness RRF avoids; having both makes the trade-off measurable.
 */
export function weightedFusion(lists: readonly RankedList[], weights: readonly number[]): ScoredId[] {
  if (weights.length !== lists.length) throw new RangeError("one weight per list is required");
  const scores = new Map<string, number>();
  lists.forEach((list, i) => {
    const weight = weights[i]!;
    for (const [id, norm] of minMaxNormalize(list.hits)) scores.set(id, (scores.get(id) ?? 0) + weight * norm);
  });
  return [...scores].map(([id, score]) => ({ id, score })).sort(compareScored);
}

import { analyzeTokens, type AnalyzerOptions } from "../text/analyzer";
import { dot } from "./embedder";
import { minMaxNormalize } from "./fusion";
import type { ScoredId } from "./types";

export interface Reranked extends ScoredId {
  /** The reranker's own objective value for this item (not comparable across rerankers). */
  objective: number;
}

/**
 * Maximal Marginal Relevance (Carbonell & Goldstein, 1998). Greedily picks the candidate maximizing
 *
 *   λ · relevance(d) − (1 − λ) · max_{s ∈ selected} sim(d, s)
 *
 * where relevance is the candidate's retrieval score min-max normalized to [0, 1] and sim is cosine
 * similarity of the chunk vectors. It trades a little relevance for less redundancy: useful when the
 * top chunks are near-copies of each other (overlapping windows of the same section, say).
 * Candidates without a vector are treated as dissimilar to everything.
 */
export function mmrRerank(
  candidates: readonly ScoredId[],
  vectorOf: (id: string) => Float32Array | undefined,
  lambda: number,
): Reranked[] {
  if (!(lambda >= 0 && lambda <= 1)) throw new RangeError(`lambda must be in [0, 1], got ${lambda}`);
  const relevance = minMaxNormalize(candidates);
  const remaining = candidates.map((c) => ({ ...c, rel: relevance.get(c.id) ?? 0, vec: vectorOf(c.id) }));
  const maxSim = new Map<string, number>(remaining.map((c) => [c.id, 0]));
  const out: Reranked[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    remaining.forEach((c, i) => {
      const value = lambda * c.rel - (1 - lambda) * (out.length === 0 ? 0 : maxSim.get(c.id)!);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    });
    const [picked] = remaining.splice(bestIndex, 1);
    out.push({ id: picked!.id, score: picked!.score, objective: bestValue });
    if (picked!.vec) {
      for (const c of remaining) {
        if (!c.vec) continue;
        const sim = dot(picked!.vec, c.vec);
        if (sim > maxSim.get(c.id)!) maxSim.set(c.id, sim);
      }
    }
  }
  return out;
}

export interface LexicalFeatures {
  /** Fraction of distinct query terms present in the text, in [0, 1]. */
  coverage: number;
  /** matched / (smallest token window containing every matched term), in [0, 1]. */
  proximity: number;
}

/**
 * Smallest window (in token positions, inclusive) that contains at least one occurrence of every
 * term in `positions`. Classic two-pointer sweep over the merged, sorted occurrence list.
 */
export function minimalCoverWindow(positions: ReadonlyMap<string, readonly number[]>): number {
  const terms = [...positions.keys()];
  if (terms.length === 0) return 0;
  const events = terms
    .flatMap((term) => (positions.get(term) ?? []).map((pos) => ({ pos, term })))
    .sort((a, b) => a.pos - b.pos);
  const counts = new Map<string, number>();
  let covered = 0;
  let best = Infinity;
  let left = 0;
  for (const event of events) {
    const n = (counts.get(event.term) ?? 0) + 1;
    counts.set(event.term, n);
    if (n === 1) covered++;
    while (covered === terms.length) {
      const first = events[left]!;
      best = Math.min(best, event.pos - first.pos + 1);
      const m = counts.get(first.term)! - 1;
      counts.set(first.term, m);
      if (m === 0) covered--;
      left++;
    }
  }
  return best;
}

export function lexicalFeatures(
  queryTerms: readonly string[],
  text: string,
  analyzer: AnalyzerOptions,
  lang?: string,
): LexicalFeatures {
  const unique = [...new Set(queryTerms)];
  if (unique.length === 0) return { coverage: 0, proximity: 0 };
  const wanted = new Set(unique);
  const positions = new Map<string, number[]>();
  analyzeTokens(text, analyzer, lang).forEach((token, pos) => {
    for (const term of token.terms) {
      if (!wanted.has(term)) continue;
      const list = positions.get(term);
      if (list) list.push(pos);
      else positions.set(term, [pos]);
    }
  });
  const matched = positions.size;
  const coverage = matched / unique.length;
  if (unique.length === 1) return { coverage, proximity: coverage };
  if (matched < 2) return { coverage, proximity: 0 };
  return { coverage, proximity: matched / minimalCoverWindow(positions) };
}

/**
 * A transparent, heuristic lexical reranker, not a neural cross-encoder:
 *
 *   final = (1 − w) · minmax(retrieval score) + w · (0.7 · coverage + 0.3 · proximity)
 *
 * It rewards chunks that contain more of the distinct query terms, close together. It can fix a
 * vector retriever that ranked a vaguely similar chunk above one containing the exact terms, and it
 * cannot help when the right chunk uses different words than the query.
 */
export function lexicalRerank(
  candidates: readonly ScoredId[],
  queryTerms: readonly string[],
  textOf: (id: string) => { text: string; lang?: string } | undefined,
  weight: number,
  analyzer: AnalyzerOptions,
): Reranked[] {
  if (!(weight >= 0 && weight <= 1)) throw new RangeError(`weight must be in [0, 1], got ${weight}`);
  const relevance = minMaxNormalize(candidates);
  return candidates
    .map((c) => {
      const source = textOf(c.id);
      const f = source
        ? lexicalFeatures(queryTerms, source.text, analyzer, source.lang)
        : { coverage: 0, proximity: 0 };
      const objective = (1 - weight) * (relevance.get(c.id) ?? 0) + weight * (0.7 * f.coverage + 0.3 * f.proximity);
      return { id: c.id, score: c.score, objective };
    })
    .sort((a, b) => b.objective - a.objective || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

import type { Aggregation } from "../config";
import type { Hit } from "./types";

export interface DocHit {
  docId: string;
  score: number;
  /** 1-based. */
  rank: number;
  /** The highest-ranked chunk of this document in the input list. */
  bestChunkId: string;
  /** How many of the document's chunks were in the input list. */
  chunkCount: number;
}

/**
 * Turns a ranked list of chunk hits into a ranked list of documents, because relevance is judged per
 * document and two chunking strategies are only comparable at that level.
 *
 * - `max` (default): a document is as good as its best chunk. Order-preserving and robust.
 * - `sum`: rewards documents with many matching chunks (and so, long documents).
 * - `mean`: average of the document's retrieved chunks; punishes one strong chunk among weak ones.
 *
 * Only chunks present in `hits` count, so retrieve deeper than the final k before aggregating.
 */
export function aggregateToDocs(hits: readonly Hit[], policy: Aggregation = "max"): DocHit[] {
  const docs = new Map<string, { sum: number; max: number; count: number; best: string; firstPos: number }>();
  hits.forEach((hit, pos) => {
    const d = docs.get(hit.docId);
    if (!d) {
      docs.set(hit.docId, { sum: hit.score, max: hit.score, count: 1, best: hit.id, firstPos: pos });
      return;
    }
    d.sum += hit.score;
    d.count += 1;
    if (hit.score > d.max) {
      d.max = hit.score;
      d.best = hit.id;
    }
  });
  return [...docs]
    .map(([docId, d]) => ({
      docId,
      score: policy === "sum" ? d.sum : policy === "mean" ? d.sum / d.count : d.max,
      bestChunkId: d.best,
      chunkCount: d.count,
      firstPos: d.firstPos,
    }))
    .sort((a, b) => b.score - a.score || a.firstPos - b.firstPos)
    .map(({ firstPos: _firstPos, ...rest }, i) => ({ ...rest, rank: i + 1 }));
}

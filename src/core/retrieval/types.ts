/** What a retriever indexes: usually a chunk, possibly with a context header prepended. */
export interface IndexItem {
  id: string;
  docId: string;
  text: string;
  /** "pt" / "en" when known; used to pick stopwords and stemmer. */
  lang?: string;
}

export interface ScoredId {
  id: string;
  score: number;
}

export interface Hit extends ScoredId {
  docId: string;
}

/** Best first: higher score, then lexicographically smaller id, so ties are deterministic. */
export function compareScored(a: ScoredId, b: ScoredId): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

import { analyze, DEFAULT_ANALYZER, type AnalyzerOptions } from "../text/analyzer";
import { topK } from "./topk";
import { compareScored, type Hit, type IndexItem } from "./types";

export interface Bm25Options {
  /** Term-frequency saturation. 0 makes tf irrelevant (binary match); larger values let tf grow longer. */
  k1: number;
  /** Length normalization. 0 ignores document length, 1 fully normalizes by it. */
  b: number;
  analyzer: AnalyzerOptions;
}

export const DEFAULT_BM25: Bm25Options = { k1: 1.2, b: 0.75, analyzer: DEFAULT_ANALYZER };

interface Posting {
  item: number;
  tf: number;
}

export interface TermContribution {
  term: string;
  tf: number;
  df: number;
  idf: number;
  score: number;
}

/**
 * Okapi BM25 over an inverted index.
 *
 *   score(D, Q) = Σ_{t ∈ Q} idf(t) · tf(t, D) · (k1 + 1) / (tf(t, D) + k1 · (1 − b + b · |D| / avgdl))
 *   idf(t)      = ln(1 + (N − df(t) + 0.5) / (df(t) + 0.5))
 *
 * This is the Lucene variant of IDF, which never goes negative. Query terms are deduplicated: a word
 * repeated in the query counts once. Documents are analyzed with their own language hint; queries are
 * analyzed without one (see `analyze` for what happens when the language is unclear).
 */
export class Bm25Index {
  readonly options: Bm25Options;
  readonly size: number;
  readonly avgLength: number;
  private readonly items: readonly IndexItem[];
  private readonly lengths: Uint32Array;
  private readonly postings = new Map<string, Posting[]>();

  constructor(items: readonly IndexItem[], options: Partial<Bm25Options> = {}) {
    this.options = { ...DEFAULT_BM25, ...options };
    this.items = items;
    this.size = items.length;
    this.lengths = new Uint32Array(items.length);
    let total = 0;
    items.forEach((item, i) => {
      const terms = analyze(item.text, this.options.analyzer, item.lang);
      this.lengths[i] = terms.length;
      total += terms.length;
      const counts = new Map<string, number>();
      for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
      for (const [term, tf] of counts) {
        let list = this.postings.get(term);
        if (!list) this.postings.set(term, (list = []));
        list.push({ item: i, tf });
      }
    });
    this.avgLength = items.length > 0 ? total / items.length : 0;
  }

  get vocabularySize(): number {
    return this.postings.size;
  }

  documentFrequency(term: string): number {
    return this.postings.get(term)?.length ?? 0;
  }

  idf(term: string): number {
    const df = this.documentFrequency(term);
    return Math.log(1 + (this.size - df + 0.5) / (df + 0.5));
  }

  /** Unique analyzed query terms, in first-occurrence order. */
  queryTerms(query: string): string[] {
    return [...new Set(analyze(query, this.options.analyzer))];
  }

  private termScore(tf: number, length: number, idf: number): number {
    const { k1, b } = this.options;
    const norm = this.avgLength > 0 ? 1 - b + (b * length) / this.avgLength : 1;
    return (idf * tf * (k1 + 1)) / (tf + k1 * norm);
  }

  /** Top `k` items with a positive score. */
  search(query: string, k: number): Hit[] {
    const scores = new Float64Array(this.size);
    const touched: number[] = [];
    for (const term of this.queryTerms(query)) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = this.idf(term);
      for (const { item, tf } of list) {
        if (scores[item] === 0) touched.push(item);
        scores[item]! += this.termScore(tf, this.lengths[item]!, idf);
      }
    }
    const candidates = touched
      .filter((i) => scores[i]! > 0)
      .map((i) => ({ id: this.items[i]!.id, docId: this.items[i]!.docId, score: scores[i]! }));
    return topK(candidates, k, compareScored);
  }

  /** Per-term breakdown of one item's score for a query (what the UI shows, and what tests check). */
  explain(query: string, itemId: string): TermContribution[] {
    const index = this.items.findIndex((item) => item.id === itemId);
    if (index === -1) return [];
    return this.queryTerms(query).map((term) => {
      const tf = this.postings.get(term)?.find((p) => p.item === index)?.tf ?? 0;
      const idf = this.idf(term);
      const score = tf > 0 ? this.termScore(tf, this.lengths[index]!, idf) : 0;
      return { term, tf, df: this.documentFrequency(term), idf, score };
    });
  }
}

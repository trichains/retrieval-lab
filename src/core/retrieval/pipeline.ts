import { chunkCorpus, type Chunk, type SourceDocument } from "../chunking";
import type { ChunkerConfig, EmbedderConfig, PipelineConfig, RetrieverConfig } from "../config";
import { analyze, type AnalyzerOptions } from "../text/analyzer";
import { normalizeText } from "../text/normalize";
import { aggregateToDocs, type DocHit } from "./aggregate";
import { Bm25Index } from "./bm25";
import type { Embedder } from "./embedder";
import { reciprocalRankFusion, weightedFusion } from "./fusion";
import { HashingEmbedder } from "./hashing-embedder";
import { OpenAICompatibleEmbedder } from "./openai-embedder";
import { lexicalRerank, mmrRerank } from "./rerank";
import type { Hit, IndexItem, ScoredId } from "./types";
import { VectorIndex } from "./vector-index";

export interface EmbedderFactoryOptions {
  apiKey?: string;
  fetch?: typeof fetch;
}

export function createEmbedder(config: EmbedderConfig, options: EmbedderFactoryOptions = {}): Embedder {
  if (config.type === "hashing") {
    return new HashingEmbedder({ dims: config.dims, bigramWeight: config.bigramWeight, charWeight: config.charWeight });
  }
  return new OpenAICompatibleEmbedder({
    baseUrl: config.baseUrl,
    model: config.model,
    dimensions: config.dimensions,
    batchSize: config.batchSize,
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
}

const DEFAULT_HASHING_CONFIG: EmbedderConfig = { type: "hashing", dims: 1024, bigramWeight: 0.5, charWeight: 0.35 };

/** "Doc title > Section > Subsection", skipping repeats (a top heading often equals the title). */
export function contextHeader(title: string | undefined, headingPath: readonly string[] | undefined): string {
  const parts: string[] = [];
  for (const part of [title, ...(headingPath ?? [])]) {
    if (!part) continue;
    if (parts.length > 0 && normalizeText(parts[parts.length - 1]!) === normalizeText(part)) continue;
    parts.push(part);
  }
  return parts.join(" > ");
}

/**
 * Memoizes the expensive steps (chunking, BM25 indexing, embedding) by configuration, so an
 * experiment grid that tries five retrievers on the same chunks chunks and embeds once.
 */
export class IndexCache {
  private readonly docs: readonly SourceDocument[];
  private readonly docsById: Map<string, SourceDocument>;
  private readonly embedderOptions: EmbedderFactoryOptions;
  private readonly chunkCache = new Map<string, Chunk[]>();
  private readonly itemCache = new Map<string, IndexItem[]>();
  private readonly bm25Cache = new Map<string, Bm25Index>();
  private readonly vectorCache = new Map<string, Promise<VectorIndex>>();

  constructor(docs: readonly SourceDocument[], embedderOptions: EmbedderFactoryOptions = {}) {
    this.docs = docs;
    this.docsById = new Map(docs.map((d) => [d.id, d]));
    this.embedderOptions = embedderOptions;
  }

  document(id: string): SourceDocument | undefined {
    return this.docsById.get(id);
  }

  chunks(config: ChunkerConfig): Chunk[] {
    const key = JSON.stringify(config);
    let chunks = this.chunkCache.get(key);
    if (!chunks) this.chunkCache.set(key, (chunks = chunkCorpus(this.docs, config)));
    return chunks;
  }

  items(config: ChunkerConfig, contextHeaders: boolean): IndexItem[] {
    const key = `${JSON.stringify(config)}|${contextHeaders}`;
    let items = this.itemCache.get(key);
    if (!items) {
      items = this.chunks(config).map((chunk) => {
        const doc = this.docsById.get(chunk.docId);
        const header = contextHeaders ? contextHeader(doc?.title, chunk.headingPath) : "";
        return {
          id: chunk.id,
          docId: chunk.docId,
          text: header ? `${header}\n${chunk.text}` : chunk.text,
          lang: doc?.lang,
        };
      });
      this.itemCache.set(key, items);
    }
    return items;
  }

  bm25(config: ChunkerConfig, contextHeaders: boolean, params: { k1: number; b: number }, analyzer: AnalyzerOptions) {
    const key = JSON.stringify([config, contextHeaders, params, analyzer]);
    let index = this.bm25Cache.get(key);
    if (!index) {
      index = new Bm25Index(this.items(config, contextHeaders), { ...params, analyzer });
      this.bm25Cache.set(key, index);
    }
    return index;
  }

  vector(config: ChunkerConfig, contextHeaders: boolean, embedder: EmbedderConfig): Promise<VectorIndex> {
    const key = JSON.stringify([config, contextHeaders, embedder]);
    let index = this.vectorCache.get(key);
    if (!index) {
      index = VectorIndex.build(this.items(config, contextHeaders), createEmbedder(embedder, this.embedderOptions));
      // Do not cache failures (a network embedder may succeed on retry).
      index.catch(() => this.vectorCache.delete(key));
      this.vectorCache.set(key, index);
    }
    return index;
  }
}

export interface Signal {
  score: number;
  /** 1-based rank in that signal's own list, or null if the item was not in it. */
  rank: number | null;
}

export interface PipelineHit {
  chunk: Chunk;
  /** The text that was actually indexed (chunk text, possibly with a context header). */
  indexedText: string;
  /** Final score after fusion and reranking. After a reranker this is rank-derived, see `search`. */
  score: number;
  /** Final 1-based rank. */
  rank: number;
  signals: { bm25?: Signal; vector?: Signal; fused?: Signal; rerank?: Signal & { before: number } };
}

export interface SearchResult {
  query: string;
  /** Analyzed query terms, as BM25 and the highlighter see them. */
  queryTerms: string[];
  /** Top-k chunks. */
  hits: PipelineHit[];
  /** Top-k documents, aggregated from the deeper chunk list. */
  docs: DocHit[];
  /** Every retrieved document id in aggregated order (deeper than k; used for evaluation). */
  rankedDocIds: string[];
  /** How many chunks were retrieved before aggregation. */
  depth: number;
}

export interface SearchOptions {
  k?: number;
  /** Chunks retrieved before aggregation to documents. Default max(5k, 50). */
  depth?: number;
}

function rankMap(list: readonly ScoredId[]): Map<string, Signal> {
  const map = new Map<string, Signal>();
  list.forEach((hit, i) => {
    if (!map.has(hit.id)) map.set(hit.id, { score: hit.score, rank: i + 1 });
  });
  return map;
}

/**
 * One retrieval strategy (chunker + retriever + optional reranker + aggregation) over one corpus.
 * Build it once, search many times.
 */
export class RetrievalPipeline {
  readonly config: PipelineConfig;
  readonly cache: IndexCache;
  readonly chunks: Chunk[];
  private readonly items: Map<string, IndexItem>;
  private readonly chunkById: Map<string, Chunk>;
  private readonly bm25?: Bm25Index;
  private readonly vector?: VectorIndex;
  private mmrVectors?: VectorIndex;

  private constructor(config: PipelineConfig, cache: IndexCache, bm25?: Bm25Index, vector?: VectorIndex) {
    this.config = config;
    this.cache = cache;
    this.chunks = cache.chunks(config.chunker);
    this.chunkById = new Map(this.chunks.map((c) => [c.id, c]));
    this.items = new Map(cache.items(config.chunker, config.contextHeaders).map((i) => [i.id, i]));
    this.bm25 = bm25;
    this.vector = vector;
  }

  static async build(
    docs: readonly SourceDocument[] | IndexCache,
    config: PipelineConfig,
    embedderOptions: EmbedderFactoryOptions = {},
  ): Promise<RetrievalPipeline> {
    const cache = docs instanceof IndexCache ? docs : new IndexCache(docs, embedderOptions);
    const r: RetrieverConfig = config.retriever;
    const bm25 =
      r.type === "bm25" || r.type === "hybrid"
        ? cache.bm25(config.chunker, config.contextHeaders, r.bm25, config.analyzer)
        : undefined;
    const vector =
      r.type === "vector" || r.type === "hybrid"
        ? await cache.vector(config.chunker, config.contextHeaders, r.embedder)
        : undefined;
    const pipeline = new RetrievalPipeline(config, cache, bm25, vector);
    if (config.reranker.type === "mmr") {
      pipeline.mmrVectors =
        vector ?? (await cache.vector(config.chunker, config.contextHeaders, DEFAULT_HASHING_CONFIG));
    }
    return pipeline;
  }

  get bm25Index(): Bm25Index | undefined {
    return this.bm25;
  }

  queryTerms(query: string): string[] {
    return [...new Set(analyze(query, this.config.analyzer))];
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const k = options.k ?? 10;
    const depth = Math.max(options.depth ?? Math.max(5 * k, 50), k);
    const r = this.config.retriever;
    const signals = new Map<string, PipelineHit["signals"]>();
    const signalOf = (id: string) => {
      let s = signals.get(id);
      if (!s) signals.set(id, (s = {}));
      return s;
    };

    let list: Hit[];
    if (r.type === "bm25") {
      list = this.bm25!.search(query, depth);
      for (const [id, s] of rankMap(list)) signalOf(id).bm25 = s;
    } else if (r.type === "vector") {
      list = await this.vector!.search(query, depth);
      for (const [id, s] of rankMap(list)) signalOf(id).vector = s;
    } else {
      const candidates = Math.max(r.depth, depth);
      const lexical = this.bm25!.search(query, candidates);
      const dense = await this.vector!.search(query, candidates);
      const lists = [
        { name: "bm25", hits: lexical },
        { name: "vector", hits: dense },
      ];
      const fused =
        r.fusion.type === "rrf"
          ? reciprocalRankFusion(lists, r.fusion.k)
          : weightedFusion(lists, [r.fusion.alpha, 1 - r.fusion.alpha]);
      const bm25Ranks = rankMap(lexical);
      const vectorRanks = rankMap(dense);
      const fusedRanks = rankMap(fused);
      for (const hit of fused) {
        const s = signalOf(hit.id);
        s.bm25 = bm25Ranks.get(hit.id) ?? { score: 0, rank: null };
        s.vector = vectorRanks.get(hit.id) ?? { score: 0, rank: null };
        s.fused = fusedRanks.get(hit.id)!;
      }
      list = fused.slice(0, depth).map((h) => ({ ...h, docId: this.items.get(h.id)!.docId }));
    }

    const queryTerms = this.queryTerms(query);
    const rr = this.config.reranker;
    if (rr.type !== "none" && list.length > 0) {
      const head = list.slice(0, rr.depth);
      const tail = list.slice(rr.depth);
      const reranked =
        rr.type === "mmr"
          ? mmrRerank(head, (id) => this.mmrVectors?.vectorOf(id), rr.lambda)
          : lexicalRerank(head, queryTerms, (id) => this.items.get(id), rr.weight, this.config.analyzer);
      const before = new Map(head.map((h, i) => [h.id, i + 1]));
      reranked.forEach((h, i) => {
        signalOf(h.id).rerank = { score: h.objective, rank: i + 1, before: before.get(h.id)! };
      });
      // Reranker objectives are not comparable with the original scores, so the final scores become
      // rank-derived ((n - i) / n): aggregation to documents then follows the reranked order.
      const ordered = [...reranked.map((h) => h.id), ...tail.map((h) => h.id)];
      list = ordered.map((id, i) => ({
        id,
        docId: this.items.get(id)!.docId,
        score: (ordered.length - i) / ordered.length,
      }));
    }

    const hits: PipelineHit[] = list.slice(0, k).map((hit, i) => ({
      chunk: this.chunkById.get(hit.id)!,
      indexedText: this.items.get(hit.id)!.text,
      score: hit.score,
      rank: i + 1,
      signals: signals.get(hit.id) ?? {},
    }));
    const allDocs = aggregateToDocs(list, this.config.aggregation);
    return {
      query,
      queryTerms,
      hits,
      docs: allDocs.slice(0, k),
      rankedDocIds: allDocs.map((d) => d.docId),
      depth: list.length,
    };
  }
}

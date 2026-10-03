import {
  AggregationSchema,
  ChunkerConfigSchema,
  PipelineConfigSchema,
  RerankerConfigSchema,
  RetrieverConfigSchema,
  type ChunkerConfig,
  type ChunkerType,
  type PipelineConfig,
} from "@/src/core";

/**
 * Playground and corpus state <-> short URL query parameters, so every view is shareable. Only
 * values that differ from the defaults are written, and anything invalid falls back to its default
 * instead of breaking the page.
 */

export const CHUNKER_TYPES: readonly ChunkerType[] = [
  "recursive",
  "markdown",
  "sentence",
  "paragraph",
  "fixed-chars",
  "fixed-tokens",
  "none",
];

export function defaultChunker(type: ChunkerType): ChunkerConfig {
  switch (type) {
    case "none":
      return { type };
    case "fixed-chars":
      return { type, size: 500, overlap: 100 };
    case "fixed-tokens":
      return { type, size: 100, overlap: 20 };
    case "sentence":
      return { type, maxChars: 500, overlapSentences: 0 };
    case "paragraph":
      return { type, maxChars: 0 };
    case "markdown":
      return { type, maxChars: 800 };
    case "recursive":
      return { type, size: 500, overlap: 100 };
  }
}

export const DEFAULT_PIPELINE: PipelineConfig = PipelineConfigSchema.parse({
  chunker: defaultChunker("recursive"),
  retriever: { type: "hybrid" },
});

export const DEFAULT_K = 5;
export const K_OPTIONS = [3, 5, 10, 20] as const;

export interface PlaygroundState {
  query: string;
  k: number;
  config: PipelineConfig;
}

/** The "size-like" and "overlap-like" numbers of a chunker, whatever their field names. */
export function chunkerNumbers(c: ChunkerConfig): { size?: number; overlap?: number } {
  switch (c.type) {
    case "none":
      return {};
    case "fixed-chars":
    case "fixed-tokens":
    case "recursive":
      return { size: c.size, overlap: c.overlap };
    case "sentence":
      return { size: c.maxChars, overlap: c.overlapSentences };
    case "paragraph":
    case "markdown":
      return { size: c.maxChars };
  }
}

export function withChunkerNumbers(c: ChunkerConfig, size?: number, overlap?: number): ChunkerConfig {
  const d = chunkerNumbers(defaultChunker(c.type));
  const s = size ?? d.size;
  const o = overlap ?? d.overlap;
  const raw =
    c.type === "none"
      ? { type: c.type }
      : c.type === "sentence"
        ? { type: c.type, maxChars: s, overlapSentences: o }
        : c.type === "paragraph" || c.type === "markdown"
          ? { type: c.type, maxChars: s }
          : { type: c.type, size: s, overlap: o };
  const parsed = ChunkerConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultChunker(c.type);
}

const numberParam = (sp: URLSearchParams, key: string): number | undefined => {
  const raw = sp.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

export function chunkerFromParams(sp: URLSearchParams): ChunkerConfig {
  const type = sp.get("ch");
  const base = CHUNKER_TYPES.includes(type as ChunkerType)
    ? defaultChunker(type as ChunkerType)
    : DEFAULT_PIPELINE.chunker;
  return withChunkerNumbers(base, numberParam(sp, "cs"), numberParam(sp, "co"));
}

export function chunkerToParams(
  c: ChunkerConfig,
  sp: URLSearchParams,
  fallback: ChunkerConfig = DEFAULT_PIPELINE.chunker,
) {
  if (c.type !== fallback.type) sp.set("ch", c.type);
  const d = chunkerNumbers(defaultChunker(c.type));
  const n = chunkerNumbers(c);
  if (n.size !== undefined && n.size !== d.size) sp.set("cs", String(n.size));
  if (n.overlap !== undefined && n.overlap !== d.overlap) sp.set("co", String(n.overlap));
}

export function stateFromParams(sp: URLSearchParams): PlaygroundState {
  const chunker = chunkerFromParams(sp);
  const bm25 = { k1: numberParam(sp, "k1") ?? 1.2, b: numberParam(sp, "b") ?? 0.75 };
  const type = sp.get("r") ?? DEFAULT_PIPELINE.retriever.type;
  const fusion =
    sp.get("f") === "weighted"
      ? { type: "weighted", alpha: numberParam(sp, "fa") ?? 0.5 }
      : { type: "rrf", k: numberParam(sp, "fk") ?? 60 };
  const retrieverRaw =
    type === "bm25" ? { type, bm25 } : type === "vector" ? { type } : { type: "hybrid", bm25, fusion };
  const retriever = RetrieverConfigSchema.safeParse(retrieverRaw);

  const rerankType = sp.get("rr");
  const rerankerRaw =
    rerankType === "mmr"
      ? { type: "mmr", lambda: numberParam(sp, "rl") ?? 0.7 }
      : rerankType === "lexical"
        ? { type: "lexical", weight: numberParam(sp, "rw") ?? 0.5 }
        : { type: "none" };
  const reranker = RerankerConfigSchema.safeParse(rerankerRaw);
  const aggregation = AggregationSchema.safeParse(sp.get("agg") ?? "max");
  const kParam = numberParam(sp, "k");
  const agg = aggregation.success ? aggregation.data : "max";
  // A reranker only combines with "max" aggregation (see rerankerAggregationOk); sum/mean win.
  const rerankerConfig = reranker.success && agg === "max" ? reranker.data : DEFAULT_PIPELINE.reranker;

  return {
    query: (sp.get("q") ?? "").slice(0, 500),
    k: kParam !== undefined && (K_OPTIONS as readonly number[]).includes(kParam) ? kParam : DEFAULT_K,
    config: {
      ...DEFAULT_PIPELINE,
      chunker,
      retriever: retriever.success ? retriever.data : DEFAULT_PIPELINE.retriever,
      reranker: rerankerConfig,
      aggregation: agg,
      contextHeaders: sp.get("ctx") === "1",
    },
  };
}

export function stateToParams(state: PlaygroundState): URLSearchParams {
  const sp = new URLSearchParams();
  const { config } = state;
  if (state.query) sp.set("q", state.query);
  if (state.k !== DEFAULT_K) sp.set("k", String(state.k));
  chunkerToParams(config.chunker, sp);
  const r = config.retriever;
  if (r.type !== DEFAULT_PIPELINE.retriever.type) sp.set("r", r.type);
  if (r.type === "bm25" || r.type === "hybrid") {
    if (r.bm25.k1 !== 1.2) sp.set("k1", String(r.bm25.k1));
    if (r.bm25.b !== 0.75) sp.set("b", String(r.bm25.b));
  }
  if (r.type === "hybrid") {
    if (r.fusion.type === "weighted") {
      sp.set("f", "weighted");
      if (r.fusion.alpha !== 0.5) sp.set("fa", String(r.fusion.alpha));
    } else if (r.fusion.k !== 60) sp.set("fk", String(r.fusion.k));
  }
  const rr = config.reranker;
  if (rr.type !== "none") sp.set("rr", rr.type);
  if (rr.type === "mmr" && rr.lambda !== 0.7) sp.set("rl", String(rr.lambda));
  if (rr.type === "lexical" && rr.weight !== 0.5) sp.set("rw", String(rr.weight));
  if (config.aggregation !== "max") sp.set("agg", config.aggregation);
  if (config.contextHeaders) sp.set("ctx", "1");
  return sp;
}

/** Replaces the query string without a navigation (Next.js keeps useSearchParams in sync). */
export function replaceSearch(sp: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const search = sp.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", url);
  }
}

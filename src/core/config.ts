import { z } from "zod";

/**
 * Every configurable piece of a retrieval pipeline, as zod schemas. The same schemas validate CLI
 * grid files, URL state in the web UI and user-provided JSON, so there is one source of truth.
 */

const size = z.number().int().min(1).max(100_000);
const overlap = z.number().int().min(0).max(100_000);
const overlapBelowSize = (c: { size: number; overlap: number }) => c.overlap < c.size;
const overlapMessage = { message: "overlap must be smaller than size", path: ["overlap"] };

export const ChunkerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z
    .object({ type: z.literal("fixed-chars"), size, overlap: overlap.default(0) })
    .refine(overlapBelowSize, overlapMessage),
  z
    .object({ type: z.literal("fixed-tokens"), size, overlap: overlap.default(0) })
    .refine(overlapBelowSize, overlapMessage),
  z.object({
    type: z.literal("sentence"),
    maxChars: size,
    overlapSentences: z.number().int().min(0).max(20).default(0),
  }),
  z.object({ type: z.literal("paragraph"), maxChars: z.number().int().min(0).max(100_000).default(0) }),
  z.object({ type: z.literal("markdown"), maxChars: size }),
  z
    .object({ type: z.literal("recursive"), size, overlap: overlap.default(0) })
    .refine(overlapBelowSize, overlapMessage),
]);
export type ChunkerConfig = z.infer<typeof ChunkerConfigSchema>;
export type ChunkerType = ChunkerConfig["type"];

export const Bm25ParamsSchema = z.object({
  k1: z.number().min(0).max(10).default(1.2),
  b: z.number().min(0).max(1).default(0.75),
});
export type Bm25Params = z.infer<typeof Bm25ParamsSchema>;

export const EmbedderConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hashing"),
    dims: z.number().int().min(16).max(65_536).default(1024),
    /** Weight of word bigram features relative to unigrams. */
    bigramWeight: z.number().min(0).max(10).default(0.5),
    /** Weight of each character trigram feature relative to unigrams. */
    charWeight: z.number().min(0).max(10).default(0.35),
  }),
  /**
   * A network embedder. The base URL is deliberately NOT part of the config: it only comes from the
   * CLI `--embed-url` flag or the `RLAB_EMBEDDINGS_BASE_URL` variable, so a grid file someone sends
   * you can never redirect your API key to another host. Unknown keys (such as `baseUrl`) are rejected.
   */
  z.strictObject({
    type: z.literal("openai"),
    model: z.string().min(1),
    dimensions: z.number().int().positive().optional(),
    batchSize: z.number().int().min(1).max(2048).default(64),
  }),
]);
export type EmbedderConfig = z.infer<typeof EmbedderConfigSchema>;

export const FusionConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rrf"), k: z.number().min(0).max(1000).default(60) }),
  /** Min-max normalize each list, then `alpha * bm25 + (1 - alpha) * vector`. */
  z.object({ type: z.literal("weighted"), alpha: z.number().min(0).max(1).default(0.5) }),
]);
export type FusionConfig = z.infer<typeof FusionConfigSchema>;

const hashingDefault = { type: "hashing" as const, dims: 1024, bigramWeight: 0.5, charWeight: 0.35 };

export const RetrieverConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bm25"), bm25: Bm25ParamsSchema.default({ k1: 1.2, b: 0.75 }) }),
  z.object({ type: z.literal("vector"), embedder: EmbedderConfigSchema.default(hashingDefault) }),
  z.object({
    type: z.literal("hybrid"),
    bm25: Bm25ParamsSchema.default({ k1: 1.2, b: 0.75 }),
    embedder: EmbedderConfigSchema.default(hashingDefault),
    fusion: FusionConfigSchema.default({ type: "rrf", k: 60 }),
    /** How many candidates each retriever contributes before fusion. */
    depth: z.number().int().min(1).max(10_000).default(100),
  }),
]);
export type RetrieverConfig = z.infer<typeof RetrieverConfigSchema>;
export type RetrieverType = RetrieverConfig["type"];

export const RerankerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  /** Maximal Marginal Relevance: lambda = 1 is pure relevance, 0 is pure diversity. */
  z.object({
    type: z.literal("mmr"),
    lambda: z.number().min(0).max(1).default(0.7),
    depth: z.number().int().min(1).max(1000).default(30),
  }),
  /** Heuristic lexical reranker: blends the retrieval score with query-term coverage and proximity. */
  z.object({
    type: z.literal("lexical"),
    weight: z.number().min(0).max(1).default(0.5),
    depth: z.number().int().min(1).max(1000).default(30),
  }),
]);
export type RerankerConfig = z.infer<typeof RerankerConfigSchema>;

export const AnalyzerConfigSchema = z.object({
  stem: z.enum(["auto", "none"]).default("auto"),
  stopwords: z.boolean().default(true),
});

export const AggregationSchema = z.enum(["max", "sum", "mean"]);
export type Aggregation = z.infer<typeof AggregationSchema>;

/**
 * Rerankers replace scores with rank-derived ones, so summing or averaging them per document would
 * rank documents by how many chunks they have. Policy: a reranker only combines with `max`.
 */
export const RERANK_AGGREGATION_MESSAGE =
  'a reranker can only be combined with aggregation "max" (sum/mean over rank-derived scores would count chunks)';

export function rerankerAggregationOk(c: { reranker: { type: string }; aggregation: string }): boolean {
  return c.reranker.type === "none" || c.aggregation === "max";
}

export const PipelineConfigSchema = z
  .object({
    chunker: ChunkerConfigSchema,
    retriever: RetrieverConfigSchema,
    reranker: RerankerConfigSchema.default({ type: "none" }),
    analyzer: AnalyzerConfigSchema.default({ stem: "auto", stopwords: true }),
    /** How chunk scores become a document score (documents are what queries are judged against). */
    aggregation: AggregationSchema.default("max"),
    /** Prepend the document title and heading path to each chunk before indexing it. */
    contextHeaders: z.boolean().default(false),
  })
  .refine(rerankerAggregationOk, { message: RERANK_AGGREGATION_MESSAGE, path: ["aggregation"] });
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type PipelineConfigInput = z.input<typeof PipelineConfigSchema>;

export const GridSchema = z
  .object({
    name: z.string().optional(),
    chunkers: z.array(ChunkerConfigSchema).min(1),
    retrievers: z.array(RetrieverConfigSchema).min(1),
    rerankers: z
      .array(RerankerConfigSchema)
      .min(1)
      .default([{ type: "none" }]),
    contextHeaders: z.array(z.boolean()).min(1).default([false]),
    analyzer: AnalyzerConfigSchema.default({ stem: "auto", stopwords: true }),
    aggregation: AggregationSchema.default("max"),
    /** Rank cutoffs for recall, precision, hit rate and nDCG. MRR and MAP use the largest one. */
    cutoffs: z.array(z.number().int().min(1).max(1000)).min(1).default([5, 10]),
    bootstrap: z
      .object({
        samples: z.number().int().min(100).max(100_000).default(2000),
        seed: z.number().int().default(42),
      })
      .default({ samples: 2000, seed: 42 }),
  })
  .refine((g) => g.aggregation === "max" || g.rerankers.every((r) => r.type === "none"), {
    message: RERANK_AGGREGATION_MESSAGE,
    path: ["aggregation"],
  });
export type Grid = z.infer<typeof GridSchema>;
export type GridInput = z.input<typeof GridSchema>;

export function parsePipelineConfig(input: unknown): PipelineConfig {
  return PipelineConfigSchema.parse(input);
}

/** Short human-readable label, e.g. "recursive(800/100) · hybrid rrf(60) · mmr(0.7)". */
export function describeChunker(c: ChunkerConfig): string {
  switch (c.type) {
    case "none":
      return "whole-doc";
    case "fixed-chars":
      return `chars(${c.size}/${c.overlap})`;
    case "fixed-tokens":
      return `tokens(${c.size}/${c.overlap})`;
    case "sentence":
      return c.overlapSentences > 0 ? `sentence(${c.maxChars}/+${c.overlapSentences})` : `sentence(${c.maxChars})`;
    case "paragraph":
      return c.maxChars > 0 ? `paragraph(${c.maxChars})` : "paragraph";
    case "markdown":
      return `markdown(${c.maxChars})`;
    case "recursive":
      return `recursive(${c.size}/${c.overlap})`;
  }
}

export function describeEmbedder(e: EmbedderConfig): string {
  return e.type === "hashing" ? `hash${e.dims}` : `${e.model}`;
}

export function describeRetriever(r: RetrieverConfig): string {
  switch (r.type) {
    case "bm25":
      return `bm25(${r.bm25.k1},${r.bm25.b})`;
    case "vector":
      return `vector(${describeEmbedder(r.embedder)})`;
    case "hybrid": {
      const fusion = r.fusion.type === "rrf" ? `rrf${r.fusion.k}` : `w${r.fusion.alpha}`;
      return `hybrid(${fusion})`;
    }
  }
}

export function describeReranker(r: RerankerConfig): string {
  if (r.type === "none") return "";
  if (r.type === "mmr") return `mmr(${r.lambda})`;
  return `lexical(${r.weight})`;
}

export function describePipeline(c: PipelineConfig): string {
  const parts = [describeChunker(c.chunker), describeRetriever(c.retriever)];
  const rerank = describeReranker(c.reranker);
  if (rerank) parts.push(rerank);
  if (c.contextHeaders) parts.push("ctx");
  return parts.join(" · ");
}

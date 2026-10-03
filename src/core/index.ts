// Public API of the retrieval-lab core. Pure TypeScript: runs in the browser, Node and the CLI.

export * from "./config";
export { fnv1a32 } from "./hash";

export { foldAccents, normalizeText } from "./text/normalize";
export { tokenize, tokenizeToStrings, type Token } from "./text/tokenize";
export { STOPWORDS_ALL, STOPWORDS_EN, STOPWORDS_PT, stopwordsFor, type Language } from "./text/stopwords";
export { stemEn, stemPt } from "./text/stem";
export { charNgrams, wordNgrams } from "./text/ngrams";
export { splitSentences, type Span } from "./text/sentences";
export {
  analyze,
  analyzeTokens,
  DEFAULT_ANALYZER,
  detectLanguage,
  resolveLanguage,
  stemsFor,
  type AnalyzedToken,
  type AnalyzerOptions,
  type DetectedLanguage,
} from "./text/analyzer";

export * from "./chunking";

export type { Hit, IndexItem, ScoredId } from "./retrieval/types";
export { compareScored } from "./retrieval/types";
export { topK } from "./retrieval/topk";
export { Bm25Index, DEFAULT_BM25, type Bm25Options, type TermContribution } from "./retrieval/bm25";
export { cosine, dot, l2Normalize, type Embedder } from "./retrieval/embedder";
export { DEFAULT_HASHING, HashingEmbedder, type HashingEmbedderOptions } from "./retrieval/hashing-embedder";
export {
  EmbeddingRequestError,
  OpenAICompatibleEmbedder,
  type OpenAICompatibleEmbedderOptions,
} from "./retrieval/openai-embedder";
export { VectorIndex } from "./retrieval/vector-index";
export { minMaxNormalize, reciprocalRankFusion, weightedFusion, type RankedList } from "./retrieval/fusion";
export {
  lexicalFeatures,
  lexicalRerank,
  minimalCoverWindow,
  mmrRerank,
  type LexicalFeatures,
  type Reranked,
} from "./retrieval/rerank";
export { aggregateToDocs, type DocHit } from "./retrieval/aggregate";
export {
  contextHeader,
  createEmbedder,
  IndexCache,
  RetrievalPipeline,
  type EmbedderFactoryOptions,
  type PipelineHit,
  type SearchOptions,
  type SearchResult,
  type Signal,
} from "./retrieval/pipeline";

export * from "./eval/dataset";
export * from "./eval/metrics";
export * from "./eval/stats";
export * from "./eval/experiment";
export * from "./export/report";

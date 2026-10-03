import { describePipeline, GridSchema, type Grid, type GridInput, type PipelineConfig } from "../config";
import { analyze } from "../text/analyzer";
import { IndexCache, RetrievalPipeline, type EmbedderFactoryOptions } from "../retrieval/pipeline";
import { qrelsByQuery, type Dataset } from "./dataset";
import { computeMetrics, mean, metricKeys } from "./metrics";
import { bootstrapMeanCI, pairedBootstrap, type BootstrapOptions, type PairedComparison } from "./stats";

export type DiagnosisKind = "ok" | "ranked-low" | "outranked" | "vocabulary-mismatch";

export interface QueryResult {
  queryId: string;
  metrics: Record<string, number>;
  /** Top documents (up to the largest cutoff) with their judged grade (0 if unjudged). */
  retrieved: { docId: string; score: number; grade: number }[];
  /** Every relevant document and where it ended up (null: not retrieved at all). */
  relevant: { docId: string; grade: number; rank: number | null }[];
  diagnosis: { kind: DiagnosisKind; firstRelevantRank: number | null };
}

export interface ConfigResult {
  id: string;
  label: string;
  config: PipelineConfig;
  /** Mean of each metric over all queries. */
  metrics: Record<string, number>;
  /** Percentile-bootstrap 95% confidence interval of each mean. */
  ci: Record<string, [number, number]>;
  perQuery: QueryResult[];
  chunkCount: number;
  timings: { buildMs: number; meanQueryMs: number };
}

export interface ExperimentResult {
  dataset: { name: string; documents: number; queries: number };
  grid: Grid;
  metricKeys: string[];
  /** nDCG at the largest cutoff: the metric used for default sorting and comparisons. */
  primaryMetric: string;
  queryIds: string[];
  configs: ConfigResult[];
}

export interface ExperimentOptions {
  embedderOptions?: EmbedderFactoryOptions;
  onProgress?: (done: number, total: number, label: string) => void;
  signal?: AbortSignal;
}

/** Cartesian product of the grid: chunkers × retrievers × rerankers × context-header settings. */
export function expandGrid(grid: Grid): PipelineConfig[] {
  const out: PipelineConfig[] = [];
  for (const chunker of grid.chunkers)
    for (const retriever of grid.retrievers)
      for (const reranker of grid.rerankers)
        for (const contextHeaders of grid.contextHeaders)
          out.push({
            chunker,
            retriever,
            reranker,
            contextHeaders,
            analyzer: grid.analyzer,
            aggregation: grid.aggregation,
          });
  return out;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Runs every configuration of the grid over every query of the dataset and scores the document
 * rankings against the judgments. Deterministic apart from the timings.
 */
export async function runExperiment(
  dataset: Dataset,
  gridInput: GridInput | Grid,
  options: ExperimentOptions = {},
): Promise<ExperimentResult> {
  const grid = GridSchema.parse(gridInput);
  const qrels = qrelsByQuery(dataset);
  const keys = metricKeys(grid.cutoffs);
  const maxCutoff = Math.max(...grid.cutoffs);
  const primaryMetric = `ndcg@${maxCutoff}`;
  const cache = new IndexCache(dataset.documents, options.embedderOptions);
  const docTerms = new Map(
    dataset.documents.map((d) => [d.id, new Set(analyze(`${d.title ?? ""}\n${d.text}`, grid.analyzer, d.lang))]),
  );
  const configs = expandGrid(grid);
  const results: ConfigResult[] = [];
  const usedIds = new Set<string>();

  for (const [index, config] of configs.entries()) {
    if (options.signal?.aborted) throw new DOMException("Experiment aborted", "AbortError");
    const label = describePipeline(config);
    let id = label;
    for (let n = 2; usedIds.has(id); n++) id = `${label} #${n}`;
    usedIds.add(id);

    const buildStart = now();
    const pipeline = await RetrievalPipeline.build(cache, config);
    const buildMs = now() - buildStart;

    const perQuery: QueryResult[] = [];
    let queryMs = 0;
    for (const query of dataset.queries) {
      const judged = qrels.get(query.id) ?? new Map<string, number>();
      const start = now();
      const result = await pipeline.search(query.text, { k: maxCutoff });
      queryMs += now() - start;
      const ranked = result.rankedDocIds;
      const metrics = computeMetrics(ranked, judged, grid.cutoffs);
      const relevant = [...judged]
        .map(([docId, grade]) => {
          const pos = ranked.indexOf(docId);
          return { docId, grade, rank: pos === -1 ? null : pos + 1 };
        })
        .sort((a, b) => b.grade - a.grade || (a.rank ?? Infinity) - (b.rank ?? Infinity));
      const firstRelevantRank = relevant.reduce<number | null>(
        (best, r) => (r.rank !== null && (best === null || r.rank < best) ? r.rank : best),
        null,
      );
      let kind: DiagnosisKind;
      if (firstRelevantRank === 1) kind = "ok";
      else if (firstRelevantRank !== null && firstRelevantRank <= maxCutoff) kind = "ranked-low";
      else {
        const terms = result.queryTerms;
        const overlap = relevant.some((r) => terms.some((t) => docTerms.get(r.docId)?.has(t)));
        kind = overlap ? "outranked" : "vocabulary-mismatch";
      }
      perQuery.push({
        queryId: query.id,
        metrics,
        retrieved: result.docs.map((d) => ({ docId: d.docId, score: d.score, grade: judged.get(d.docId) ?? 0 })),
        relevant,
        diagnosis: { kind, firstRelevantRank },
      });
    }

    const means: Record<string, number> = {};
    const ci: Record<string, [number, number]> = {};
    for (const key of keys) {
      const values = perQuery.map((q) => q.metrics[key] ?? 0);
      means[key] = mean(values);
      ci[key] = bootstrapMeanCI(values, { samples: grid.bootstrap.samples, seed: grid.bootstrap.seed });
    }
    results.push({
      id,
      label,
      config,
      metrics: means,
      ci,
      perQuery,
      chunkCount: pipeline.chunks.length,
      timings: { buildMs, meanQueryMs: dataset.queries.length > 0 ? queryMs / dataset.queries.length : 0 },
    });
    options.onProgress?.(index + 1, configs.length, label);
  }

  return {
    dataset: { name: dataset.name, documents: dataset.documents.length, queries: dataset.queries.length },
    grid,
    metricKeys: keys,
    primaryMetric,
    queryIds: dataset.queries.map((q) => q.id),
    configs: results,
  };
}

/** Is B better than A on `metric`? Paired bootstrap over the per-query values. */
export function compareConfigs(
  a: ConfigResult,
  b: ConfigResult,
  metric: string,
  options: BootstrapOptions = {},
): PairedComparison {
  const byQuery = new Map(b.perQuery.map((q) => [q.queryId, q.metrics[metric] ?? 0]));
  const shared = a.perQuery.filter((q) => byQuery.has(q.queryId));
  return pairedBootstrap(
    shared.map((q) => q.metrics[metric] ?? 0),
    shared.map((q) => byQuery.get(q.queryId)!),
    options,
  );
}

/** Configurations sorted by a metric, best first (ties keep grid order). */
export function rankConfigs(result: ExperimentResult, metric = result.primaryMetric): ConfigResult[] {
  return [...result.configs].sort((x, y) => (y.metrics[metric] ?? 0) - (x.metrics[metric] ?? 0));
}

/**
 * Mean of `metric` per query tag (a query with several tags counts in each), for one configuration.
 * Shows where a strategy wins or loses: paraphrases, typos, cross-lingual queries...
 */
export function metricsByTag(
  config: ConfigResult,
  queries: readonly { id: string; tags?: string[] }[],
  metric: string,
): { tag: string; mean: number; count: number }[] {
  const values = new Map(config.perQuery.map((q) => [q.queryId, q.metrics[metric] ?? 0]));
  const byTag = new Map<string, number[]>();
  for (const query of queries) {
    const value = values.get(query.id);
    if (value === undefined) continue;
    for (const tag of query.tags ?? []) {
      const list = byTag.get(tag);
      if (list) list.push(value);
      else byTag.set(tag, [value]);
    }
  }
  return [...byTag]
    .map(([tag, list]) => ({ tag, mean: mean(list), count: list.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  computeMetrics,
  IndexCache,
  qrelsByQuery,
  RetrievalPipeline,
  type DatasetQuery,
  type SearchResult,
} from "@/src/core";
import { useCorpus } from "@/lib/corpus-store";
import { useDict } from "@/lib/locale-context";
import { replaceSearch, stateFromParams, stateToParams, type PlaygroundState } from "@/lib/url-state";
import { StrategyControls } from "../strategy-controls";
import { Badge, Button, cx, fmt3, Notice, Panel, Segmented, Skeleton } from "../ui";
import { DocList, ResultCard } from "./results";

const EXAMPLE_TAGS = ["paraphrase", "cross-lingual", "no-accents", "typo", "long-doc", "keyword"];

function pickExamples(queries: readonly DatasetQuery[] | undefined): DatasetQuery[] {
  if (!queries) return [];
  const picked: DatasetQuery[] = [];
  for (const tag of EXAMPLE_TAGS) {
    const q = queries.find((x) => x.tags?.includes(tag) && !picked.includes(x));
    if (q) picked.push(q);
  }
  return picked;
}

const normalizeQuery = (q: string) => q.trim().toLowerCase();

interface Built {
  pipeline: RetrievalPipeline;
  ms: number;
  key: string;
}

export function Playground() {
  const dict = useDict();
  const { source } = useCorpus();
  const searchParams = useSearchParams();
  const examples = useMemo(() => pickExamples(source.dataset?.queries), [source.dataset]);
  const [state, setState] = useState<PlaygroundState>(() => {
    const initial = stateFromParams(new URLSearchParams(searchParams.toString()));
    return initial.query || searchParams.has("q") ? initial : { ...initial, query: examples[0]?.text ?? "" };
  });
  const [view, setView] = useState<"chunks" | "docs">("chunks");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [search, setSearch] = useState<{ result: SearchResult; ms: number; key: string } | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState(state.query);
  const controlsId = useId();

  useEffect(() => replaceSearch(stateToParams(state)), [state]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(state.query), 120);
    return () => window.clearTimeout(timer);
  }, [state.query]);

  // Chunks, BM25 indexes and embeddings are cached per corpus, so switching a reranker or a fusion
  // parameter does not re-chunk or re-embed anything.
  const cache = useMemo(() => new IndexCache(source.docs), [source.docs]);
  const configKey = JSON.stringify(state.config);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    RetrievalPipeline.build(cache, JSON.parse(configKey))
      .then((pipeline) => {
        if (cancelled) return;
        setBuildError(null);
        setBuilt({ pipeline, ms: performance.now() - started, key: configKey });
      })
      .catch((error: unknown) => {
        if (!cancelled) setBuildError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [cache, configKey]);

  useEffect(() => {
    if (!built) return;
    let cancelled = false;
    const query = debouncedQuery.trim();
    const key = `${built.key}|${query}|${state.k}`;
    const started = performance.now();
    built.pipeline
      .search(query, { k: state.k })
      .then((result) => {
        if (!cancelled) setSearch({ result, ms: performance.now() - started, key });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [built, debouncedQuery, state.k]);

  const docsById = useMemo(() => new Map(source.docs.map((d) => [d.id, d])), [source.docs]);
  const judged = useMemo(() => {
    if (!source.dataset) return null;
    const query = source.dataset.queries.find((q) => normalizeQuery(q.text) === normalizeQuery(debouncedQuery));
    if (!query) return null;
    return { query, qrels: qrelsByQuery(source.dataset).get(query.id) ?? new Map<string, number>() };
  }, [source.dataset, debouncedQuery]);

  const result = search?.result;
  const metrics = judged && result ? computeMetrics(result.rankedDocIds, judged.qrels, [10]) : null;
  const pending = !built || (built.key !== configKey && !buildError);
  const maxSignal = useMemo(() => {
    const max = { bm25: 0, vector: 0, fused: 0 };
    for (const hit of result?.hits ?? []) {
      max.bm25 = Math.max(max.bm25, hit.signals.bm25?.score ?? 0);
      max.vector = Math.max(max.vector, hit.signals.vector?.score ?? 0);
      max.fused = Math.max(max.fused, hit.signals.fused?.score ?? 0);
    }
    return max;
  }, [result]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
      <aside aria-label={dict.controls.strategy}>
        <div className="lg:hidden">
          <Button
            variant="secondary"
            className="w-full justify-between"
            aria-expanded={controlsOpen}
            aria-controls={controlsId}
            onClick={() => setControlsOpen((o) => !o)}
          >
            <span>{dict.controls.strategy}</span>
            <span aria-hidden className="font-mono text-faint">
              {controlsOpen ? "−" : "+"}
            </span>
          </Button>
        </div>
        <Panel
          as="div"
          className={cx("mt-2 p-4 lg:sticky lg:top-4 lg:mt-0 lg:block", controlsOpen ? "block" : "hidden")}
        >
          <div id={controlsId} className="space-y-5">
            <StrategyControls
              config={state.config}
              k={state.k}
              onChange={(config) => setState((s) => ({ ...s, config }))}
              onK={(k) => setState((s) => ({ ...s, k }))}
            />
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setState((s) => ({ ...stateFromParams(new URLSearchParams()), query: s.query }))}
            >
              {dict.common.reset}
            </Button>
          </div>
        </Panel>
      </aside>
      <div className="min-w-0">
        <div className="mb-4">
          <label htmlFor="query" className="mb-1.5 block text-[0.8rem] font-medium text-muted">
            {dict.playground.queryLabel}
          </label>
          <input
            id="query"
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="field min-h-11 text-[1rem]"
            placeholder={dict.playground.queryPlaceholder}
            value={state.query}
            onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
          />
          {examples.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[0.75rem] text-faint">{dict.playground.examples}</p>
              <ul className="flex flex-wrap gap-1.5">
                {examples.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => setState((s) => ({ ...s, query: q.text }))}
                      aria-pressed={normalizeQuery(q.text) === normalizeQuery(state.query)}
                      className={cx(
                        "rounded-md border px-2 py-1 text-left text-[0.8rem] transition-colors",
                        normalizeQuery(q.text) === normalizeQuery(state.query)
                          ? "border-accent/60 bg-accent-soft text-fg"
                          : "border-line text-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      <span className="mr-1.5 font-mono text-[0.68rem] text-faint">
                        {dict.experiments.tags[q.tags?.find((t) => EXAMPLE_TAGS.includes(t)) ?? ""] ?? q.lang}
                      </span>
                      {q.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
          <p className="font-mono text-[0.75rem] text-faint">
            {pending || !search
              ? dict.playground.indexing
              : dict.playground.stats(
                  built.pipeline.chunks.length,
                  dict.common.ms(built.ms),
                  dict.common.ms(search.ms),
                )}
          </p>
          {result && (
            <p className="font-mono text-[0.75rem] text-faint">
              {dict.playground.terms}:{" "}
              {result.queryTerms.length > 0 ? (
                <span className="text-muted">{result.queryTerms.join(" · ")}</span>
              ) : (
                dict.playground.noTerms
              )}
            </p>
          )}
        </div>

        {judged && metrics && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[0.82rem]">
            <span className="font-medium text-fg">{dict.playground.judged}</span>
            <span className="font-mono text-muted">
              {dict.playground.judgedMetrics(fmt3(metrics["ndcg@10"]), fmt3(metrics["recall@10"]))}
            </span>
            {judged.query.tags?.map((t) => (
              <Badge key={t}>{dict.experiments.tags[t] ?? t}</Badge>
            ))}
          </div>
        )}

        {buildError ? (
          <Notice tone="danger">
            {dict.playground.error} {buildError}
          </Notice>
        ) : !result ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : !debouncedQuery.trim() ? (
          <Notice>{dict.playground.empty}</Notice>
        ) : result.hits.length === 0 ? (
          <Notice>{dict.playground.noResults}</Notice>
        ) : (
          <>
            <div className="mb-3 max-w-xs">
              <Segmented
                label={dict.playground.viewLabel}
                value={view}
                options={[
                  { value: "chunks", label: dict.playground.viewChunks },
                  { value: "docs", label: dict.playground.viewDocs },
                ]}
                onChange={setView}
              />
            </div>
            {view === "chunks" ? (
              <ol className={cx("space-y-3 transition-opacity", pending && "opacity-60")}>
                {result.hits.map((hit) => (
                  <ResultCard
                    key={hit.chunk.id}
                    hit={hit}
                    doc={docsById.get(hit.chunk.docId)}
                    queryTerms={result.queryTerms}
                    analyzer={state.config.analyzer}
                    grade={judged ? (judged.qrels.get(hit.chunk.docId) ?? 0) : null}
                    maxSignal={maxSignal}
                  />
                ))}
              </ol>
            ) : (
              <DocList
                result={result}
                docsById={docsById}
                qrels={judged?.qrels ?? null}
                aggregation={dict.controls.aggregations[state.config.aggregation] ?? state.config.aggregation}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

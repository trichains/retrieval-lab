"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  compareConfigs,
  GridSchema,
  metricsByTag,
  parseDataset,
  rankConfigs,
  summaryMetricKeys,
  toCsv,
  toHtml,
  toJson,
  toMarkdown,
  type ConfigResult,
  type Dataset,
  type ExperimentResult,
  type GridInput,
} from "@/src/core";
import { useCorpus } from "@/lib/corpus-store";
import { useDict } from "@/lib/locale-context";
import { isPresetId, PRESET_IDS, PRESETS, type PresetId } from "@/lib/presets";
import { replaceSearch } from "@/lib/url-state";
import { useExperiment } from "@/lib/use-experiment";
import { Button, cx, Eyebrow, fmt3, Notice, Panel, SelectField, Skeleton } from "../ui";
import { DeltaPlot, Heatmap, MetricBars } from "./charts";
import { DrillDown } from "./drilldown";

type PresetChoice = PresetId | "custom";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Experiments() {
  const dict = useDict();
  const { source, setCustom } = useCorpus();
  const searchParams = useSearchParams();
  const [initial] = useState(() => new URLSearchParams(searchParams.toString()));
  const experiment = useExperiment();
  const [preset, setPreset] = useState<PresetChoice>(() => {
    const p = initial.get("p");
    return isPresetId(p) ? p : "default";
  });
  const [gridText, setGridText] = useState(() => JSON.stringify(PRESETS.default, null, 2));
  const [metric, setMetric] = useState(initial.get("m") ?? "");
  const [pair, setPair] = useState<{ a: string; b: string }>({ a: initial.get("a") ?? "", b: initial.get("b") ?? "" });
  const [cell, setCell] = useState<{ queryId: string; configId: string } | null>(() => {
    const q = initial.get("q");
    const c = initial.get("c");
    return q && c ? { queryId: q, configId: c } : null;
  });
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const gridId = useId();
  const uploadId = useId();

  const dataset: Dataset | null = source.dataset;

  const customGrid = useMemo(() => {
    try {
      // The browser demo never calls a network embedder: a pasted grid must use the offline hashing one.
      const parsed = GridSchema.refine(
        (g) => g.retrievers.every((r) => r.type === "bm25" || r.embedder.type === "hashing"),
        { message: "only the offline hashing embedder is available in the browser", path: ["retrievers"] },
      ).safeParse(JSON.parse(gridText));
      return parsed.success
        ? { ok: true as const, grid: parsed.data }
        : {
            ok: false as const,
            errors: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`),
          };
    } catch (error) {
      return { ok: false as const, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }, [gridText]);

  const grid: GridInput | null = preset === "custom" ? (customGrid.ok ? customGrid.grid : null) : PRESETS[preset];
  const { run } = experiment;

  // Run once on arrival (and whenever the dataset or preset changes) so the page shows real numbers.
  useEffect(() => {
    if (dataset && preset !== "custom") run(dataset, PRESETS[preset]);
  }, [dataset, preset, run]);

  const result = experiment.result;
  const activeMetric = result && result.metricKeys.includes(metric) ? metric : (result?.primaryMetric ?? "ndcg@10");
  const ranked = useMemo(() => (result ? rankConfigs(result, activeMetric) : []), [result, activeMetric]);
  const byId = useMemo(() => new Map(result?.configs.map((c) => [c.id, c]) ?? []), [result]);
  const configA: ConfigResult | undefined = byId.get(pair.a) ?? ranked[1] ?? ranked[0];
  const configB: ConfigResult | undefined = byId.get(pair.b) ?? ranked[0];
  const comparison = useMemo(
    () =>
      configA && configB && configA !== configB && result
        ? compareConfigs(configA, configB, activeMetric, { samples: 10_000, seed: result.grid.bootstrap.seed })
        : null,
    [configA, configB, activeMetric, result],
  );
  const queryText = useMemo(() => new Map(dataset?.queries.map((q) => [q.id, q.text]) ?? []), [dataset]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (preset !== "default") sp.set("p", preset);
    if (metric) sp.set("m", metric);
    if (pair.a) sp.set("a", pair.a);
    if (pair.b) sp.set("b", pair.b);
    if (cell) {
      sp.set("q", cell.queryId);
      sp.set("c", cell.configId);
    }
    replaceSearch(sp);
  }, [preset, metric, pair, cell]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploadErrors([]);
    try {
      const parsed = parseDataset(JSON.parse(await file.text()));
      if (!parsed.ok) {
        setUploadErrors(parsed.errors);
        return;
      }
      setCustom(parsed.dataset.name, parsed.dataset.documents, parsed.dataset);
      setPair({ a: "", b: "" });
      setCell(null);
    } catch (error) {
      setUploadErrors([`${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
    }
  }

  const tagRows = useMemo(() => {
    if (!dataset || !configA || !configB) return [];
    const a = metricsByTag(configA, dataset.queries, activeMetric);
    const b = new Map(metricsByTag(configB, dataset.queries, activeMetric).map((r) => [r.tag, r.mean]));
    return a.map((r) => ({ ...r, b: b.get(r.tag) ?? 0 }));
  }, [dataset, configA, configB, activeMetric]);

  const running = experiment.status === "running";
  const configOptions = ranked.map((c) => ({ value: c.id, label: c.label }));
  const highlight = new Set([configA?.id, configB?.id].filter((x): x is string => Boolean(x)));
  const keys = result ? summaryMetricKeys(result) : [];
  const selectedConfig = cell ? byId.get(cell.configId) : undefined;
  const selectedQuery = cell ? selectedConfig?.perQuery.find((q) => q.queryId === cell.queryId) : undefined;

  return (
    <div className="space-y-6">
      <Panel className="p-4 sm:p-5" aria-label={dict.experiments.title}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className="mb-1 text-[0.8rem] font-medium text-muted">{dict.experiments.dataset}</p>
            <p className="flex min-h-9 items-center gap-2 text-[0.9rem] text-fg">
              {dataset
                ? source.kind === "nimbus"
                  ? dict.experiments.datasetNimbus
                  : dict.experiments.datasetCustom(dataset.name, dataset.queries.length)
                : "–"}
              <label
                htmlFor={uploadId}
                className="cursor-pointer rounded border border-line-strong px-2 py-0.5 text-[0.75rem] text-muted hover:text-fg has-[:focus-visible]:outline"
              >
                {dict.experiments.uploadDataset}
                <input
                  id={uploadId}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    void onUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </p>
            <p className="mt-1 text-[0.72rem] text-faint">{dict.experiments.uploadHint}</p>
          </div>
          <SelectField<PresetChoice>
            label={dict.experiments.preset}
            value={preset}
            options={[...PRESET_IDS, "custom" as const].map((p) => ({
              value: p,
              label: dict.experiments.presets[p] ?? p,
            }))}
            onChange={(p) => {
              setPreset(p);
              setPair({ a: "", b: "" });
              setCell(null);
              if (p !== "custom") setGridText(JSON.stringify(PRESETS[p], null, 2));
            }}
          />
          <div className="flex gap-2">
            {running ? (
              <Button variant="secondary" onClick={experiment.cancel}>
                {dict.experiments.cancel}
              </Button>
            ) : (
              <Button disabled={!dataset || !grid} onClick={() => dataset && grid && run(dataset, grid)}>
                {dict.experiments.run}
              </Button>
            )}
          </div>
        </div>

        {uploadErrors.length > 0 && (
          <div className="mt-3">
            <Notice tone="danger">
              {uploadErrors.map((e) => (
                <span key={e} className="block font-mono text-[0.75rem]">
                  {e}
                </span>
              ))}
            </Notice>
          </div>
        )}

        <details className="mt-4" open={preset === "custom"}>
          <summary className="cursor-pointer text-[0.8rem] font-medium text-muted hover:text-fg">
            {dict.experiments.editGrid}
          </summary>
          <label htmlFor={gridId} className="sr-only">
            {dict.experiments.editGrid}
          </label>
          <textarea
            id={gridId}
            className="field mt-2 h-64 font-mono text-[0.75rem] leading-relaxed"
            spellCheck={false}
            value={gridText}
            onChange={(e) => {
              setGridText(e.target.value);
              setPreset("custom");
            }}
          />
          {!customGrid.ok && preset === "custom" && (
            <div className="mt-2">
              <Notice tone="danger">
                {dict.experiments.gridInvalid}:{" "}
                {customGrid.errors.map((e) => (
                  <span key={e} className="block font-mono text-[0.75rem]">
                    {e}
                  </span>
                ))}
              </Notice>
            </div>
          )}
        </details>

        <div className="mt-4" aria-live="polite">
          {running && (
            <div>
              <div className="h-1 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{
                    width: `${experiment.progress ? (experiment.progress.done / experiment.progress.total) * 100 : 3}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[0.72rem] text-faint">
                {dict.experiments.running}{" "}
                {experiment.progress &&
                  `${dict.experiments.progress(experiment.progress.done, experiment.progress.total)} · ${experiment.progress.label}`}
              </p>
            </div>
          )}
          {experiment.status === "error" && (
            <Notice tone="danger">
              {dict.experiments.error}: {experiment.error}
            </Notice>
          )}
          {!dataset && <Notice>{dict.experiments.noDataset}</Notice>}
          {result && !running && experiment.ms !== null && (
            <p className="font-mono text-[0.72rem] text-faint">
              {dict.experiments.summary(
                result.configs.length,
                result.dataset.queries,
                (experiment.ms / 1000).toFixed(1),
              )}{" "}
              {source.kind === "nimbus" && dict.experiments.honest}
            </p>
          )}
        </div>
      </Panel>

      {!result && running && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      )}

      {result && (
        <div className={cx("space-y-6 transition-opacity", running && "opacity-50")}>
          <Panel className="p-4 sm:p-5" aria-labelledby="results-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <Eyebrow id="results-heading">{dict.experiments.resultsHeading}</Eyebrow>
              <div className="flex flex-wrap items-end gap-2">
                <SelectField
                  className="w-40"
                  label={dict.experiments.metric}
                  value={activeMetric}
                  options={result.metricKeys.map((k) => ({ value: k, label: k }))}
                  onChange={setMetric}
                />
                <ExportMenu result={result} queryText={queryText} />
              </div>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[44rem] border-collapse text-[0.8rem]">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th scope="col" className="py-2 pr-2 font-medium">
                      {dict.experiments.table.rank}
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      {dict.experiments.table.config}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      {dict.experiments.table.chunks}
                    </th>
                    {keys.map((k) => (
                      <th
                        key={k}
                        scope="col"
                        className="py-2 pr-3 text-right font-medium"
                        aria-sort={k === activeMetric ? "descending" : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => setMetric(k)}
                          className={cx("font-mono", k === activeMetric ? "text-accent-strong" : "hover:text-fg")}
                          aria-label={dict.experiments.sortBy(k)}
                        >
                          {k}
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="py-2 text-right font-medium">
                      {dict.experiments.table.ci}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((c, i) => (
                    <tr key={c.id} className={cx("border-b border-line/60", i === 0 && "bg-accent-soft")}>
                      <td className="py-1.5 pr-2 font-mono text-faint">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-mono text-[0.76rem] text-fg">{c.label}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted">{c.chunkCount}</td>
                      {keys.map((k) => (
                        <td
                          key={k}
                          className={cx(
                            "py-1.5 pr-3 text-right font-mono",
                            k === activeMetric ? "text-fg" : "text-muted",
                          )}
                        >
                          {fmt3(c.metrics[k])}
                        </td>
                      ))}
                      <td className="py-1.5 text-right font-mono text-faint">
                        {fmt3(c.ci[activeMetric]?.[0])}–{fmt3(c.ci[activeMetric]?.[1])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6">
              <MetricBars configs={ranked} metric={activeMetric} highlight={highlight} />
            </div>
          </Panel>

          {configA && configB && (
            <Panel className="p-4 sm:p-5" aria-labelledby="compare-heading">
              <Eyebrow id="compare-heading">{dict.experiments.compareHeading}</Eyebrow>
              <p className="mt-1 max-w-3xl text-[0.82rem] text-muted">{dict.experiments.compareLead}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SelectField
                  label={dict.experiments.configA}
                  value={configA.id}
                  options={configOptions}
                  onChange={(a) => setPair((p) => ({ ...p, a }))}
                />
                <SelectField
                  label={dict.experiments.configB}
                  value={configB.id}
                  options={configOptions}
                  onChange={(b) => setPair((p) => ({ ...p, b }))}
                />
              </div>
              {comparison ? (
                <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <p
                      className={cx(
                        "text-[0.95rem] font-medium",
                        comparison.significant ? (comparison.delta > 0 ? "text-ok" : "text-danger") : "text-fg",
                      )}
                    >
                      {comparison.significant
                        ? comparison.delta > 0
                          ? dict.experiments.verdictBetter(activeMetric)
                          : dict.experiments.verdictWorse(activeMetric)
                        : dict.experiments.verdictNoise}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.8rem] sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">{dict.experiments.delta}</dt>
                        <dd className="font-mono text-fg">
                          {comparison.delta >= 0 ? "+" : ""}
                          {comparison.delta.toFixed(3)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{dict.experiments.ci}</dt>
                        <dd className="font-mono text-fg">
                          [{comparison.ci[0].toFixed(3)}, {comparison.ci[1].toFixed(3)}]
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{dict.experiments.pValue}</dt>
                        <dd className="font-mono text-fg">
                          {comparison.pValue < 0.001 ? "< 0.001" : comparison.pValue.toFixed(3)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{dict.experiments.wlt}</dt>
                        <dd className="font-mono text-fg">
                          {comparison.wins} / {comparison.losses} / {comparison.ties}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <DeltaPlot
                        delta={comparison.delta}
                        ci={comparison.ci}
                        label={`${dict.experiments.delta}: ${comparison.delta.toFixed(3)}, ${dict.experiments.ci} ${comparison.ci[0].toFixed(3)} ${comparison.ci[1].toFixed(3)}`}
                      />
                    </div>
                  </div>
                  {tagRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[0.8rem]">
                        <caption className="mb-2 text-left text-[0.8rem] font-medium text-muted">
                          {dict.experiments.byTag} · {activeMetric}
                        </caption>
                        <thead>
                          <tr className="border-b border-line text-left text-muted">
                            <th scope="col" className="py-1.5 font-medium">
                              {dict.experiments.tag}
                            </th>
                            <th scope="col" className="py-1.5 text-right font-medium">
                              {dict.experiments.count}
                            </th>
                            <th scope="col" className="py-1.5 text-right font-medium">
                              A
                            </th>
                            <th scope="col" className="py-1.5 text-right font-medium">
                              B
                            </th>
                            <th scope="col" className="py-1.5 text-right font-medium">
                              Δ
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tagRows.map((r) => {
                            const d = r.b - r.mean;
                            return (
                              <tr key={r.tag} className="border-b border-line/60">
                                <th scope="row" className="py-1 text-left font-normal text-fg">
                                  {dict.experiments.tags[r.tag] ?? r.tag}
                                </th>
                                <td className="py-1 text-right font-mono text-faint">{r.count}</td>
                                <td className="py-1 text-right font-mono text-muted">{r.mean.toFixed(3)}</td>
                                <td className="py-1 text-right font-mono text-muted">{r.b.toFixed(3)}</td>
                                <td
                                  className={cx(
                                    "py-1 text-right font-mono",
                                    d > 0.0005 ? "text-ok" : d < -0.0005 ? "text-danger" : "text-faint",
                                  )}
                                >
                                  {d >= 0 ? "+" : ""}
                                  {d.toFixed(3)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-[0.85rem] text-muted">{dict.experiments.verdictSame}</p>
              )}
            </Panel>
          )}

          <Panel className="p-4 sm:p-5" aria-labelledby="heatmap-heading">
            <Eyebrow id="heatmap-heading">{dict.experiments.heatmapHeading}</Eyebrow>
            <p className="mt-1 max-w-3xl text-[0.82rem] text-muted">{dict.experiments.heatmapLead}</p>
            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="min-w-0">
                <Heatmap
                  result={result}
                  configs={ranked}
                  metric={activeMetric}
                  queryText={queryText}
                  selected={cell}
                  onSelect={setCell}
                />
              </div>
              <div className="xl:sticky xl:top-4 xl:self-start">
                {selectedConfig && selectedQuery && dataset ? (
                  <DrillDown
                    config={selectedConfig}
                    query={selectedQuery}
                    dataset={dataset}
                    metric={activeMetric}
                    cutoff={Math.max(...result.grid.cutoffs)}
                  />
                ) : (
                  <Notice>{dict.experiments.drillEmpty}</Notice>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ result, queryText }: { result: ExperimentResult; queryText: ReadonlyMap<string, string> }) {
  const dict = useDict();
  const base = `retrieval-lab-${result.dataset.name}`;
  const formats = [
    { label: "JSON", run: () => download(`${base}.json`, toJson(result), "application/json") },
    { label: "CSV", run: () => download(`${base}.csv`, toCsv(result), "text/csv") },
    { label: "MD", run: () => download(`${base}.md`, toMarkdown(result), "text/markdown") },
    { label: "HTML", run: () => download(`${base}.html`, toHtml(result, { queryText }), "text/html") },
  ];
  return (
    <div role="group" aria-label={dict.experiments.export} className="flex items-center gap-1">
      <span className="mr-1 text-[0.75rem] text-faint">{dict.experiments.export}</span>
      {formats.map((f) => (
        <button
          key={f.label}
          type="button"
          onClick={f.run}
          className="min-h-9 rounded-md border border-line-strong px-2 font-mono text-[0.72rem] text-muted hover:text-fg"
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

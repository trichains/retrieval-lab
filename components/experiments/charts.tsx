"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { ConfigResult, ExperimentResult } from "@/src/core";
import { useDict } from "@/lib/locale-context";
import { cx } from "../ui";

/** A [lo, hi] axis around the data, rounded to tidy steps, so differences of a few points are visible. */
export function axisDomain(values: readonly number[]): { min: number; max: number; ticks: number[] } {
  if (values.length === 0) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 0.05);
  const step = span > 0.5 ? 0.25 : span > 0.2 ? 0.1 : 0.05;
  const min = Math.max(0, Math.floor((lo - span * 0.08) / step) * step);
  const max = Math.min(1, Math.ceil((hi + span * 0.08) / step) * step);
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { min, max, ticks };
}

/**
 * A dot-and-whisker (forest) plot of one metric: the dot is the mean over queries, the whisker its
 * 95% bootstrap interval. The axis is zoomed to the data, which is why there are no bars: bars on a
 * truncated axis exaggerate differences. HTML layout so labels stay readable on phones.
 */
export function MetricBars({
  configs,
  metric,
  highlight,
}: {
  configs: readonly ConfigResult[];
  metric: string;
  highlight: ReadonlySet<string>;
}) {
  const dict = useDict();
  const { min, max, ticks } = axisDomain(configs.flatMap((c) => c.ci[metric] ?? [c.metrics[metric] ?? 0]));
  const pos = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 100}%`;
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-[0.82rem] text-muted">{dict.experiments.chartTitle(metric)}</figcaption>
      <div className="relative mb-1 h-4 sm:ml-[17rem] sm:mr-14" aria-hidden>
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 font-mono text-[0.68rem] text-faint"
            style={{ left: pos(t) }}
          >
            {t.toFixed(2)}
          </span>
        ))}
      </div>
      <ul className="space-y-2.5 sm:space-y-1">
        {configs.map((c) => {
          const value = c.metrics[metric] ?? 0;
          const [lo, hi] = c.ci[metric] ?? [value, value];
          const strong = highlight.has(c.id);
          return (
            <li key={c.id} className="grid gap-1 sm:grid-cols-[16.5rem_minmax(0,1fr)_3rem] sm:items-center sm:gap-2">
              <span
                className={cx("truncate font-mono text-[0.74rem]", strong ? "text-fg" : "text-muted")}
                title={c.label}
              >
                {c.label}
              </span>
              <span className="sr-only">
                {metric} {value.toFixed(3)}, {dict.experiments.table.ci} {lo.toFixed(3)}–{hi.toFixed(3)}
              </span>
              <div className="flex items-center gap-2 sm:contents">
                <div className="relative h-4 flex-1" aria-hidden>
                  {ticks.map((t) => (
                    <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(t) }} />
                  ))}
                  <span
                    className={cx(
                      "absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full",
                      strong ? "bg-accent" : "bg-accent/40",
                    )}
                    style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }}
                  />
                  <span
                    className={cx(
                      "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel",
                      strong ? "bg-fg" : "bg-accent-strong",
                    )}
                    style={{ left: pos(value) }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-[0.75rem] text-fg" aria-hidden>
                  {value.toFixed(3)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[0.78rem] text-faint">{dict.experiments.chartNote}</p>
    </figure>
  );
}

/** A delta with its CI on a symmetric axis around zero. */
export function DeltaPlot({ delta, ci, label }: { delta: number; ci: [number, number]; label: string }) {
  const extent = Math.max(0.05, Math.abs(ci[0]), Math.abs(ci[1]), Math.abs(delta)) * 1.15;
  const x = (v: number) => 10 + ((v + extent) / (2 * extent)) * 280;
  return (
    <svg viewBox="0 0 300 54" className="w-full max-w-md" role="img" aria-label={label}>
      <line x1="10" x2="290" y1="26" y2="26" stroke="var(--line-strong)" />
      <line x1={x(0)} x2={x(0)} y1="10" y2="42" stroke="var(--faint)" strokeDasharray="3 3" />
      <text x={x(0)} y="52" textAnchor="middle" fontSize="9" fill="var(--faint)" fontFamily="var(--font-plex-mono)">
        0
      </text>
      <text x="10" y="52" fontSize="9" fill="var(--faint)" fontFamily="var(--font-plex-mono)">
        {(-extent).toFixed(2)}
      </text>
      <text x="290" y="52" textAnchor="end" fontSize="9" fill="var(--faint)" fontFamily="var(--font-plex-mono)">
        +{extent.toFixed(2)}
      </text>
      <line x1={x(ci[0])} x2={x(ci[1])} y1="26" y2="26" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x(delta)} cy="26" r="5" fill="var(--fg)" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}

/** Queries × configurations, coloured by the metric. Each cell is a button opening the drill-down. */
export function Heatmap({
  result,
  configs,
  metric,
  queryText,
  selected,
  onSelect,
}: {
  result: ExperimentResult;
  /** Column order (e.g. best first). */
  configs: readonly ConfigResult[];
  metric: string;
  queryText: ReadonlyMap<string, string>;
  selected: { queryId: string; configId: string } | null;
  onSelect: (cell: { queryId: string; configId: string }) => void;
}) {
  const dict = useDict();
  const values = configs.map((c) => new Map(c.perQuery.map((q) => [q.queryId, q.metrics[metric] ?? 0])));
  const rows = result.queryIds
    .map((queryId) => {
      const vals = values.map((m) => m.get(queryId) ?? 0);
      return { queryId, vals, mean: vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length) };
    })
    .sort((a, b) => a.mean - b.mean || a.queryId.localeCompare(b.queryId));

  // Roving focus: only one cell is in the tab order; arrow keys, Home/End and PageUp/PageDown move
  // between cells, so the map is one tab stop instead of one per cell.
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const tableRef = useRef<HTMLTableElement>(null);
  const activeRow = Math.min(active.row, rows.length - 1);
  const activeCol = Math.min(active.col, configs.length - 1);
  const moveTo = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(configs.length - 1, col));
    setActive({ row: r, col: c });
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${c}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [row, 0],
      End: [row, configs.length - 1],
      PageUp: [row - 10, col],
      PageDown: [row + 10, col],
    };
    const target = moves[event.key];
    if (!target) return;
    event.preventDefault();
    moveTo(target[0], target[1]);
  };

  return (
    <div>
      <div className="max-h-[34rem] overflow-auto rounded-md border border-line scrollbar-thin">
        <table ref={tableRef} className="border-separate border-spacing-0 text-[0.72rem]">
          <caption className="sr-only">{dict.experiments.heatmapHeading}</caption>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-[11rem] border-b border-line bg-panel px-2 py-1.5 text-left font-medium text-muted"
              >
                {metric}
              </th>
              {configs.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className="border-b border-line px-0.5 py-1.5 font-mono font-normal text-faint"
                  title={c.label}
                >
                  <abbr title={c.label} className="no-underline">
                    {i + 1}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.queryId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[11rem] truncate border-b border-line/60 bg-panel px-2 py-0.5 text-left font-normal text-muted"
                  title={queryText.get(row.queryId)}
                >
                  <span className="mr-1.5 font-mono text-faint">{row.queryId}</span>
                  {queryText.get(row.queryId)}
                </th>
                {row.vals.map((v, i) => {
                  const config = configs[i]!;
                  const isSelected = selected?.queryId === row.queryId && selected.configId === config.id;
                  return (
                    <td key={config.id} className="border-b border-line/60 p-0.5">
                      <button
                        type="button"
                        data-cell={`${rowIndex}-${i}`}
                        tabIndex={rowIndex === activeRow && i === activeCol ? 0 : -1}
                        onKeyDown={(e) => onKeyDown(e, rowIndex, i)}
                        onFocus={() => setActive({ row: rowIndex, col: i })}
                        onClick={() => onSelect({ queryId: row.queryId, configId: config.id })}
                        aria-label={`${row.queryId} · ${config.label}: ${metric} ${v.toFixed(3)}`}
                        aria-pressed={isSelected}
                        title={`${config.label}\n${metric} ${v.toFixed(3)}`}
                        className={cx(
                          "block h-5 w-6 rounded-[3px] outline-offset-1",
                          isSelected && "outline outline-2 outline-fg",
                        )}
                        style={{ background: v > 0 ? `rgb(94 196 176 / ${0.12 + 0.88 * v})` : "var(--raised)" }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[0.7rem] text-faint" aria-hidden>
        <span>0</span>
        <span
          className="h-2 w-28 rounded-sm"
          style={{ background: "linear-gradient(90deg, var(--raised), rgb(94 196 176 / 0.12), var(--accent))" }}
        />
        <span>1</span>
      </div>
      <ol className="mt-3 grid gap-x-6 gap-y-0.5 font-mono text-[0.7rem] text-faint sm:grid-cols-2">
        {configs.map((c, i) => (
          <li key={c.id}>
            <span className="text-muted">{i + 1}</span> {c.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

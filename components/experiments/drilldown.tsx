"use client";

import type { ConfigResult, Dataset, QueryResult } from "@/src/core";
import { useDict } from "@/lib/locale-context";
import { Badge, cx } from "../ui";

export function DrillDown({
  config,
  query,
  dataset,
  metric,
  cutoff,
}: {
  config: ConfigResult;
  query: QueryResult;
  dataset: Dataset;
  metric: string;
  cutoff: number;
}) {
  const dict = useDict();
  const q = dataset.queries.find((x) => x.id === query.queryId);
  const titles = new Map(dataset.documents.map((d) => [d.id, d.title ?? d.id]));
  const kind = query.diagnosis.kind;
  return (
    <section className="rounded-lg border border-line bg-bg p-4" aria-labelledby="drill-heading" aria-live="polite">
      <h3 id="drill-heading" className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
        {dict.experiments.drillHeading}
      </h3>
      <p className="mt-2 text-[0.95rem] font-medium leading-snug text-fg">
        <span className="mr-2 font-mono text-[0.75rem] text-faint">{query.queryId}</span>
        {q?.text}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {q?.lang && <Badge>{q.lang}</Badge>}
        {q?.tags?.map((t) => (
          <Badge key={t}>{dict.experiments.tags[t] ?? t}</Badge>
        ))}
      </div>
      <p className="mt-3 font-mono text-[0.72rem] text-muted">{config.label}</p>
      <p className="mt-1 font-mono text-[0.8rem] text-fg">
        {metric} {(query.metrics[metric] ?? 0).toFixed(3)}
      </p>
      <p
        className={cx(
          "mt-3 rounded-md border px-3 py-2 text-[0.82rem]",
          kind === "ok"
            ? "border-ok/40 text-ok"
            : kind === "ranked-low"
              ? "border-line-strong text-fg"
              : "border-danger/40 text-danger",
        )}
      >
        {dict.experiments.diagnosis[kind]}
      </p>

      <h4 className="mt-4 text-[0.78rem] font-medium text-muted">{dict.experiments.relevantDocs}</h4>
      <ul className="mt-1.5 space-y-1">
        {query.relevant.map((r) => (
          <li key={r.docId} className="flex items-baseline gap-2 text-[0.8rem]">
            <span className="w-14 shrink-0 font-mono text-[0.72rem] text-faint">
              {r.rank === null ? "–" : `#${r.rank}`}
            </span>
            <span className="min-w-0 flex-1 text-fg">{titles.get(r.docId)}</span>
            <Badge tone={r.grade >= 2 ? "ok" : "neutral"}>{dict.common.gradeShort(r.grade)}</Badge>
          </li>
        ))}
      </ul>
      {query.relevant.some((r) => r.rank === null) && (
        <p className="mt-1 text-[0.72rem] text-faint">– {dict.experiments.rankNone}</p>
      )}

      <h4 className="mt-4 text-[0.78rem] font-medium text-muted">{dict.experiments.retrievedDocs}</h4>
      <ol className="mt-1.5 space-y-1">
        {query.retrieved.slice(0, cutoff).map((d, i) => (
          <li key={d.docId} className="flex items-baseline gap-2 text-[0.8rem]">
            <span className="w-14 shrink-0 font-mono text-[0.72rem] text-faint">#{i + 1}</span>
            <span className={cx("min-w-0 flex-1", d.grade > 0 ? "text-fg" : "text-muted")}>{titles.get(d.docId)}</span>
            {d.grade > 0 && <Badge tone={d.grade >= 2 ? "ok" : "neutral"}>{dict.common.gradeShort(d.grade)}</Badge>}
          </li>
        ))}
      </ol>
    </section>
  );
}

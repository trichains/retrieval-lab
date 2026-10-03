"use client";

import { useState } from "react";
import type { AnalyzerOptions, DatasetDocument, PipelineHit, SearchResult, Signal } from "@/src/core";
import { clipAroundMatch, highlightParts } from "@/lib/highlight";
import { useDict } from "@/lib/locale-context";
import { Badge, cx, fmt3 } from "../ui";

const SNIPPET_CHARS = 640;

function GradeBadge({ grade }: { grade: number | null }) {
  const dict = useDict();
  if (grade === null) return null;
  if (grade === 0) return <Badge title={dict.common.notJudged}>{dict.common.notJudged}</Badge>;
  return (
    <Badge tone={grade >= 2 ? "ok" : "neutral"} title={dict.common.grade(grade)}>
      {dict.common.grade(grade)}
    </Badge>
  );
}

function SignalRow({
  label,
  signal,
  max,
  tone,
  digits = 3,
}: {
  label: string;
  signal: Signal;
  max: number;
  tone: "lex" | "vec" | "accent";
  digits?: number;
}) {
  const dict = useDict();
  const width = max > 0 ? Math.max(2, (signal.score / max) * 100) : 0;
  const color = { lex: "bg-lex", vec: "bg-vec", accent: "bg-accent" }[tone];
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem_3.25rem] items-center gap-2 text-[0.75rem]">
      <dt className="text-muted">{label}</dt>
      <dd className="h-1.5 rounded-full bg-raised" aria-hidden>
        {signal.rank !== null && <div className={cx("h-full rounded-full", color)} style={{ width: `${width}%` }} />}
      </dd>
      <dd className="text-right font-mono text-fg">{signal.rank === null ? "–" : signal.score.toFixed(digits)}</dd>
      <dd className="text-right font-mono text-faint">
        {signal.rank === null ? dict.playground.absent : `#${signal.rank}`}
      </dd>
    </div>
  );
}

export function ResultCard({
  hit,
  doc,
  queryTerms,
  analyzer,
  grade,
  maxSignal,
}: {
  hit: PipelineHit;
  doc: DatasetDocument | undefined;
  queryTerms: string[];
  analyzer: AnalyzerOptions;
  grade: number | null;
  maxSignal: { bm25: number; vector: number; fused: number };
}) {
  const dict = useDict();
  const [expanded, setExpanded] = useState(false);
  const { chunk, signals } = hit;
  const parts = highlightParts(chunk.text, queryTerms, analyzer, doc?.lang);
  const clipped = clipAroundMatch(parts, SNIPPET_CHARS);
  const shown = expanded ? parts : clipped.parts;
  const docLength = doc?.text.length ?? chunk.end;
  const left = (chunk.start / Math.max(1, docLength)) * 100;
  const width = Math.max(0.8, ((chunk.end - chunk.start) / Math.max(1, docLength)) * 100);
  const rerank = signals.rerank;
  const moved = rerank ? rerank.before - rerank.rank : 0;

  return (
    <li>
      <article className="rounded-lg border border-line bg-panel p-4" aria-labelledby={`hit-${chunk.id}`}>
        <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
          <span className="font-mono text-[0.95rem] font-medium text-accent" aria-hidden>
            {String(hit.rank).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`hit-${chunk.id}`} className="text-[0.95rem] font-medium leading-snug text-fg">
              <span className="sr-only">#{hit.rank} </span>
              {doc?.title ?? chunk.docId}
            </h3>
            {chunk.headingPath && chunk.headingPath.length > 0 && (
              <p className="truncate text-[0.78rem] text-muted">{chunk.headingPath.join(" › ")}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {doc?.lang && <Badge>{doc.lang}</Badge>}
            <GradeBadge grade={grade} />
            {rerank && moved !== 0 && (
              <Badge tone={moved > 0 ? "accent" : "neutral"} title={dict.playground.moved(rerank.before, rerank.rank)}>
                {moved > 0 ? `↑${moved}` : `↓${-moved}`}
              </Badge>
            )}
          </div>
        </header>

        <p className="mt-3 text-[0.88rem] leading-relaxed whitespace-pre-wrap break-words text-fg/90">
          {shown.map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
        </p>
        {clipped.clipped && (
          <button
            type="button"
            className="mt-1 text-[0.78rem] font-medium text-accent hover:text-accent-strong"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? dict.common.hide : dict.common.show}
          </button>
        )}

        <div className="mt-3">
          <div
            className="relative h-1.5 rounded-full bg-raised"
            role="img"
            aria-label={dict.playground.position(chunk.start, chunk.end, docLength)}
          >
            <div
              className="absolute inset-y-0 rounded-full bg-accent"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[0.7rem] text-faint">
            {dict.playground.position(chunk.start, chunk.end, docLength)} · {chunk.id}
          </p>
        </div>

        <details className="mt-3 group" open={hit.rank <= 2}>
          <summary className="cursor-pointer text-[0.78rem] font-medium text-muted hover:text-fg">
            {dict.playground.breakdown}{" "}
            <span className="font-mono text-faint">
              · {dict.playground.finalScore} {fmt3(hit.score)}
            </span>
          </summary>
          <dl className="mt-2 space-y-1.5">
            {signals.bm25 && (
              <SignalRow label={dict.playground.signal.bm25!} signal={signals.bm25} max={maxSignal.bm25} tone="lex" />
            )}
            {signals.vector && (
              <SignalRow
                label={dict.playground.signal.vector!}
                signal={signals.vector}
                max={maxSignal.vector}
                tone="vec"
              />
            )}
            {signals.fused && (
              <SignalRow
                label={dict.playground.signal.fused!}
                signal={signals.fused}
                max={maxSignal.fused}
                tone="accent"
                digits={4}
              />
            )}
            {rerank && (
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-[0.75rem]">
                <dt className="text-muted">{dict.playground.signal.rerank}</dt>
                <dd className="font-mono text-fg">
                  {dict.playground.moved(rerank.before, rerank.rank)}{" "}
                  <span className="text-faint">({rerank.score.toFixed(3)})</span>
                </dd>
              </div>
            )}
          </dl>
        </details>
      </article>
    </li>
  );
}

export function DocList({
  result,
  docsById,
  qrels,
  aggregation,
}: {
  result: SearchResult;
  docsById: Map<string, DatasetDocument>;
  qrels: ReadonlyMap<string, number> | null;
  aggregation: string;
}) {
  const dict = useDict();
  const shown = new Set(result.docs.map((d) => d.docId));
  const missing = qrels
    ? [...qrels]
        .filter(([docId, g]) => g > 0 && !shown.has(docId))
        .map(([docId, grade]) => {
          const pos = result.rankedDocIds.indexOf(docId);
          return { docId, grade, rank: pos === -1 ? null : pos + 1 };
        })
    : [];
  return (
    <div className="rounded-lg border border-line bg-panel">
      <h3 className="border-b border-line px-4 py-2.5 text-[0.85rem] font-medium text-fg">
        {dict.playground.docsHeading(aggregation)}
      </h3>
      <ol className="divide-y divide-line">
        {result.docs.map((d) => (
          <li key={d.docId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="w-6 font-mono text-[0.85rem] text-accent">{d.rank}</span>
            <span className="min-w-0 flex-1 text-[0.88rem] text-fg">{docsById.get(d.docId)?.title ?? d.docId}</span>
            <span className="font-mono text-[0.72rem] text-faint">{dict.playground.chunkCount(d.chunkCount)}</span>
            <span className="font-mono text-[0.75rem] text-muted">{d.score.toFixed(3)}</span>
            {qrels && <GradeBadge grade={qrels.get(d.docId) ?? 0} />}
          </li>
        ))}
      </ol>
      {missing.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <h4 className="mb-1.5 text-[0.78rem] font-medium text-muted">{dict.playground.relevantMissing}</h4>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li key={m.docId} className="flex flex-wrap items-center gap-2 text-[0.82rem]">
                <span className="text-fg">{docsById.get(m.docId)?.title ?? m.docId}</span>
                <GradeBadge grade={m.grade} />
                <span className="font-mono text-[0.72rem] text-faint">
                  {m.rank === null ? dict.experiments.rankNone : `#${m.rank}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

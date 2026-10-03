"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { createChunker, normalizeText, type ChunkerConfig, type DatasetDocument } from "@/src/core";
import { useCorpus } from "@/lib/corpus-store";
import { coverageSegments } from "@/lib/highlight";
import { useDict } from "@/lib/locale-context";
import { chunkerFromParams, chunkerToParams, replaceSearch } from "@/lib/url-state";
import { ChunkerControls } from "../strategy-controls";
import { Badge, cx, Eyebrow, Notice, Panel } from "../ui";
import { BringYourOwn } from "./bring-your-own";

function Histogram({ lengths, label }: { lengths: number[]; label: string }) {
  if (lengths.length === 0) return null;
  const max = Math.max(...lengths);
  const bins = 12;
  const width = Math.max(1, Math.ceil((max + 1) / bins));
  const counts = Array.from({ length: bins }, () => 0);
  for (const l of lengths) counts[Math.min(bins - 1, Math.floor(l / width))]! += 1;
  const top = Math.max(...counts);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${bins * 14} 44`} className="h-12 w-full max-w-xs" role="img" aria-label={label}>
        {counts.map((c, i) => (
          <rect
            key={i}
            x={i * 14 + 1}
            y={40 - (c / top) * 36}
            width={12}
            height={(c / top) * 36}
            rx={1.5}
            fill="var(--accent)"
            opacity={c === 0 ? 0 : 0.75}
          >
            <title>{`${i * width}–${(i + 1) * width - 1}: ${c}`}</title>
          </rect>
        ))}
        <line x1="0" x2={bins * 14} y1="40.5" y2="40.5" stroke="var(--line-strong)" />
      </svg>
      <figcaption className="flex justify-between font-mono text-[0.68rem] text-faint">
        <span>0</span>
        <span>{max}</span>
      </figcaption>
    </figure>
  );
}

const CHUNK_TONES = ["bg-accent/[0.16]", "bg-lex/[0.18]"];

function BoundaryView({ doc, chunks }: { doc: DatasetDocument; chunks: ReturnType<ReturnType<typeof createChunker>> }) {
  const segments = useMemo(() => coverageSegments(doc.text.length, chunks), [doc.text.length, chunks]);
  const starts = useMemo(() => new Map(chunks.map((c, i) => [c.start, i])), [chunks]);
  return (
    <div className="max-h-[38rem] overflow-y-auto rounded-md border border-line bg-bg p-3 font-mono text-[0.78rem] leading-[1.7] whitespace-pre-wrap break-words text-fg/90 scrollbar-thin">
      {segments.map((seg) => {
        const text = doc.text.slice(seg.start, seg.end);
        const marker = starts.get(seg.start);
        const cls =
          seg.chunks.length === 0 ? "text-faint" : seg.chunks.length > 1 ? "overlap" : CHUNK_TONES[seg.chunks[0]! % 2];
        return (
          <span key={`${seg.start}-${seg.end}`}>
            {marker !== undefined && (
              <span
                className="mr-0.5 rounded-sm bg-raised px-1 align-[1px] text-[0.62rem] text-accent-strong"
                aria-hidden
              >
                {marker}
              </span>
            )}
            <span className={cx("rounded-[2px]", cls)}>{text}</span>
          </span>
        );
      })}
    </div>
  );
}

export function CorpusView() {
  const dict = useDict();
  const { source, reset } = useCorpus();
  const searchParams = useSearchParams();
  const [initial] = useState(() => new URLSearchParams(searchParams.toString()));
  const [chunker, setChunker] = useState<ChunkerConfig>(() => {
    const fromUrl = chunkerFromParams(initial);
    return initial.has("ch") ? fromUrl : { type: "markdown", maxChars: 800 };
  });
  const [docId, setDocId] = useState<string>(() => initial.get("doc") ?? "");
  const [filter, setFilter] = useState("");
  const [lang, setLang] = useState<"all" | "pt" | "en">("all");
  const filterId = useId();
  const langName = useId();

  const docs = source.docs;
  const selected = docs.find((d) => d.id === docId) ?? docs.find((d) => d.id === "deployments-guide") ?? docs[0];

  useEffect(() => {
    const sp = new URLSearchParams();
    if (docId) sp.set("doc", docId);
    sp.set("ch", chunker.type);
    chunkerToParams(chunker, sp, chunker);
    replaceSearch(sp);
  }, [docId, chunker]);

  const visibleDocs = useMemo(() => {
    const f = normalizeText(filter.trim());
    return docs.filter(
      (d) => (lang === "all" || d.lang === lang) && (!f || normalizeText(`${d.title ?? ""} ${d.id}`).includes(f)),
    );
  }, [docs, filter, lang]);

  const chunks = useMemo(() => (selected ? createChunker(chunker)(selected) : []), [selected, chunker]);
  const lengths = chunks.map((c) => c.text.length);
  const mean = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
  const langs = new Set(docs.map((d) => d.lang).filter(Boolean));

  return (
    <div className="space-y-6">
      {source.kind === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-vec/40 px-3 py-2 text-[0.85rem]">
          <span className="text-fg">{dict.corpus.usingCustom(docs.length)}</span>
          <button type="button" className="font-medium text-accent hover:text-accent-strong" onClick={reset}>
            {dict.corpus.backToNimbus}
          </button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Panel as="aside" className="p-3 lg:sticky lg:top-4 lg:self-start" aria-label={dict.corpus.documents}>
          <Eyebrow>{dict.corpus.documents}</Eyebrow>
          <div className="mt-3 space-y-2">
            <label htmlFor={filterId} className="sr-only">
              {dict.corpus.filter}
            </label>
            <input
              id={filterId}
              type="search"
              className="field"
              placeholder={dict.corpus.filter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {langs.size > 1 && (
              <fieldset className="flex gap-3 text-[0.8rem] text-muted">
                <legend className="sr-only">lang</legend>
                {(["all", "pt", "en"] as const).map((l) => (
                  <label key={l} className="flex items-center gap-1.5">
                    <input type="radio" name={langName} checked={lang === l} onChange={() => setLang(l)} />
                    {l === "all" ? dict.corpus.allLangs : l}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <ul className="mt-3 max-h-[26rem] space-y-0.5 overflow-y-auto pr-1 scrollbar-thin lg:max-h-[34rem]">
            {visibleDocs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setDocId(d.id)}
                  aria-current={d.id === selected?.id ? "true" : undefined}
                  className={cx(
                    "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[0.82rem]",
                    d.id === selected?.id ? "bg-raised text-fg" : "text-muted hover:bg-raised/60 hover:text-fg",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{d.title ?? d.id}</span>
                  {d.lang && <span className="font-mono text-[0.68rem] text-faint">{d.lang}</span>}
                  <span className="font-mono text-[0.68rem] text-faint">{(d.text.length / 1000).toFixed(1)}k</span>
                </button>
              </li>
            ))}
            {visibleDocs.length === 0 && <li className="px-2 py-1.5 text-[0.82rem] text-faint">{dict.corpus.noDoc}</li>}
          </ul>
        </Panel>

        {selected && (
          <div className="min-w-0 space-y-4">
            <Panel className="p-4" aria-labelledby="doc-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="doc-title" className="text-[1.1rem] font-medium text-fg">
                    {selected.title ?? selected.id}
                  </h2>
                  <p className="mt-0.5 font-mono text-[0.72rem] text-faint">
                    {selected.id} · {dict.corpus.chars(selected.text.length)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {selected.lang && <Badge>{selected.lang}</Badge>}
                  {selected.tags?.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <ChunkerControls value={chunker} onChange={setChunker} />
                <div>
                  <p className="text-[0.8rem] font-medium text-muted">{dict.corpus.stats}</p>
                  <p className="mt-1 font-mono text-[0.78rem] text-fg" aria-live="polite">
                    {dict.corpus.statsLine(
                      chunks.length,
                      lengths.length ? Math.min(...lengths) : 0,
                      mean,
                      lengths.length ? Math.max(...lengths) : 0,
                    )}
                  </p>
                  <div className="mt-2">
                    <Histogram lengths={lengths} label={dict.corpus.histogram} />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel className="p-4" aria-labelledby="boundaries-heading">
              <Eyebrow id="boundaries-heading">{dict.corpus.boundaries}</Eyebrow>
              <p className="mb-3 mt-1 text-[0.8rem] text-muted">{dict.corpus.boundariesHint}</p>
              <BoundaryView doc={selected} chunks={chunks} />
            </Panel>

            <Panel className="p-4" aria-labelledby="chunklist-heading">
              <Eyebrow id="chunklist-heading">{dict.corpus.chunkList}</Eyebrow>
              <div className="mt-3 max-h-80 overflow-auto scrollbar-thin">
                <table className="w-full min-w-[30rem] text-[0.78rem]">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="border-b border-line text-left text-muted">
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        #
                      </th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        {dict.corpus.range}
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        {dict.corpus.length}
                      </th>
                      <th scope="col" className="py-1.5 font-medium">
                        {dict.corpus.headings}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((c) => (
                      <tr key={c.id} className="border-b border-line/60">
                        <td className="py-1 pr-2 font-mono text-accent">{c.index}</td>
                        <td className="py-1 pr-3 font-mono text-muted">
                          [{c.start}, {c.end})
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-fg">{c.text.length}</td>
                        <td className="py-1 text-muted">{c.headingPath?.join(" › ") ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </div>

      <BringYourOwn />
      {docs.length === 0 && <Notice>{dict.corpus.noDoc}</Notice>}
    </div>
  );
}

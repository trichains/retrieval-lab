"use client";

import type { Aggregation, ChunkerConfig, ChunkerType, PipelineConfig, RetrieverConfig } from "@/src/core";
import { useDict } from "@/lib/locale-context";
import { CHUNKER_TYPES, chunkerNumbers, defaultChunker, K_OPTIONS, withChunkerNumbers } from "@/lib/url-state";
import { NumberField, RangeField, Segmented, SelectField, Toggle } from "./ui";

export function ChunkerControls({ value, onChange }: { value: ChunkerConfig; onChange: (c: ChunkerConfig) => void }) {
  const dict = useDict();
  const n = chunkerNumbers(value);
  const sizeLabel =
    value.type === "fixed-tokens"
      ? dict.controls.sizeTokens
      : value.type === "sentence" || value.type === "paragraph" || value.type === "markdown"
        ? dict.controls.maxChars
        : dict.controls.size;
  const sizeMin = value.type === "paragraph" ? 0 : value.type === "fixed-tokens" ? 10 : 50;
  const sizeMax = value.type === "fixed-tokens" ? 2000 : 20000;
  return (
    <div className="space-y-3">
      <SelectField<ChunkerType>
        label={dict.controls.chunker}
        value={value.type}
        options={CHUNKER_TYPES.map((t) => ({ value: t, label: dict.controls.chunkers[t] ?? t }))}
        onChange={(type) => onChange(defaultChunker(type))}
      />
      {n.size !== undefined && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={sizeLabel}
            value={n.size}
            min={sizeMin}
            max={sizeMax}
            step={value.type === "fixed-tokens" ? 10 : 50}
            onChange={(size) => onChange(withChunkerNumbers(value, size, n.overlap))}
          />
          {n.overlap !== undefined && (
            <NumberField
              label={value.type === "sentence" ? dict.controls.overlapSentences : dict.controls.overlap}
              value={n.overlap}
              min={0}
              max={value.type === "sentence" ? 5 : Math.max(0, n.size - 1)}
              step={value.type === "sentence" ? 1 : value.type === "fixed-tokens" ? 5 : 25}
              onChange={(overlap) => onChange(withChunkerNumbers(value, n.size, overlap))}
            />
          )}
        </div>
      )}
    </div>
  );
}

const HASHING = { type: "hashing" as const, dims: 1024, bigramWeight: 0.5, charWeight: 0.35 };

function retrieverOfType(type: RetrieverConfig["type"], previous: RetrieverConfig): RetrieverConfig {
  const bm25 = previous.type === "vector" ? { k1: 1.2, b: 0.75 } : previous.bm25;
  if (type === "bm25") return { type, bm25 };
  if (type === "vector") return { type, embedder: HASHING };
  return {
    type,
    bm25,
    embedder: HASHING,
    fusion: previous.type === "hybrid" ? previous.fusion : { type: "rrf", k: 60 },
    depth: 100,
  };
}

export function StrategyControls({
  config,
  k,
  onChange,
  onK,
}: {
  config: PipelineConfig;
  k: number;
  onChange: (config: PipelineConfig) => void;
  onK: (k: number) => void;
}) {
  const dict = useDict();
  const r = config.retriever;
  const rr = config.reranker;
  const set = (patch: Partial<PipelineConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="space-y-5">
      <ChunkerControls value={config.chunker} onChange={(chunker) => set({ chunker })} />

      <div className="space-y-3">
        <Segmented
          label={dict.controls.retriever}
          value={r.type}
          options={(["bm25", "vector", "hybrid"] as const).map((t) => ({
            value: t,
            label: dict.controls.retrievers[t] ?? t,
          }))}
          onChange={(type) => set({ retriever: retrieverOfType(type, r) })}
        />
        {r.type === "hybrid" && (
          <>
            <SelectField
              label={dict.controls.fusion}
              value={r.fusion.type}
              options={(["rrf", "weighted"] as const).map((t) => ({ value: t, label: dict.controls.fusions[t] ?? t }))}
              onChange={(type) =>
                set({ retriever: { ...r, fusion: type === "rrf" ? { type, k: 60 } : { type, alpha: 0.5 } } })
              }
            />
            {r.fusion.type === "rrf" ? (
              <RangeField
                label={dict.controls.rrfK}
                value={r.fusion.k}
                min={1}
                max={120}
                step={1}
                onChange={(kk) => set({ retriever: { ...r, fusion: { type: "rrf", k: kk } } })}
              />
            ) : (
              <RangeField
                label={dict.controls.alpha}
                value={r.fusion.alpha}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(alpha) => set({ retriever: { ...r, fusion: { type: "weighted", alpha } } })}
              />
            )}
          </>
        )}
      </div>

      <div className="space-y-3">
        <SelectField
          label={dict.controls.reranker}
          value={rr.type}
          options={(["none", "mmr", "lexical"] as const).map((t) => ({
            value: t,
            label: dict.controls.rerankers[t] ?? t,
          }))}
          onChange={(type) =>
            set({
              reranker:
                type === "mmr"
                  ? { type, lambda: 0.7, depth: 30 }
                  : type === "lexical"
                    ? { type, weight: 0.5, depth: 30 }
                    : { type: "none" },
            })
          }
        />
        {rr.type === "mmr" && (
          <RangeField
            label={dict.controls.lambda}
            value={rr.lambda}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(lambda) => set({ reranker: { ...rr, lambda } })}
          />
        )}
        {rr.type === "lexical" && (
          <RangeField
            label={dict.controls.weight}
            value={rr.weight}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(weight) => set({ reranker: { ...rr, weight } })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={dict.controls.topK}
          value={String(k)}
          options={K_OPTIONS.map((v) => ({ value: String(v), label: String(v) }))}
          onChange={(v) => onK(Number(v))}
        />
        <SelectField<Aggregation>
          label={dict.controls.aggregation}
          value={config.aggregation}
          options={(["max", "sum", "mean"] as const).map((a) => ({
            value: a,
            label: dict.controls.aggregations[a] ?? a,
          }))}
          onChange={(aggregation) => set({ aggregation })}
        />
      </div>

      <Toggle
        label={dict.controls.contextHeaders}
        hint={dict.controls.contextHeadersHint}
        checked={config.contextHeaders}
        onChange={(contextHeaders) => set({ contextHeaders })}
      />

      {r.type !== "vector" && (
        <details className="group rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-[0.8rem] font-medium text-muted hover:text-fg">
            {dict.controls.bm25}
          </summary>
          <div className="mt-3 space-y-3">
            <RangeField
              label={dict.controls.k1}
              value={r.bm25.k1}
              min={0}
              max={3}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(k1) => set({ retriever: { ...r, bm25: { ...r.bm25, k1 } } })}
            />
            <RangeField
              label={dict.controls.b}
              value={r.bm25.b}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(b) => set({ retriever: { ...r, bm25: { ...r.bm25, b } } })}
            />
          </div>
        </details>
      )}
    </div>
  );
}

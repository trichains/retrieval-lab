import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clipAroundMatch, coverageSegments, highlightParts } from "@/lib/highlight";
import { getDict, isLocale, LOCALES } from "@/lib/i18n";
import { PRESETS } from "@/lib/presets";
import {
  chunkerFromParams,
  DEFAULT_PIPELINE,
  defaultChunker,
  stateFromParams,
  stateToParams,
  withChunkerNumbers,
  type PlaygroundState,
} from "@/lib/url-state";
import { DEFAULT_ANALYZER, GridSchema, PipelineConfigSchema } from "@/src/core";

describe("playground URL state", () => {
  it("empty params give the defaults, and defaults serialize to an empty query string", () => {
    const state = stateFromParams(new URLSearchParams());
    expect(state).toEqual({ query: "", k: 5, config: DEFAULT_PIPELINE });
    expect(stateToParams(state).toString()).toBe("");
  });

  it("writes only non-default values with short keys", () => {
    const state: PlaygroundState = {
      query: "rotação de chave",
      k: 10,
      config: PipelineConfigSchema.parse({
        chunker: { type: "markdown", maxChars: 600 },
        retriever: { type: "hybrid", fusion: { type: "weighted", alpha: 0.3 } },
        reranker: { type: "mmr", lambda: 0.5 },
        contextHeaders: true,
      }),
    };
    const sp = stateToParams(state);
    expect(Object.fromEntries(sp)).toEqual({
      q: "rotação de chave",
      k: "10",
      ch: "markdown",
      cs: "600",
      f: "weighted",
      fa: "0.3",
      rr: "mmr",
      rl: "0.5",
      ctx: "1",
    });
    expect(stateFromParams(sp)).toEqual(state);
  });

  it("falls back to defaults for invalid or hostile values", () => {
    const state = stateFromParams(
      new URLSearchParams("ch=evil&cs=-5&r=magic&k=999&rr=mmr&rl=7&agg=median&q=" + "x".repeat(900)),
    );
    expect(state.config.chunker).toEqual(DEFAULT_PIPELINE.chunker);
    expect(state.config.retriever).toEqual(DEFAULT_PIPELINE.retriever);
    expect(state.k).toBe(5);
    expect(state.config.reranker).toEqual({ type: "none" });
    expect(state.config.aggregation).toBe("max");
    expect(state.query).toHaveLength(500);
  });

  it("round-trips any valid state (property)", () => {
    const chunker = fc.oneof(
      fc.constant(defaultChunker("none")),
      fc
        .record({ size: fc.integer({ min: 100, max: 3000 }), overlap: fc.integer({ min: 0, max: 99 }) })
        .map(({ size, overlap }) => withChunkerNumbers({ type: "recursive", size, overlap }, size, overlap)),
      fc.integer({ min: 100, max: 3000 }).map((n) => withChunkerNumbers({ type: "markdown", maxChars: n }, n)),
    );
    const retriever = fc.oneof(
      fc
        .record({ k1: fc.constantFrom(0.9, 1.2, 2), b: fc.constantFrom(0, 0.5, 0.75) })
        .map((bm25) => ({ type: "bm25", bm25 })),
      fc.constant({ type: "vector" }),
      fc.integer({ min: 1, max: 120 }).map((k) => ({ type: "hybrid", fusion: { type: "rrf", k } })),
    );
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        fc.constantFrom(3, 5, 10, 20),
        chunker,
        retriever,
        fc.boolean(),
        (query, k, ch, r, ctx) => {
          const state: PlaygroundState = {
            query,
            k,
            config: PipelineConfigSchema.parse({ chunker: ch, retriever: r, contextHeaders: ctx }),
          };
          expect(stateFromParams(new URLSearchParams(stateToParams(state).toString()))).toEqual(state);
        },
      ),
    );
  });

  it("reads chunker settings, clamping invalid overlap to the type default", () => {
    expect(chunkerFromParams(new URLSearchParams("ch=sentence&cs=300&co=2"))).toEqual({
      type: "sentence",
      maxChars: 300,
      overlapSentences: 2,
    });
    expect(chunkerFromParams(new URLSearchParams("ch=recursive&cs=100&co=500"))).toEqual(defaultChunker("recursive"));
  });
});

describe("highlighting", () => {
  it("marks tokens whose analyzed form matches a query term, accents included", () => {
    const parts = highlightParts("A rotação das chaves", ["rot", "chav"], DEFAULT_ANALYZER, "pt");
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(["rotação", "chaves"]);
    expect(parts.map((p) => p.text).join("")).toBe("A rotação das chaves");
  });

  it("returns the text untouched without query terms", () => {
    expect(highlightParts("abc", [], DEFAULT_ANALYZER)).toEqual([{ text: "abc", match: false }]);
  });

  it("clips long text around the first match", () => {
    const text = `${"filler ".repeat(100)}needle ${"tail ".repeat(100)}`;
    const { parts, clipped } = clipAroundMatch(highlightParts(text, ["needl"], DEFAULT_ANALYZER, "en"), 120);
    expect(clipped).toBe(true);
    expect(parts.some((p) => p.match && p.text === "needle")).toBe(true);
    expect(parts.map((p) => p.text).join("").length).toBeLessThanOrEqual(124);
  });

  it("coverage segments partition the text and count overlaps", () => {
    const segments = coverageSegments(10, [
      { start: 0, end: 6 },
      { start: 4, end: 10 },
    ]);
    expect(segments).toEqual([
      { start: 0, end: 4, chunks: [0] },
      { start: 4, end: 6, chunks: [0, 1] },
      { start: 6, end: 10, chunks: [1] },
    ]);
  });
});

describe("i18n and presets", () => {
  it("has the same keys in both languages", () => {
    const keys = (o: object, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    expect(keys(getDict("en")).sort()).toEqual(keys(getDict("pt-BR")).sort());
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("every experiment preset is a valid grid", () => {
    for (const grid of Object.values(PRESETS)) expect(GridSchema.safeParse(grid).success).toBe(true);
  });
});

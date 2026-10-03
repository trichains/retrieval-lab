import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aggregateToDocs,
  lexicalFeatures,
  lexicalRerank,
  minimalCoverWindow,
  minMaxNormalize,
  mmrRerank,
  reciprocalRankFusion,
  weightedFusion,
  DEFAULT_ANALYZER,
  type ScoredId,
} from "@/src/core";

const list = (...ids: string[]): ScoredId[] => ids.map((id, i) => ({ id, score: ids.length - i }));

describe("reciprocalRankFusion", () => {
  it("computes 1 / (k + rank) sums (golden)", () => {
    const fused = reciprocalRankFusion(
      [
        { name: "a", hits: list("x", "y") },
        { name: "b", hits: list("y", "z") },
      ],
      60,
    );
    // y: 1/62 + 1/61; x: 1/61; z: 1/62
    expect(fused.map((h) => h.id)).toEqual(["y", "x", "z"]);
    expect(fused[0]!.score).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(fused[1]!.score).toBeCloseTo(1 / 61, 12);
  });

  it("counts an item once per list", () => {
    const fused = reciprocalRankFusion([{ name: "a", hits: [...list("x"), { id: "x", score: 0 }] }], 60);
    expect(fused[0]!.score).toBeCloseTo(1 / 61, 12);
  });

  it("rejects a negative k", () => {
    expect(() => reciprocalRankFusion([], -1)).toThrow(RangeError);
  });

  const rankedIds = fc.uniqueArray(fc.constantFrom(..."abcdefghij"), { maxLength: 10 });

  it("is invariant to the order of the input lists (property)", () => {
    fc.assert(
      fc.property(rankedIds, rankedIds, (a, b) => {
        const ab = reciprocalRankFusion([
          { name: "a", hits: list(...a) },
          { name: "b", hits: list(...b) },
        ]);
        const ba = reciprocalRankFusion([
          { name: "b", hits: list(...b) },
          { name: "a", hits: list(...a) },
        ]);
        return JSON.stringify(ab.map((h) => h.id)) === JSON.stringify(ba.map((h) => h.id));
      }),
    );
  });

  it("returns the union of the inputs, each once (property)", () => {
    fc.assert(
      fc.property(rankedIds, rankedIds, (a, b) => {
        const fused = reciprocalRankFusion([
          { name: "a", hits: list(...a) },
          { name: "b", hits: list(...b) },
        ]);
        const ids = fused.map((h) => h.id);
        return new Set(ids).size === ids.length && ids.length === new Set([...a, ...b]).size;
      }),
    );
  });

  it("preserves the order of a single list (property)", () => {
    fc.assert(
      fc.property(
        rankedIds,
        (a) =>
          JSON.stringify(reciprocalRankFusion([{ name: "a", hits: list(...a) }]).map((h) => h.id)) ===
          JSON.stringify(a),
      ),
    );
  });

  it("ranks an item first in every list first overall (property)", () => {
    fc.assert(
      fc.property(rankedIds, rankedIds, (a, b) => {
        const top = "top";
        const fused = reciprocalRankFusion([
          { name: "a", hits: list(top, ...a) },
          { name: "b", hits: list(top, ...b) },
        ]);
        return fused[0]!.id === top;
      }),
    );
  });

  it("scores are positive and bounded by lists / (k + 1) (property)", () => {
    fc.assert(
      fc.property(rankedIds, rankedIds, fc.integer({ min: 0, max: 100 }), (a, b, k) =>
        reciprocalRankFusion(
          [
            { name: "a", hits: list(...a) },
            { name: "b", hits: list(...b) },
          ],
          k,
        ).every((h) => h.score > 0 && h.score <= 2 / (k + 1) + 1e-12),
      ),
    );
  });
});

describe("weighted min-max fusion", () => {
  it("normalizes each list to [0, 1]", () => {
    const norm = minMaxNormalize([
      { id: "a", score: 10 },
      { id: "b", score: 5 },
      { id: "c", score: 0 },
    ]);
    expect([...norm]).toEqual([
      ["a", 1],
      ["b", 0.5],
      ["c", 0],
    ]);
    expect([...minMaxNormalize([{ id: "only", score: 3 }])]).toEqual([["only", 1]]);
    expect(minMaxNormalize([]).size).toBe(0);
  });

  it("blends normalized scores with weights (golden)", () => {
    const fused = weightedFusion(
      [
        {
          name: "bm25",
          hits: [
            { id: "a", score: 12 },
            { id: "b", score: 2 },
          ],
        },
        {
          name: "vec",
          hits: [
            { id: "b", score: 0.9 },
            { id: "c", score: 0.3 },
          ],
        },
      ],
      [0.5, 0.5],
    );
    // a: 0.5 * 1 + 0 = 0.5; b: 0.5 * 0 + 0.5 * 1 = 0.5; c: 0
    expect(fused.map((h) => [h.id, h.score])).toEqual([
      ["a", 0.5],
      ["b", 0.5],
      ["c", 0],
    ]);
  });

  it("alpha = 1 reproduces the first list's order", () => {
    const fused = weightedFusion(
      [
        { name: "x", hits: list("a", "b", "c") },
        { name: "y", hits: list("c", "b", "a") },
      ],
      [1, 0],
    );
    expect(fused.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("requires one weight per list", () => {
    expect(() => weightedFusion([{ name: "x", hits: [] }], [])).toThrow(RangeError);
  });
});

describe("MMR", () => {
  const vectors: Record<string, Float32Array> = {
    a: Float32Array.from([1, 0]),
    a2: Float32Array.from([1, 0]), // a near-duplicate of a
    b: Float32Array.from([0, 1]),
  };
  const candidates = [
    { id: "a", score: 1 },
    { id: "a2", score: 0.95 },
    { id: "b", score: 0.6 },
  ];

  it("lambda = 1 keeps the relevance order", () => {
    expect(mmrRerank(candidates, (id) => vectors[id], 1).map((h) => h.id)).toEqual(["a", "a2", "b"]);
  });

  it("pushes near-duplicates down when diversity matters", () => {
    expect(mmrRerank(candidates, (id) => vectors[id], 0.5).map((h) => h.id)).toEqual(["a", "b", "a2"]);
  });

  it("returns every candidate exactly once (property)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom("a", "a2", "b"), { minLength: 0, maxLength: 3 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (ids, lambda) => {
          const out = mmrRerank(
            ids.map((id, i) => ({ id, score: 3 - i })),
            (id) => vectors[id],
            lambda,
          );
          return out.length === ids.length && new Set(out.map((h) => h.id)).size === ids.length;
        },
      ),
    );
  });

  it("validates lambda", () => {
    expect(() => mmrRerank(candidates, () => undefined, 1.5)).toThrow(RangeError);
  });
});

describe("lexical reranker", () => {
  it("finds the smallest window covering every term", () => {
    expect(
      minimalCoverWindow(
        new Map([
          ["a", [0, 10]],
          ["b", [3, 11]],
        ]),
      ),
    ).toBe(2);
    expect(minimalCoverWindow(new Map([["a", [5]]]))).toBe(1);
    expect(minimalCoverWindow(new Map())).toBe(0);
  });

  it("measures coverage and proximity", () => {
    const terms = ["webhook", "signatur"];
    expect(lexicalFeatures(terms, "Webhook signature checks", DEFAULT_ANALYZER, "en")).toEqual({
      coverage: 1,
      proximity: 1,
    });
    const far = lexicalFeatures(
      terms,
      "Webhook delivery has many parts and one of them is a signature",
      DEFAULT_ANALYZER,
      "en",
    );
    expect(far.coverage).toBe(1);
    expect(far.proximity).toBeLessThan(0.5);
    expect(lexicalFeatures(terms, "Billing", DEFAULT_ANALYZER, "en")).toEqual({ coverage: 0, proximity: 0 });
    expect(lexicalFeatures([], "x", DEFAULT_ANALYZER)).toEqual({ coverage: 0, proximity: 0 });
  });

  it("moves a chunk that contains all query terms up", () => {
    const texts: Record<string, string> = {
      vague: "Notes about delivery of events",
      exact: "How to verify the webhook signature",
    };
    const reranked = lexicalRerank(
      [
        { id: "vague", score: 0.9 },
        { id: "exact", score: 0.8 },
      ],
      ["verify", "webhook", "signatur"],
      (id) => ({ text: texts[id]!, lang: "en" }),
      // With two candidates min-max maps the retrieval scores to exactly 1 and 0, so the lexical
      // evidence needs a weight above 0.5 to overturn them.
      0.7,
      DEFAULT_ANALYZER,
    );
    expect(reranked.map((h) => h.id)).toEqual(["exact", "vague"]);
  });

  it("weight = 0 keeps the retrieval order", () => {
    const reranked = lexicalRerank(list("a", "b", "c"), ["x"], () => ({ text: "x" }), 0, DEFAULT_ANALYZER);
    expect(reranked.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });
});

describe("aggregateToDocs", () => {
  const hits = [
    { id: "A:0", docId: "A", score: 0.9 },
    { id: "B:0", docId: "B", score: 0.8 },
    { id: "B:1", docId: "B", score: 0.7 },
    { id: "C:0", docId: "C", score: 0.2 },
    { id: "A:1", docId: "A", score: 0.1 },
  ];

  it("max: a document is as good as its best chunk", () => {
    expect(aggregateToDocs(hits, "max").map((d) => [d.docId, d.score, d.rank, d.bestChunkId, d.chunkCount])).toEqual([
      ["A", 0.9, 1, "A:0", 2],
      ["B", 0.8, 2, "B:0", 2],
      ["C", 0.2, 3, "C:0", 1],
    ]);
  });

  it("sum rewards several matching chunks", () => {
    expect(aggregateToDocs(hits, "sum").map((d) => d.docId)).toEqual(["B", "A", "C"]);
  });

  it("mean averages retrieved chunks", () => {
    const docs = aggregateToDocs(hits, "mean");
    expect(docs.map((d) => d.docId)).toEqual(["B", "A", "C"]);
    expect(docs[1]!.score).toBeCloseTo(0.5, 12);
  });

  it("max preserves the order of first appearance (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("A", "B", "C", "D"), { maxLength: 30 }), (docIds) => {
        const ranked = docIds.map((docId, i) => ({ id: `${docId}:${i}`, docId, score: docIds.length - i }));
        const expected = [...new Set(docIds)];
        return JSON.stringify(aggregateToDocs(ranked, "max").map((d) => d.docId)) === JSON.stringify(expected);
      }),
    );
  });
});

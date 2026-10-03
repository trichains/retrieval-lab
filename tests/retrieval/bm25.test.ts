import { describe, expect, it } from "vitest";
import { Bm25Index, topK, compareScored, type IndexItem } from "@/src/core";
import fc from "fast-check";

const plain = { stem: "none", stopwords: false } as const;

// Tiny corpus for hand-computed golden values. N = 3, lengths 3, 2, 1, so avgdl = 2.
const items: IndexItem[] = [
  { id: "d1", docId: "d1", text: "cat cat dog" },
  { id: "d2", docId: "d2", text: "dog bird" },
  { id: "d3", docId: "d3", text: "fish" },
];

describe("Bm25Index (golden values, k1 = 1.2, b = 0.75)", () => {
  const index = new Bm25Index(items, { analyzer: plain });

  it("computes Lucene IDF", () => {
    // idf(cat) = ln(1 + (3 - 1 + 0.5) / (1 + 0.5)) = ln(2.6667) = 0.980829
    expect(index.idf("cat")).toBeCloseTo(0.9808292530117264, 12);
    // idf(dog) = ln(1 + (3 - 2 + 0.5) / (2 + 0.5)) = ln(1.6) = 0.470004
    expect(index.idf("dog")).toBeCloseTo(0.4700036292457356, 12);
    // A term in no document still has a positive IDF: ln(1 + 3.5 / 0.5) = ln(8)
    expect(index.idf("zebra")).toBeCloseTo(Math.log(8), 12);
  });

  it("scores a single-term query", () => {
    // d1: tf = 2, |d| = 3. norm = 1 - 0.75 + 0.75 * 3 / 2 = 1.375
    // score = 0.980829 * 2 * 2.2 / (2 + 1.2 * 1.375) = 0.980829 * 4.4 / 3.65 = 1.182370
    const [hit] = index.search("cat", 10);
    expect(hit).toMatchObject({ id: "d1", docId: "d1" });
    expect(hit!.score).toBeCloseTo(1.1823695104798895, 10);
  });

  it("applies length normalization", () => {
    // "dog": d2 (|d| = 2 = avgdl, norm = 1) scores idf * 2.2 / 2.2 = 0.470004
    //        d1 (|d| = 3, norm = 1.375) scores idf * 2.2 / 2.65 = 0.390192
    const hits = index.search("dog", 10);
    expect(hits.map((h) => h.id)).toEqual(["d2", "d1"]);
    expect(hits[0]!.score).toBeCloseTo(0.4700036292457355, 10);
    expect(hits[1]!.score).toBeCloseTo(0.3901916922040069, 10);
  });

  it("sums term contributions for multi-term queries", () => {
    // d1: 1.182370 + 0.390192 = 1.572561
    const [hit] = index.search("cat dog", 10);
    expect(hit!.score).toBeCloseTo(1.5725612026838964, 10);
  });

  it("counts repeated query terms once", () => {
    expect(index.search("cat cat cat", 10)[0]!.score).toBeCloseTo(index.search("cat", 10)[0]!.score, 12);
  });

  it("with b = 0 ignores document length", () => {
    const noNorm = new Bm25Index(items, { analyzer: plain, b: 0 });
    const hits = noNorm.search("dog", 10);
    expect(hits[0]!.score).toBeCloseTo(hits[1]!.score, 12);
    expect(hits[0]!.score).toBeCloseTo(0.4700036292457355, 10);
  });

  it("with k1 = 0 ignores term frequency", () => {
    const binary = new Bm25Index(items, { analyzer: plain, k1: 0 });
    expect(binary.search("cat", 10)[0]!.score).toBeCloseTo(binary.idf("cat"), 12);
  });

  it("explains a score term by term", () => {
    const parts = index.explain("cat dog", "d1");
    expect(parts.map((p) => [p.term, p.tf, p.df])).toEqual([
      ["cat", 2, 1],
      ["dog", 1, 2],
    ]);
    expect(parts.reduce((s, p) => s + p.score, 0)).toBeCloseTo(1.5725612026838964, 10);
    expect(index.explain("cat", "missing")).toEqual([]);
  });

  it("returns only matching items, at most k", () => {
    expect(index.search("bird fish", 1)).toHaveLength(1);
    expect(index.search("unicorn", 10)).toEqual([]);
    expect(index.search("", 10)).toEqual([]);
  });

  it("reports corpus statistics", () => {
    expect(index.size).toBe(3);
    expect(index.avgLength).toBe(2);
    expect(index.vocabularySize).toBe(4);
    expect(index.documentFrequency("dog")).toBe(2);
  });

  it("handles an empty corpus", () => {
    const empty = new Bm25Index([], { analyzer: plain });
    expect(empty.search("anything", 5)).toEqual([]);
  });
});

describe("Bm25Index with the default analyzer", () => {
  const index = new Bm25Index([
    { id: "pt", docId: "pt", text: "Como fazer a rotação das chaves de API", lang: "pt" },
    { id: "en", docId: "en", text: "Rotating API keys every 90 days", lang: "en" },
    { id: "x", docId: "x", text: "Billing and invoices", lang: "en" },
  ]);

  it("matches unaccented queries against accented text", () => {
    expect(index.search("rotacao chave", 3)[0]!.id).toBe("pt");
  });

  it("matches inflected forms via stemming", () => {
    expect(index.search("rotate key", 3)[0]!.id).toBe("en");
  });

  it("ignores stopwords in the query", () => {
    expect(index.queryTerms("the invoices of the month")).toEqual(["invoic", "month"]);
  });
});

describe("topK", () => {
  it("matches a full sort (property)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.string({ maxLength: 4 }), score: fc.double({ noNaN: true, min: -1e6, max: 1e6 }) }),
          {
            maxLength: 200,
          },
        ),
        fc.integer({ min: 0, max: 50 }),
        (list, k) => {
          const expected = [...list].sort(compareScored).slice(0, k);
          return JSON.stringify(topK(list, k, compareScored)) === JSON.stringify(expected);
        },
      ),
    );
  });

  it("breaks score ties by id", () => {
    const hits = topK(
      [
        { id: "b", score: 1 },
        { id: "a", score: 1 },
        { id: "c", score: 2 },
      ],
      3,
      compareScored,
    );
    expect(hits.map((h) => h.id)).toEqual(["c", "a", "b"]);
  });
});

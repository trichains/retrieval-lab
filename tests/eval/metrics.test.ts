import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  averagePrecision,
  computeMetrics,
  dcgAt,
  hitAt,
  mean,
  metricKeys,
  ndcgAt,
  precisionAt,
  recallAt,
  reciprocalRank,
} from "@/src/core";

const qrels = new Map([
  ["a", 1],
  ["c", 3],
  ["d", 2],
]);
const ranked = ["a", "b", "c"];

describe("ranking metrics (golden values)", () => {
  it("precision@k counts missing positions as misses", () => {
    expect(precisionAt(ranked, qrels, 3)).toBeCloseTo(2 / 3, 12);
    expect(precisionAt(ranked, qrels, 5)).toBeCloseTo(2 / 5, 12);
    expect(precisionAt(ranked, qrels, 0)).toBe(0);
  });

  it("recall@k divides by all relevant documents", () => {
    expect(recallAt(ranked, qrels, 3)).toBeCloseTo(2 / 3, 12);
    expect(recallAt(ranked, qrels, 1)).toBeCloseTo(1 / 3, 12);
  });

  it("hit@k and reciprocal rank", () => {
    expect(hitAt(["x", "a"], qrels, 1)).toBe(0);
    expect(hitAt(["x", "a"], qrels, 2)).toBe(1);
    expect(reciprocalRank(["x", "y", "c"], qrels, 10)).toBeCloseTo(1 / 3, 12);
    expect(reciprocalRank(["x", "y", "c"], qrels, 2)).toBe(0);
  });

  it("average precision with cutoff", () => {
    // Relevant at ranks 1 and 3: (1/1 + 2/3) / min(3, 10) = 0.5556
    expect(averagePrecision(ranked, qrels, 10)).toBeCloseTo((1 + 2 / 3) / 3, 12);
    // With k = 2 only rank 1 counts, and the denominator is min(3, 2) = 2.
    expect(averagePrecision(ranked, qrels, 2)).toBeCloseTo(1 / 2, 12);
  });

  it("DCG uses exponential gain and log2 discount", () => {
    // (2^3 - 1)/log2(2) + (2^1 - 1)/log2(3) = 7 + 0.6309
    expect(dcgAt([3, 1], 10)).toBeCloseTo(7 + 1 / Math.log2(3), 12);
    expect(dcgAt([3, 1], 1)).toBe(7);
  });

  it("nDCG@k against the ideal ordering", () => {
    // DCG@3 of [a(1), b(0), c(3)] = 1/1 + 0 + 7/log2(4) = 4.5
    // IDCG@3 of [3, 2, 1] = 7/1 + 3/log2(3) + 1/log2(4) = 9.392789
    expect(ndcgAt(ranked, qrels, 3)).toBeCloseTo(0.47909091485969846, 12);
    expect(ndcgAt(["c", "d", "a"], qrels, 3)).toBeCloseTo(1, 12);
    expect(ndcgAt(["x"], qrels, 3)).toBe(0);
  });

  it("ignores duplicate ids after their first occurrence", () => {
    expect(precisionAt(["a", "a", "a"], qrels, 3)).toBeCloseTo(1 / 3, 12);
    expect(recallAt(["c", "c"], qrels, 2)).toBeCloseTo(1 / 3, 12);
  });

  it("returns 0, not NaN, when a query has no relevant document", () => {
    const none = new Map<string, number>();
    expect(recallAt(["a"], none, 5)).toBe(0);
    expect(averagePrecision(["a"], none, 5)).toBe(0);
    expect(ndcgAt(["a"], none, 5)).toBe(0);
  });

  it("names metric keys from the cutoffs", () => {
    expect(metricKeys([10, 5])).toEqual([
      "ndcg@5",
      "ndcg@10",
      "recall@5",
      "recall@10",
      "precision@5",
      "precision@10",
      "hit@5",
      "hit@10",
      "mrr@10",
      "map@10",
    ]);
    expect(Object.keys(computeMetrics(ranked, qrels, [5, 10])).sort()).toEqual(metricKeys([5, 10]).sort());
  });

  it("mean of an empty list is 0", () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe("metric properties", () => {
  const ids = fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h");
  const rankedArb = fc.array(ids, { maxLength: 12 });
  const qrelsArb = fc
    .uniqueArray(fc.tuple(ids, fc.integer({ min: 1, max: 3 })), { minLength: 1, maxLength: 6, selector: (t) => t[0] })
    .map((pairs) => new Map(pairs));
  const kArb = fc.integer({ min: 1, max: 15 });

  it("every metric is within [0, 1]", () => {
    fc.assert(
      fc.property(rankedArb, qrelsArb, kArb, (r, q, k) =>
        Object.values(computeMetrics(r, q, [k])).every((v) => v >= 0 && v <= 1 + 1e-12),
      ),
    );
  });

  it("recall and hit rate never decrease as k grows", () => {
    fc.assert(
      fc.property(rankedArb, qrelsArb, kArb, (r, q, k) => {
        return recallAt(r, q, k + 1) >= recallAt(r, q, k) && hitAt(r, q, k + 1) >= hitAt(r, q, k);
      }),
    );
  });

  it("the ideal ranking has nDCG 1 and AP 1", () => {
    fc.assert(
      fc.property(qrelsArb, kArb, (q, k) => {
        const ideal = [...q].sort((x, y) => y[1] - x[1]).map(([id]) => id);
        return Math.abs(ndcgAt(ideal, q, k) - 1) < 1e-9 && Math.abs(averagePrecision(ideal, q, k) - 1) < 1e-9;
      }),
    );
  });

  it("hit@k is 1 exactly when the reciprocal rank is positive", () => {
    fc.assert(
      fc.property(rankedArb, qrelsArb, kArb, (r, q, k) => (hitAt(r, q, k) === 1) === reciprocalRank(r, q, k) > 0),
    );
  });

  it("moving a relevant document up never lowers nDCG", () => {
    fc.assert(
      fc.property(rankedArb, qrelsArb, kArb, fc.nat(), (r, q, k, pick) => {
        const unique = [...new Set(r)];
        const relevantPositions = unique.map((id, i) => [id, i] as const).filter(([id]) => q.has(id));
        if (relevantPositions.length === 0) return true;
        const [id, pos] = relevantPositions[pick % relevantPositions.length]!;
        if (pos === 0) return true;
        const promoted = [...unique];
        [promoted[pos - 1], promoted[pos]] = [id, promoted[pos - 1]!];
        // Swapping with a document of a higher grade could lower DCG; only check against lower grades.
        if ((q.get(unique[pos - 1]!) ?? 0) > (q.get(id) ?? 0)) return true;
        return ndcgAt(promoted, q, k) >= ndcgAt(unique, q, k) - 1e-12;
      }),
    );
  });
});

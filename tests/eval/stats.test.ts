import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bootstrapMeanCI, mulberry32, pairedBootstrap, quantile } from "@/src/core";

describe("mulberry32", () => {
  it("is reproducible for a seed and differs across seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it("returns values in [0, 1) (property)", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rand = mulberry32(seed);
        return Array.from({ length: 50 }, rand).every((x) => x >= 0 && x < 1);
      }),
    );
  });

  it("is roughly uniform", () => {
    const rand = mulberry32(7);
    const values = Array.from({ length: 20_000 }, rand);
    const avg = values.reduce((s, x) => s + x, 0) / values.length;
    expect(avg).toBeGreaterThan(0.49);
    expect(avg).toBeLessThan(0.51);
  });
});

describe("quantile", () => {
  it("interpolates linearly", () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("bootstrapMeanCI", () => {
  it("is deterministic for a seed (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 30 }),
        fc.integer(),
        (values, seed) => {
          const a = bootstrapMeanCI(values, { seed, samples: 200 });
          const b = bootstrapMeanCI(values, { seed, samples: 200 });
          return a[0] === b[0] && a[1] === b[1];
        },
      ),
    );
  });

  it("brackets the sample mean and stays within the data range (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 30 }), (values) => {
        const [lo, hi] = bootstrapMeanCI(values, { samples: 300 });
        const m = values.reduce((s, x) => s + x, 0) / values.length;
        return lo <= m + 1e-9 && hi >= m - 1e-9 && lo >= Math.min(...values) - 1e-9 && hi <= Math.max(...values) + 1e-9;
      }),
    );
  });

  it("collapses to the value for constant data and handles empty input", () => {
    expect(bootstrapMeanCI([0.5, 0.5, 0.5])).toEqual([0.5, 0.5]);
    expect(bootstrapMeanCI([])).toEqual([0, 0]);
  });

  it("narrows as the sample grows", () => {
    const rand = mulberry32(1);
    const small = Array.from({ length: 10 }, rand);
    const large = Array.from({ length: 400 }, rand);
    const width = ([lo, hi]: [number, number]) => hi - lo;
    expect(width(bootstrapMeanCI(large))).toBeLessThan(width(bootstrapMeanCI(small)));
  });
});

describe("pairedBootstrap", () => {
  it("detects a consistent improvement", () => {
    const a = Array.from({ length: 40 }, (_, i) => (i % 5) / 10);
    const b = a.map((x) => x + 0.1);
    const result = pairedBootstrap(a, b, { samples: 2000 });
    expect(result.delta).toBeCloseTo(0.1, 12);
    expect(result.significant).toBe(true);
    expect(result.ci[0]).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.01);
    expect(result).toMatchObject({ n: 40, wins: 40, losses: 0, ties: 0 });
  });

  it("does not call noise a difference", () => {
    const rand = mulberry32(3);
    const a = Array.from({ length: 30 }, rand);
    const b = a.map((x, i) => x + (i % 2 === 0 ? 0.05 : -0.05));
    const result = pairedBootstrap(a, b, { samples: 2000 });
    expect(result.significant).toBe(false);
    expect(result.ci[0]).toBeLessThan(0);
    expect(result.ci[1]).toBeGreaterThan(0);
    expect(result.pValue).toBeGreaterThan(0.5);
  });

  it("reports identical systems as tied", () => {
    const result = pairedBootstrap([0.2, 0.4], [0.2, 0.4]);
    expect(result).toMatchObject({ delta: 0, ci: [0, 0], pValue: 1, significant: false, ties: 2 });
  });

  it("is antisymmetric: swapping A and B negates the delta (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })), {
          minLength: 1,
          maxLength: 25,
        }),
        (pairs) => {
          const a = pairs.map((p) => p[0]);
          const b = pairs.map((p) => p[1]);
          const ab = pairedBootstrap(a, b, { samples: 200, seed: 9 });
          const ba = pairedBootstrap(b, a, { samples: 200, seed: 9 });
          return Math.abs(ab.delta + ba.delta) < 1e-12 && ab.wins === ba.losses;
        },
      ),
    );
  });

  it("is deterministic for a seed", () => {
    const a = [0.1, 0.5, 0.9, 0.3];
    const b = [0.2, 0.4, 1, 0.3];
    expect(pairedBootstrap(a, b, { seed: 5 })).toEqual(pairedBootstrap(a, b, { seed: 5 }));
  });

  it("requires paired samples of equal length and handles empty input", () => {
    expect(() => pairedBootstrap([1], [])).toThrow(RangeError);
    expect(pairedBootstrap([], [])).toMatchObject({ n: 0, significant: false, pValue: 1 });
  });
});

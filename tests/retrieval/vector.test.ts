import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cosine, dot, fnv1a32, HashingEmbedder, l2Normalize, VectorIndex, type Embedder } from "@/src/core";

const norm = (v: Float32Array) => Math.sqrt(dot(v, v));

describe("fnv1a32", () => {
  it("is deterministic and unsigned", () => {
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
    expect(fnv1a32("hello")).toBeGreaterThanOrEqual(0);
    expect(fnv1a32("hello")).not.toBe(fnv1a32("hellp"));
    expect(fnv1a32("hello", 1)).not.toBe(fnv1a32("hello", 2));
  });

  it("spreads short keys over buckets", () => {
    const buckets = new Set(Array.from({ length: 1000 }, (_, i) => fnv1a32(`w:${i}`) % 64));
    expect(buckets.size).toBe(64);
  });
});

describe("vector math", () => {
  it("normalizes to unit length and leaves zero vectors alone", () => {
    expect(norm(l2Normalize(Float32Array.from([3, 4])))).toBeCloseTo(1, 6);
    expect([...l2Normalize(new Float32Array(3))]).toEqual([0, 0, 0]);
  });

  it("computes cosine similarity", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBe(0);
    expect(cosine(Float32Array.from([1, 1]), Float32Array.from([2, 2]))).toBeCloseTo(1, 6);
    expect(cosine(new Float32Array(2), Float32Array.from([1, 1]))).toBe(0);
  });

  it("rejects mismatched dimensions", () => {
    expect(() => dot(new Float32Array(2), new Float32Array(3))).toThrow(RangeError);
  });
});

describe("HashingEmbedder", () => {
  const embedder = new HashingEmbedder({ dims: 512 });

  it("produces unit vectors of the configured size", () => {
    const v = embedder.embedSync("Rotate your API keys");
    expect(v).toHaveLength(512);
    expect(norm(v)).toBeCloseTo(1, 5);
  });

  it("returns a zero vector for text with no features", () => {
    expect(norm(embedder.embedSync("the of and"))).toBe(0);
    expect(norm(embedder.embedSync(""))).toBe(0);
  });

  it("extracts unigram, bigram and character trigram features", () => {
    const f = embedder.features("API keys");
    expect(f.get("w:api")).toBe(1);
    expect(f.get("w:keys")).toBe(1);
    expect(f.get("b:api keys")).toBe(0.5);
    expect(f.get("c:#ap")).toBeCloseTo(0.35, 10);
  });

  it("is accent and case insensitive", () => {
    expect([...embedder.embedSync("Rotação de Chaves")]).toEqual([...embedder.embedSync("rotacao de chaves")]);
  });

  it("is tolerant to typos thanks to character n-grams", () => {
    const q = embedder.embedSync("webhok signature");
    expect(dot(q, embedder.embedSync("webhook signature verification"))).toBeGreaterThan(
      dot(q, embedder.embedSync("invoice payment receipt")),
    );
  });

  it("finds partial overlap between cognates across languages", () => {
    const pt = embedder.embedSync("autenticação");
    expect(dot(pt, embedder.embedSync("authentication"))).toBeGreaterThan(dot(pt, embedder.embedSync("billing")));
  });

  it("has a stable id that reflects its settings", () => {
    expect(embedder.id).toBe("hashing:512:0.5:0.35");
    expect(new HashingEmbedder().id).toBe("hashing:1024:0.5:0.35");
    expect(() => new HashingEmbedder({ dims: 0 })).toThrow(RangeError);
  });

  it("is deterministic across instances (property)", () => {
    const other = new HashingEmbedder({ dims: 512 });
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (s) => {
        const a = embedder.embedSync(s);
        const b = other.embedSync(s);
        return a.every((x, i) => x === b[i]);
      }),
    );
  });

  it("always returns unit or zero vectors (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (s) => {
        const n = norm(embedder.embedSync(s));
        return n === 0 || Math.abs(n - 1) < 1e-4;
      }),
    );
  });

  it("embeds batches in order", async () => {
    const [a, b] = await embedder.embed(["alpha", "beta"]);
    expect([...a!]).toEqual([...embedder.embedSync("alpha")]);
    expect([...b!]).toEqual([...embedder.embedSync("beta")]);
  });
});

describe("VectorIndex", () => {
  const items = [
    { id: "a", docId: "A", text: "webhook signature verification with HMAC" },
    { id: "b", docId: "B", text: "monthly invoices and billing plans" },
    { id: "c", docId: "C", text: "rate limits and 429 responses" },
  ];

  it("ranks by cosine similarity and drops non-positive scores", async () => {
    const index = await VectorIndex.build(items, new HashingEmbedder());
    const hits = await index.search("verify webhook signatures", 3);
    expect(hits[0]).toMatchObject({ id: "a", docId: "A" });
    expect(hits.every((h) => h.score > 0)).toBe(true);
    expect(await index.search("the", 3)).toEqual([]);
  });

  it("exposes stored vectors", async () => {
    const index = await VectorIndex.build(items, new HashingEmbedder());
    expect(index.size).toBe(3);
    expect(index.vectorOf("a")).toBeInstanceOf(Float32Array);
    expect(index.vectorOf("zzz")).toBeUndefined();
  });

  it("normalizes vectors from embedders that do not", async () => {
    const raw: Embedder = {
      id: "raw",
      embed: async (texts) => texts.map((t) => Float32Array.from([t.length, 1])),
    };
    const index = await VectorIndex.build(items, raw);
    expect(norm(index.vectorOf("a")!)).toBeCloseTo(1, 5);
  });

  it("fails loudly when an embedder returns the wrong number of vectors", async () => {
    const broken: Embedder = { id: "broken", embed: async () => [] };
    await expect(VectorIndex.build(items, broken)).rejects.toThrow(/returned 0 vectors/);
  });
});

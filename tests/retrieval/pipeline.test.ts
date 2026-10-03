import { describe, expect, it } from "vitest";
import {
  contextHeader,
  IndexCache,
  parsePipelineConfig,
  RetrievalPipeline,
  describePipeline,
  type PipelineConfigInput,
} from "@/src/core";

const docs = [
  {
    id: "hooks",
    title: "Webhooks",
    lang: "en",
    text: "# Webhooks\n\n## Signatures\n\nEvery delivery has a Nimbus-Signature header with an HMAC.\n\n## Retries\n\nFailed deliveries are retried up to 8 times with exponential backoff.",
  },
  {
    id: "keys",
    title: "API keys",
    lang: "en",
    text: "Rotate API keys every 90 days. The old key keeps working for 24 hours.",
  },
  {
    id: "faturas",
    title: "Faturas",
    lang: "pt",
    text: "A fatura mensal é emitida no dia 1. Pagamentos recusados geram nova tentativa.",
  },
];

const build = (input: PipelineConfigInput) => RetrievalPipeline.build(docs, parsePipelineConfig(input));

describe("RetrievalPipeline", () => {
  it("bm25: returns chunk hits, document hits and signals", async () => {
    const pipeline = await build({ chunker: { type: "markdown", maxChars: 500 }, retriever: { type: "bm25" } });
    const result = await pipeline.search("webhook retries backoff", { k: 3 });
    expect(result.hits[0]!.chunk.headingPath).toEqual(["Webhooks", "Retries"]);
    expect(result.hits[0]!.signals.bm25).toMatchObject({ rank: 1 });
    expect(result.docs[0]).toMatchObject({ docId: "hooks", rank: 1 });
    expect(result.rankedDocIds[0]).toBe("hooks");
    expect(result.queryTerms).toEqual(["webhook", "retri", "retry", "backoff"]);
  });

  it("vector: works with the default hashing embedder", async () => {
    const pipeline = await build({ chunker: { type: "none" }, retriever: { type: "vector" } });
    const result = await pipeline.search("fatura mensal", { k: 2 });
    expect(result.docs[0]!.docId).toBe("faturas");
    expect(result.hits[0]!.signals.vector!.score).toBeGreaterThan(0);
  });

  it("hybrid: records the rank of each item in both lists and after fusion", async () => {
    const pipeline = await build({ chunker: { type: "none" }, retriever: { type: "hybrid" } });
    const result = await pipeline.search("rotate api keys", { k: 3 });
    const top = result.hits[0]!;
    expect(top.chunk.docId).toBe("keys");
    expect(top.signals.fused).toMatchObject({ rank: 1 });
    expect(top.signals.bm25!.rank).toBe(1);
    expect(top.signals.vector!.rank).toBe(1);
  });

  it("hybrid with weighted fusion", async () => {
    const pipeline = await build({
      chunker: { type: "none" },
      retriever: { type: "hybrid", fusion: { type: "weighted", alpha: 0.7 } },
    });
    const result = await pipeline.search("hmac signature", { k: 1 });
    expect(result.hits[0]!.chunk.docId).toBe("hooks");
  });

  it("rerankers record the rank before and after", async () => {
    for (const reranker of [{ type: "mmr" as const }, { type: "lexical" as const }]) {
      const pipeline = await build({
        chunker: { type: "sentence", maxChars: 80 },
        retriever: { type: "bm25" },
        reranker,
      });
      const result = await pipeline.search("signature header hmac", { k: 3 });
      expect(result.hits.length).toBeGreaterThan(0);
      for (const hit of result.hits) {
        expect(hit.signals.rerank).toMatchObject({ rank: hit.rank });
        expect(hit.signals.rerank!.before).toBeGreaterThanOrEqual(1);
      }
      // Rank-derived scores keep the final list sorted.
      const scores = result.hits.map((h) => h.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it("context headers are indexed but chunk text stays an exact slice", async () => {
    const pipeline = await build({
      chunker: { type: "markdown", maxChars: 500 },
      retriever: { type: "bm25" },
      contextHeaders: true,
    });
    const result = await pipeline.search("retries", { k: 1 });
    const hit = result.hits[0]!;
    expect(hit.indexedText.startsWith("Webhooks > Retries\n")).toBe(true);
    const doc = docs.find((d) => d.id === hit.chunk.docId)!;
    expect(doc.text.slice(hit.chunk.start, hit.chunk.end)).toBe(hit.chunk.text);
  });

  it("returns empty results for queries with no usable terms", async () => {
    const pipeline = await build({ chunker: { type: "none" }, retriever: { type: "hybrid" } });
    const result = await pipeline.search("the of and", { k: 5 });
    expect(result.hits).toEqual([]);
    expect(result.docs).toEqual([]);
  });

  it("shares chunking and indexes through the cache", async () => {
    const cache = new IndexCache(docs);
    const config = parsePipelineConfig({ chunker: { type: "recursive", size: 60 }, retriever: { type: "bm25" } });
    const a = await RetrievalPipeline.build(cache, config);
    const b = await RetrievalPipeline.build(cache, config);
    expect(a.chunks).toBe(b.chunks);
    expect(a.bm25Index).toBe(b.bm25Index);
    expect(cache.document("keys")?.title).toBe("API keys");
  });

  it("describes a configuration compactly", () => {
    const config = parsePipelineConfig({
      chunker: { type: "recursive", size: 800, overlap: 100 },
      retriever: { type: "hybrid", fusion: { type: "rrf", k: 60 } },
      reranker: { type: "mmr", lambda: 0.7 },
      contextHeaders: true,
    });
    expect(describePipeline(config)).toBe("recursive(800/100) · hybrid(rrf60) · mmr(0.7) · ctx");
  });
});

describe("contextHeader", () => {
  it("joins title and headings, skipping a repeated top heading", () => {
    expect(contextHeader("Webhooks", ["Webhooks", "Retries"])).toBe("Webhooks > Retries");
    expect(contextHeader(undefined, ["A"])).toBe("A");
    expect(contextHeader("Doc", undefined)).toBe("Doc");
    expect(contextHeader(undefined, undefined)).toBe("");
  });
});

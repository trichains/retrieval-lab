import { describe, expect, it } from "vitest";
import {
  checkEmbeddingBaseUrl,
  createEmbedder,
  documentLanguage,
  EmbedderConfigSchema,
  EmbeddingUrlError,
  GridSchema,
  IndexCache,
  OpenAICompatibleEmbedder,
  parsePipelineConfig,
  PipelineConfigSchema,
  RetrievalPipeline,
  runExperiment,
  type Dataset,
  type PipelineConfig,
} from "@/src/core";
import { stateFromParams } from "@/lib/url-state";

describe("document-level depth", () => {
  // 12 documents, each cut into ~30 tiny chunks that all match the query equally. Ties break by
  // chunk id, so the first 50 chunks all belong to the first two documents. A fixed chunk depth would
  // return 2 documents for k = 10; the pipeline must keep going until it has 10.
  const docs = Array.from({ length: 12 }, (_, i) => ({
    id: `d${String(i).padStart(2, "0")}`,
    lang: "en",
    text: Array.from({ length: 30 }, () => "alpha beta.").join(" "),
  }));

  it("retrieves at least k distinct documents when the index has them", async () => {
    const pipeline = await RetrievalPipeline.build(
      docs,
      parsePipelineConfig({ chunker: { type: "fixed-chars", size: 12, overlap: 0 }, retriever: { type: "bm25" } }),
    );
    expect(pipeline.chunks.length).toBeGreaterThan(300);
    const result = await pipeline.search("alpha", { k: 10 });
    expect(result.docs).toHaveLength(10);
    expect(new Set(result.rankedDocIds).size).toBeGreaterThanOrEqual(10);
    expect(result.depth).toBeGreaterThan(50);
  });

  it("stops when the index is exhausted", async () => {
    const pipeline = await RetrievalPipeline.build(
      docs.slice(0, 3),
      parsePipelineConfig({ chunker: { type: "fixed-chars", size: 12, overlap: 0 }, retriever: { type: "hybrid" } }),
    );
    const result = await pipeline.search("alpha", { k: 10 });
    expect(result.docs).toHaveLength(3);
  });

  it("recall is not biased down for fine-grained chunkers", async () => {
    const dataset: Dataset = {
      name: "depth",
      documents: docs,
      queries: [{ id: "q", text: "alpha" }],
      judgments: [{ queryId: "q", docId: "d09", grade: 3 }],
    };
    const result = await runExperiment(dataset, {
      chunkers: [{ type: "fixed-chars", size: 12, overlap: 0 }],
      retrievers: [{ type: "bm25" }],
      cutoffs: [10],
      bootstrap: { samples: 100, seed: 1 },
    });
    expect(result.configs[0]!.metrics["recall@10"]).toBe(1);
  });
});

describe("network embedder base URL", () => {
  it.each([
    ["https://api.openai.com/v1/", "https://api.openai.com/v1"],
    ["http://localhost:11434/v1", "http://localhost:11434/v1"],
    ["http://127.0.0.1:1234/v1", "http://127.0.0.1:1234/v1"],
    ["http://[::1]:8080", "http://[::1]:8080"],
  ])("accepts %s", (raw, normalized) => {
    expect(checkEmbeddingBaseUrl(raw)).toBe(normalized);
  });

  it.each([
    "http://evil.example.com/v1",
    "http://192.168.0.10/v1",
    "ftp://example.com",
    "https://user:pass@example.com/v1",
    "not a url",
  ])("refuses %s", (raw) => {
    expect(() => checkEmbeddingBaseUrl(raw)).toThrow(EmbeddingUrlError);
  });

  it("the embedder itself refuses a plain-http remote host before any request", () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof globalThis.fetch;
    expect(
      () => new OpenAICompatibleEmbedder({ baseUrl: "http://evil.example.com", model: "m", apiKey: "k", fetch }),
    ).toThrow(EmbeddingUrlError);
    expect(called).toBe(false);
  });

  it("configs cannot carry a base URL", () => {
    expect(
      EmbedderConfigSchema.safeParse({ type: "openai", model: "m", baseUrl: "https://evil.example.com" }).success,
    ).toBe(false);
    expect(
      GridSchema.safeParse({
        chunkers: [{ type: "none" }],
        retrievers: [{ type: "vector", embedder: { type: "openai", model: "m", baseUrl: "https://evil.example.com" } }],
      }).success,
    ).toBe(false);
  });

  it("createEmbedder needs the base URL from the caller", () => {
    const config = EmbedderConfigSchema.parse({ type: "openai", model: "m" });
    expect(() => createEmbedder(config)).toThrow(/--embed-url or RLAB_EMBEDDINGS_BASE_URL/);
    expect(() => createEmbedder(config, { baseUrl: "http://evil.example.com" })).toThrow(EmbeddingUrlError);
    expect(createEmbedder(config, { baseUrl: "https://example.com/v1", fetch: globalThis.fetch }).id).toContain(
      "https://example.com/v1",
    );
  });
});

describe("reranker and aggregation", () => {
  it("rejects a reranker combined with sum or mean aggregation", () => {
    for (const aggregation of ["sum", "mean"] as const) {
      const parsed = PipelineConfigSchema.safeParse({
        chunker: { type: "none" },
        retriever: { type: "bm25" },
        reranker: { type: "mmr" },
        aggregation,
      });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toMatch(/only be combined with aggregation "max"/);
    }
    expect(
      PipelineConfigSchema.safeParse({ chunker: { type: "none" }, retriever: { type: "bm25" }, aggregation: "sum" })
        .success,
    ).toBe(true);
  });

  it("rejects the combination in grids and at pipeline build time", async () => {
    expect(
      GridSchema.safeParse({
        chunkers: [{ type: "none" }],
        retrievers: [{ type: "bm25" }],
        rerankers: [{ type: "none" }, { type: "lexical" }],
        aggregation: "mean",
      }).success,
    ).toBe(false);
    const forced = {
      ...parsePipelineConfig({ chunker: { type: "none" }, retriever: { type: "bm25" }, reranker: { type: "mmr" } }),
      aggregation: "sum",
    } as PipelineConfig;
    await expect(RetrievalPipeline.build([{ id: "a", text: "x" }], forced)).rejects.toThrow(/aggregation "max"/);
  });

  it("URL state drops the reranker when sum or mean is requested", () => {
    const state = stateFromParams(new URLSearchParams("rr=mmr&agg=sum"));
    expect(state.config.aggregation).toBe("sum");
    expect(state.config.reranker).toEqual({ type: "none" });
  });
});

describe("language per document", () => {
  const doc = {
    id: "mixed",
    // No lang: Portuguese overall, with a short English-looking section that would detect as unknown.
    text: [
      "A rotação das chaves de API deve ser feita com cuidado para não derrubar a aplicação.",
      "Deploys retries webhooks",
      "Depois da troca, a chave antiga continua válida por mais um dia para os clientes que ainda não atualizaram.",
    ].join("\n\n"),
  };

  it("is resolved once from the whole document", () => {
    expect(documentLanguage(doc)).toBe("pt");
    expect(documentLanguage({ ...doc, lang: "en" })).toBe("en");
  });

  it("every chunk of a document is indexed with the same language", () => {
    const cache = new IndexCache([doc]);
    const items = cache.items({ type: "paragraph", maxChars: 0 }, false);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.lang))).toEqual(new Set(["pt"]));
  });

  it("so the English-looking chunk is stemmed with the Portuguese stemmer only", async () => {
    const pipeline = await RetrievalPipeline.build(
      [doc],
      parsePipelineConfig({ chunker: { type: "paragraph", maxChars: 0 }, retriever: { type: "bm25" } }),
    );
    const index = pipeline.bm25Index!;
    // Analyzed as Portuguese: "retries" -> "retri" (the English stemmer would give "retry").
    expect(index.documentFrequency("retri")).toBe(1);
    expect(index.documentFrequency("retry")).toBe(0);
  });
});

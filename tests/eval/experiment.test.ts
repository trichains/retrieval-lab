import { describe, expect, it } from "vitest";
import {
  compareConfigs,
  expandGrid,
  GridSchema,
  metricsByTag,
  parseDataset,
  qrelsByQuery,
  rankConfigs,
  runExperiment,
  type Dataset,
} from "@/src/core";

const dataset: Dataset = {
  name: "mini",
  documents: [
    {
      id: "keys",
      title: "API keys",
      text: "Rotate your API keys every 90 days. A rotated key stays valid for 24 hours.",
      lang: "en",
    },
    { id: "hooks", title: "Webhooks", text: "Webhook requests carry an HMAC signature header. Verify it.", lang: "en" },
    { id: "bill", title: "Faturas", text: "As faturas são emitidas no primeiro dia do mês.", lang: "pt" },
    {
      id: "limits",
      title: "Rate limits",
      text: "Requests above the limit receive HTTP 429 with a Retry-After header.",
      lang: "en",
    },
  ],
  queries: [
    { id: "q1", text: "rotate api key", tags: ["keyword"] },
    { id: "q2", text: "verify webhook signature", tags: ["keyword"] },
    { id: "q3", text: "quando a fatura é emitida", tags: ["keyword", "pt"] },
    { id: "q4", text: "too many requests", tags: ["paraphrase"] },
  ],
  judgments: [
    { queryId: "q1", docId: "keys", grade: 3 },
    { queryId: "q2", docId: "hooks", grade: 3 },
    { queryId: "q3", docId: "bill", grade: 3 },
    { queryId: "q4", docId: "limits", grade: 2 },
    { queryId: "q4", docId: "hooks", grade: 0 },
  ],
};

describe("dataset schema", () => {
  it("accepts a valid dataset and builds qrels without grade-0 rows", () => {
    expect(parseDataset(dataset).ok).toBe(true);
    expect([...qrelsByQuery(dataset).get("q4")!]).toEqual([["limits", 2]]);
  });

  it("reports unknown ids, duplicates and queries without a relevant document", () => {
    const broken = {
      ...dataset,
      documents: [...dataset.documents, dataset.documents[0]],
      judgments: [
        ...dataset.judgments,
        { queryId: "q9", docId: "keys", grade: 1 },
        { queryId: "q1", docId: "nope", grade: 1 },
        { queryId: "q1", docId: "keys", grade: 2 },
      ],
      queries: [...dataset.queries, { id: "q5", text: "orphan" }],
    };
    const result = parseDataset(broken);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors.join("\n");
    expect(errors).toContain('duplicate document id "keys"');
    expect(errors).toContain('unknown query id "q9"');
    expect(errors).toContain('unknown document id "nope"');
    expect(errors).toContain("duplicate judgment for q1 / keys");
    expect(errors).toContain('query "q5" has no relevant document');
  });

  it("rejects grades outside 0..3 and empty texts", () => {
    expect(parseDataset({ ...dataset, judgments: [{ queryId: "q1", docId: "keys", grade: 4 }] }).ok).toBe(false);
    expect(parseDataset({ ...dataset, documents: [{ id: "x", text: "" }] }).ok).toBe(false);
    expect(parseDataset("nope").ok).toBe(false);
  });
});

describe("grid", () => {
  it("applies defaults", () => {
    const grid = GridSchema.parse({ chunkers: [{ type: "none" }], retrievers: [{ type: "bm25" }] });
    expect(grid.cutoffs).toEqual([5, 10]);
    expect(grid.rerankers).toEqual([{ type: "none" }]);
    expect(grid.retrievers[0]).toEqual({ type: "bm25", bm25: { k1: 1.2, b: 0.75 } });
  });

  it("expands to the cartesian product", () => {
    const grid = GridSchema.parse({
      chunkers: [{ type: "none" }, { type: "recursive", size: 100 }],
      retrievers: [{ type: "bm25" }, { type: "vector" }, { type: "hybrid" }],
      rerankers: [{ type: "none" }, { type: "mmr" }],
      contextHeaders: [false, true],
    });
    expect(expandGrid(grid)).toHaveLength(2 * 3 * 2 * 2);
  });

  it("rejects overlap >= size and unknown types", () => {
    expect(
      GridSchema.safeParse({ chunkers: [{ type: "recursive", size: 10, overlap: 10 }], retrievers: [{ type: "bm25" }] })
        .success,
    ).toBe(false);
    expect(GridSchema.safeParse({ chunkers: [{ type: "magic" }], retrievers: [{ type: "bm25" }] }).success).toBe(false);
  });
});

describe("runExperiment", () => {
  const grid = {
    chunkers: [{ type: "none" as const }, { type: "sentence" as const, maxChars: 60 }],
    retrievers: [{ type: "bm25" as const }, { type: "vector" as const }, { type: "hybrid" as const }],
    cutoffs: [1, 3],
    bootstrap: { samples: 200, seed: 1 },
  };

  it("scores every configuration on every query", async () => {
    const progress: number[] = [];
    const result = await runExperiment(dataset, grid, { onProgress: (done) => progress.push(done) });
    expect(result.configs).toHaveLength(6);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.primaryMetric).toBe("ndcg@3");
    expect(result.queryIds).toEqual(["q1", "q2", "q3", "q4"]);
    for (const config of result.configs) {
      expect(config.perQuery).toHaveLength(4);
      for (const key of result.metricKeys) {
        const value = config.metrics[key]!;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        const [lo, hi] = config.ci[key]!;
        expect(lo).toBeLessThanOrEqual(value + 1e-9);
        expect(hi).toBeGreaterThanOrEqual(value - 1e-9);
      }
    }
  });

  it("finds the keyword queries with BM25 and explains the vocabulary-mismatch failure", async () => {
    const result = await runExperiment(dataset, {
      ...grid,
      chunkers: [{ type: "none" }],
      retrievers: [{ type: "bm25" }],
    });
    const [config] = result.configs;
    const byId = new Map(config!.perQuery.map((q) => [q.queryId, q]));
    expect(byId.get("q1")!.diagnosis).toEqual({ kind: "ok", firstRelevantRank: 1 });
    expect(byId.get("q3")!.metrics["ndcg@3"]).toBe(1);
    // "too many requests" shares "request" with the rate-limit doc after stemming: retrieved, not a mismatch.
    expect(byId.get("q4")!.relevant[0]).toMatchObject({ docId: "limits", grade: 2 });
  });

  it("labels queries whose terms never occur in the relevant documents", async () => {
    const result = await runExperiment(
      { ...dataset, queries: [{ id: "q1", text: "credential renewal" }, ...dataset.queries.slice(1)] },
      { ...grid, chunkers: [{ type: "none" }], retrievers: [{ type: "bm25" }] },
    );
    expect(result.configs[0]!.perQuery[0]!.diagnosis.kind).toBe("vocabulary-mismatch");
  });

  it("is deterministic apart from timings", async () => {
    const strip = (r: Awaited<ReturnType<typeof runExperiment>>) =>
      JSON.stringify(r.configs.map(({ timings: _t, ...rest }) => rest));
    expect(strip(await runExperiment(dataset, grid))).toBe(strip(await runExperiment(dataset, grid)));
  });

  it("can be aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runExperiment(dataset, grid, { signal: controller.signal })).rejects.toThrow(/aborted/);
  });

  it("compares two configurations with a paired bootstrap", async () => {
    const result = await runExperiment(dataset, grid);
    const [best] = rankConfigs(result);
    const same = compareConfigs(best!, best!, result.primaryMetric);
    expect(same).toMatchObject({ delta: 0, significant: false, n: 4 });
  });

  it("breaks a metric down by query tag", async () => {
    const result = await runExperiment(dataset, {
      ...grid,
      chunkers: [{ type: "none" }],
      retrievers: [{ type: "bm25" }],
    });
    const rows = metricsByTag(result.configs[0]!, dataset.queries, "hit@3");
    expect(rows.map((r) => [r.tag, r.count])).toEqual([
      ["keyword", 3],
      ["paraphrase", 1],
      ["pt", 1],
    ]);
    expect(rows[0]!.mean).toBe(1);
  });

  it("gives duplicate labels distinct ids", async () => {
    const result = await runExperiment(dataset, {
      ...grid,
      chunkers: [{ type: "none" }],
      retrievers: [{ type: "bm25" }, { type: "bm25" }],
    });
    expect(result.configs.map((c) => c.id)).toEqual(["whole-doc · bm25(1.2,0.75)", "whole-doc · bm25(1.2,0.75) #2"]);
  });
});

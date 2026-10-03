import { describe, expect, it } from "vitest";
import {
  csvCell,
  escapeHtml,
  runExperiment,
  summaryMetricKeys,
  toCsv,
  toHtml,
  toJson,
  toMarkdown,
  type Dataset,
} from "@/src/core";

const dataset: Dataset = {
  name: "export <test>",
  documents: [
    { id: "a", text: "alpha beta gamma" },
    { id: "b", text: "delta epsilon" },
  ],
  queries: [
    { id: "q1", text: "alpha" },
    { id: "q2", text: "<script>alert(1)</script> epsilon" },
  ],
  judgments: [
    { queryId: "q1", docId: "a", grade: 3 },
    { queryId: "q2", docId: "a", grade: 1 },
  ],
};

const result = await runExperiment(dataset, {
  chunkers: [{ type: "none" }],
  retrievers: [{ type: "bm25" }, { type: "vector" }],
  cutoffs: [1, 2],
  bootstrap: { samples: 100, seed: 1 },
});

describe("exporters", () => {
  it("JSON round-trips", () => {
    const parsed = JSON.parse(toJson(result));
    expect(parsed.configs).toHaveLength(2);
    expect(parsed.primaryMetric).toBe("ndcg@2");
  });

  it("CSV has a header, one row per config and CI columns", () => {
    const lines = toCsv(result).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]!.split(",").slice(0, 5)).toEqual(["config", "chunks", "ndcg@1", "ndcg@1_ci_low", "ndcg@1_ci_high"]);
    // The label contains a comma, so it must be quoted; count fields outside quotes.
    expect(lines[1]!.startsWith('"whole-doc · bm25(1.2,0.75)",')).toBe(true);
    const fields = lines[1]!.replace(/"(?:[^"]|"")*"/g, "Q").split(",");
    expect(fields).toHaveLength(lines[0]!.split(",").length);
  });

  it("CSV quotes cells per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(3)).toBe("3");
  });

  it("Markdown is a table sorted by the primary metric", () => {
    const md = toMarkdown(result).trimEnd().split("\n");
    expect(md[0]).toContain("**ndcg@2** (95% CI)");
    expect(md[1]).toMatch(/^\| --- \| --- \| ---: /);
    expect(md).toHaveLength(4);
    expect(summaryMetricKeys(result)).toEqual(["ndcg@1", "ndcg@2", "recall@1", "recall@2", "mrr@2", "map@2"]);
  });

  it("HTML is self-contained and escapes user content", () => {
    const html = toHtml(result, { queryText: new Map(dataset.queries.map((q) => [q.id, q.text])) });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="http/);
    expect(html).toContain("export &lt;test&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<svg");
  });

  it("escapes all HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

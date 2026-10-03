import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildDatasetFromSource,
  documentsFromJsonl,
  loadCorpus,
  loadDataset,
  parseFrontmatter,
} from "@/src/cli/corpus";
import { NIMBUS_DESCRIPTION } from "@/scripts/dataset-meta";

const dir = mkdtempSync(join(tmpdir(), "rlab-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("parseFrontmatter", () => {
  it("reads scalar and list values and strips the block", () => {
    const { data, body } = parseFrontmatter("---\nid: a-b\ntitle: Hello world\ntags: [x, y]\n---\n\n# Body\ntext");
    expect(data).toEqual({ id: "a-b", title: "Hello world", tags: ["x", "y"] });
    expect(body).toBe("# Body\ntext");
  });

  it("handles CRLF and a BOM", () => {
    const { data, body } = parseFrontmatter("﻿---\r\nid: z\r\n---\r\nbody");
    expect(data.id).toBe("z");
    expect(body).toBe("body");
  });

  it("returns the text unchanged without frontmatter", () => {
    expect(parseFrontmatter("plain text")).toEqual({ data: {}, body: "plain text" });
  });
});

describe("loadCorpus", () => {
  it("loads a directory of markdown and text files, deriving ids and titles", () => {
    const corpus = join(dir, "corpus");
    mkdirSync(corpus);
    writeFileSync(join(corpus, "b.md"), "# Second doc\nBody.");
    writeFileSync(join(corpus, "a.txt"), "First doc text.");
    writeFileSync(join(corpus, "skip.png"), "binary");
    const docs = loadCorpus(corpus);
    expect(docs.map((d) => [d.id, d.title])).toEqual([
      ["a", "a"],
      ["b", "Second doc"],
    ]);
  });

  it("loads JSONL and reports the failing line", () => {
    expect(documentsFromJsonl('{"id":"x","text":"hello"}\n\n{"text":"world","lang":"en"}')).toEqual([
      { id: "x", title: undefined, text: "hello", lang: undefined },
      { id: "line-3", title: undefined, text: "world", lang: "en" },
    ]);
    expect(() => documentsFromJsonl('{"text": "ok"}\nnot json', "c.jsonl")).toThrow("c.jsonl:2: invalid JSON");
    expect(() => documentsFromJsonl('{"id": "x"}')).toThrow(/missing "text"/);
  });

  it("fails clearly for missing paths and empty directories", () => {
    expect(() => loadCorpus(join(dir, "nope"))).toThrow(/Corpus not found/);
    const empty = join(dir, "empty");
    mkdirSync(empty);
    expect(() => loadCorpus(empty)).toThrow(/No .md or .txt files/);
  });

  it("validates datasets with readable errors", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ name: "x", documents: [], queries: [], judgments: [] }));
    expect(() => loadDataset(bad)).toThrow(/Invalid dataset/);
    const notJson = join(dir, "broken.json");
    writeFileSync(notJson, "{");
    expect(() => loadDataset(notJson)).toThrow(/not valid JSON/);
  });
});

describe("bundled dataset", () => {
  const root = join(import.meta.dirname, "..", "..");
  const compiled = loadDataset(join(root, "datasets", "nimbus.json"));

  it("datasets/nimbus.json is up to date with its sources (run npm run dataset:build)", () => {
    const fresh = buildDatasetFromSource(join(root, "datasets", "nimbus"), "nimbus", NIMBUS_DESCRIPTION);
    expect(compiled).toEqual(fresh);
  });

  it("has 40 bilingual documents and 60 judged queries", () => {
    expect(compiled.documents).toHaveLength(40);
    expect(compiled.queries).toHaveLength(60);
    expect(new Set(compiled.documents.map((d) => d.lang))).toEqual(new Set(["pt", "en"]));
  });

  it("every document id matches its file name", () => {
    for (const doc of compiled.documents) {
      expect(readFileSync(join(root, "datasets", "nimbus", "docs", `${doc.id}.md`), "utf8")).toContain(`id: ${doc.id}`);
    }
  });
});

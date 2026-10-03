import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { DatasetSchema, parseDataset, type Dataset, type DatasetDocument } from "../core/eval/dataset";

export interface Frontmatter {
  data: Record<string, string | string[]>;
  body: string;
}

/**
 * Minimal frontmatter reader for `---`-delimited blocks of `key: value` lines, where a value may be
 * a `[a, b]` list. Deliberately not a YAML parser: no nesting, no multi-line values.
 */
export function parseFrontmatter(source: string): Frontmatter {
  const text = source.replace(/^﻿/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const value = kv[2]!.trim();
    const list = /^\[(.*)\]$/.exec(value);
    data[kv[1]!] = list
      ? list[1]!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : value;
  }
  return { data, body: text.slice(match[0].length).replace(/^\s*\n/, "") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v : undefined);

/** A markdown or text file as a document: frontmatter `id`/`title`/`lang`/`tags` when present. */
export function documentFromFile(path: string): DatasetDocument {
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  const id = str(data.id) ?? basename(path, extname(path));
  const firstHeading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return {
    id,
    title: str(data.title) ?? firstHeading ?? id,
    text: body,
    lang: str(data.lang),
    tags: Array.isArray(data.tags) ? data.tags : undefined,
  };
}

/** One JSON object per line: `{ "id"?, "title"?, "text", "lang"? }`. */
export function documentsFromJsonl(source: string, name = "corpus.jsonl"): DatasetDocument[] {
  const docs: DatasetDocument[] = [];
  source.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${name}:${i + 1}: invalid JSON`);
    }
    const row = value as Partial<Record<"id" | "title" | "text" | "lang", unknown>>;
    if (typeof row.text !== "string" || !row.text.trim()) throw new Error(`${name}:${i + 1}: missing "text"`);
    docs.push({
      id: typeof row.id === "string" && row.id ? row.id : `line-${i + 1}`,
      title: typeof row.title === "string" ? row.title : undefined,
      text: row.text,
      lang: typeof row.lang === "string" ? row.lang : undefined,
    });
  });
  return docs;
}

/**
 * Loads documents from a directory of .md/.txt files, a single .md/.txt/.jsonl file, or a dataset
 * .json (whose documents are used).
 */
export function loadCorpus(path: string): DatasetDocument[] {
  if (!existsSync(path)) throw new Error(`Corpus not found: ${path}`);
  if (statSync(path).isDirectory()) {
    const files = readdirSync(path, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(md|markdown|txt)$/i.test(f))
      .sort();
    if (files.length === 0) throw new Error(`No .md or .txt files in ${path}`);
    return files.map((f) => documentFromFile(join(path, f)));
  }
  const ext = extname(path).toLowerCase();
  if (ext === ".jsonl") return documentsFromJsonl(readFileSync(path, "utf8"), basename(path));
  if (ext === ".json") return loadDataset(path).documents;
  return [documentFromFile(path)];
}

export function loadDataset(path: string): Dataset {
  if (!existsSync(path)) throw new Error(`Dataset not found: ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
  const parsed = parseDataset(raw);
  if (!parsed.ok) throw new Error(`Invalid dataset ${path}:\n  ${parsed.errors.join("\n  ")}`);
  return parsed.dataset;
}

interface SourceQuery {
  id: string;
  text: string;
  lang?: string;
  tags?: string[];
  relevant: Record<string, number>;
}

/** Compiles `<dir>/docs/*.md` + `<dir>/queries.json` (authoring format) into a validated dataset. */
export function buildDatasetFromSource(dir: string, name: string, description?: string): Dataset {
  const docsDir = join(dir, "docs");
  const documents = readdirSync(docsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => documentFromFile(join(docsDir, f)));
  const queries = JSON.parse(readFileSync(join(dir, "queries.json"), "utf8")) as SourceQuery[];
  return DatasetSchema.parse({
    name,
    description,
    documents,
    queries: queries.map(({ relevant: _relevant, ...q }) => q),
    judgments: queries.flatMap((q) =>
      Object.entries(q.relevant).map(([docId, grade]) => ({ queryId: q.id, docId, grade })),
    ),
  });
}

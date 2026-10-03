import type { DatasetDocument } from "./eval/dataset";

/**
 * Portable parsers for the corpus formats the CLI and the browser accept: markdown/text files with
 * optional frontmatter, JSONL, and pasted text. No file system access here; callers read the bytes.
 */

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

/** "docs/Rate Limits.md" -> "rate-limits". */
export function idFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const stem = base.replace(/\.[^.]+$/, "");
  const slug = stem
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "document";
}

/** A markdown or text file as a document: frontmatter `id`/`title`/`lang`/`tags` when present. */
export function documentFromText(source: string, fileName: string): DatasetDocument {
  const { data, body } = parseFrontmatter(source);
  const id = str(data.id) ?? idFromFileName(fileName);
  const firstHeading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return {
    id,
    title: str(data.title) ?? firstHeading ?? id,
    text: body,
    lang: str(data.lang),
    tags: Array.isArray(data.tags) ? data.tags : undefined,
  };
}

/** One JSON object per line: `{ "id"?, "title"?, "text", "lang"? }`. Errors name the line. */
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

/** Pasted text: documents separated by a line containing only `---`. */
export function documentsFromPastedText(source: string, prefix = "pasted"): DatasetDocument[] {
  return source
    .split(/^\s*---\s*$/m)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, i) => {
      const firstLine = text
        .split("\n")[0]!
        .replace(/^#+\s*/, "")
        .trim();
      return { id: `${prefix}-${i + 1}`, title: firstLine.slice(0, 80) || `${prefix}-${i + 1}`, text };
    });
}

/** Makes ids unique by suffixing repeats ("a", "a-2", "a-3"), keeping document order. */
export function dedupeIds(docs: readonly DatasetDocument[]): DatasetDocument[] {
  const seen = new Map<string, number>();
  return docs.map((doc) => {
    const n = (seen.get(doc.id) ?? 0) + 1;
    seen.set(doc.id, n);
    return n === 1 ? doc : { ...doc, id: `${doc.id}-${n}` };
  });
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { documentFromText, documentsFromJsonl } from "../core/corpus-format";
import { DatasetSchema, parseDataset, type Dataset, type DatasetDocument } from "../core/eval/dataset";

/** A markdown or text file on disk as a document (see documentFromText). */
export function documentFromFile(path: string): DatasetDocument {
  return documentFromText(readFileSync(path, "utf8"), basename(path));
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

export { documentsFromJsonl, parseFrontmatter } from "../core/corpus-format";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ChunkerConfigSchema,
  compareConfigs,
  createChunker,
  describePipeline,
  GridSchema,
  PipelineConfigSchema,
  rankConfigs,
  RetrievalPipeline,
  runExperiment,
  summaryMetricKeys,
  toCsv,
  toHtml,
  toJson,
  toMarkdown,
  type ChunkerConfig,
  type ChunkerType,
  type EmbedderConfig,
  type PipelineConfig,
} from "../core";
import { documentFromFile, loadCorpus, loadDataset } from "./corpus";
import { oneLine, PLAIN, renderTable, truncate, type Style } from "./table";

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  style: Style;
  cwd: string;
}

export class UsageError extends Error {}

const DEFAULT_CORPUS = "datasets/nimbus.json";
const DEFAULT_GRID = "datasets/grid.default.json";

const HELP = `retrieval-lab: compare chunking and retrieval strategies, offline.

Usage:
  npm run rlab -- <command> [options]

Commands:
  search "<query>"   Search a corpus and show ranked chunks with their score breakdown
  eval               Run an experiment grid on a dataset and write reports
  chunk <file>       Show how a chunker cuts a file
  help               Show this help

search options:
  --corpus <path>        Directory of .md/.txt, a .md/.txt/.jsonl file or a dataset .json
                         (default: ${DEFAULT_CORPUS})
  --retriever <name>     bm25 | vector | hybrid (default: hybrid)
  --fusion <name>        rrf | weighted, for hybrid (default: rrf)
  --rrf-k <n>            RRF constant (default: 60)
  --alpha <x>            BM25 weight for weighted fusion, 0..1 (default: 0.5)
  --k1 <x> --b <x>       BM25 parameters (default: 1.2, 0.75)
  --rerank <name>        none | mmr | lexical (default: none)
  --k <n>                Results to show (default: 5)
  --context-headers      Index each chunk with its document title and heading path
  --embedder <name>      hashing | openai (default: hashing, fully offline)
  --embed-url <url>      OpenAI-compatible base URL, e.g. http://localhost:11434/v1
  --embed-model <name>   Embedding model name. The API key, if any, is read from
                         RLAB_EMBEDDINGS_API_KEY or OPENAI_API_KEY; it is never stored.
  --json                 Print the raw result as JSON

chunker options (search and chunk):
  --chunker <name>       none | fixed-chars | fixed-tokens | sentence | paragraph |
                         markdown | recursive (default: recursive)
  --size <n>             Chunk size (chars, or tokens for fixed-tokens)
  --overlap <n>          Overlap (chars, tokens, or sentences for sentence)

eval options:
  --dataset <path>       Dataset JSON (default: ${DEFAULT_CORPUS})
  --grid <path>          Grid JSON (default: ${DEFAULT_GRID})
  --out <dir>            Write reports to this directory
  --format <list>        Comma-separated: md,json,csv,html (default: md,json,csv,html)
  --metric <key>         Metric for ranking and comparisons (default: nDCG at the largest cutoff)

chunk options:
  --preview              Print every chunk, not only statistics

Exit codes: 0 success, 1 runtime error, 2 invalid usage.`;

const options = {
  corpus: { type: "string" },
  retriever: { type: "string" },
  fusion: { type: "string" },
  "rrf-k": { type: "string" },
  alpha: { type: "string" },
  k1: { type: "string" },
  b: { type: "string" },
  rerank: { type: "string" },
  k: { type: "string" },
  "context-headers": { type: "boolean" },
  embedder: { type: "string" },
  "embed-url": { type: "string" },
  "embed-model": { type: "string" },
  json: { type: "boolean" },
  chunker: { type: "string" },
  size: { type: "string" },
  overlap: { type: "string" },
  dataset: { type: "string" },
  grid: { type: "string" },
  out: { type: "string" },
  format: { type: "string" },
  metric: { type: "string" },
  preview: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>["values"];

function num(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new UsageError(`--${name} must be a number, got "${value}"`);
  return n;
}

function oneOf<T extends string>(value: string | undefined, name: string, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`--${name} must be one of ${allowed.join(", ")}; got "${value}"`);
  }
  return value as T;
}

const CHUNKERS: readonly ChunkerType[] = [
  "none",
  "fixed-chars",
  "fixed-tokens",
  "sentence",
  "paragraph",
  "markdown",
  "recursive",
];

export function chunkerFromFlags(values: Values): ChunkerConfig {
  const type = oneOf(values.chunker, "chunker", CHUNKERS, "recursive");
  const size = (fallback: number) => num(values.size, "size", fallback);
  const overlap = (fallback: number) => num(values.overlap, "overlap", fallback);
  const raw = {
    none: { type },
    "fixed-chars": { type, size: size(500), overlap: overlap(100) },
    "fixed-tokens": { type, size: size(100), overlap: overlap(20) },
    sentence: { type, maxChars: size(500), overlapSentences: overlap(0) },
    paragraph: { type, maxChars: size(0) },
    markdown: { type, maxChars: size(800) },
    recursive: { type, size: size(500), overlap: overlap(100) },
  }[type];
  const parsed = ChunkerConfigSchema.safeParse(raw);
  if (!parsed.success)
    throw new UsageError(`Invalid chunker settings: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  return parsed.data;
}

function embedderFromFlags(values: Values): EmbedderConfig {
  const type = oneOf(values.embedder, "embedder", ["hashing", "openai"] as const, "hashing");
  if (type === "hashing") return { type, dims: 1024, bigramWeight: 0.5, charWeight: 0.35 };
  if (!values["embed-url"] || !values["embed-model"]) {
    throw new UsageError("--embedder openai needs --embed-url and --embed-model");
  }
  return { type, baseUrl: values["embed-url"], model: values["embed-model"], batchSize: 64 };
}

export function pipelineFromFlags(values: Values): PipelineConfig {
  const retriever = oneOf(values.retriever, "retriever", ["bm25", "vector", "hybrid"] as const, "hybrid");
  const bm25 = { k1: num(values.k1, "k1", 1.2), b: num(values.b, "b", 0.75) };
  const embedder = embedderFromFlags(values);
  const fusionType = oneOf(values.fusion, "fusion", ["rrf", "weighted"] as const, "rrf");
  const fusion =
    fusionType === "rrf"
      ? { type: "rrf" as const, k: num(values["rrf-k"], "rrf-k", 60) }
      : { type: "weighted" as const, alpha: num(values.alpha, "alpha", 0.5) };
  const parsed = PipelineConfigSchema.safeParse({
    chunker: chunkerFromFlags(values),
    retriever:
      retriever === "bm25"
        ? { type: "bm25", bm25 }
        : retriever === "vector"
          ? { type: "vector", embedder }
          : { type: "hybrid", bm25, embedder, fusion },
    reranker: { type: oneOf(values.rerank, "rerank", ["none", "mmr", "lexical"] as const, "none") },
    contextHeaders: Boolean(values["context-headers"]),
  });
  if (!parsed.success) {
    throw new UsageError(
      `Invalid settings: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

const f3 = (n: number | undefined) => (n === undefined ? "" : n.toFixed(3));
const rankCell = (rank: number | null | undefined) => (rank === null || rank === undefined ? "–" : String(rank));

async function commandSearch(positionals: string[], values: Values, io: Io): Promise<number> {
  const query = positionals.join(" ").trim();
  if (!query) throw new UsageError('search needs a query, e.g. search "rotate api key"');
  const k = num(values.k, "k", 5);
  if (!Number.isInteger(k) || k < 1) throw new UsageError("--k must be a positive integer");
  const config = pipelineFromFlags(values);
  const docs = loadCorpus(resolve(io.cwd, values.corpus ?? DEFAULT_CORPUS));
  const pipeline = await RetrievalPipeline.build(docs, config);
  const result = await pipeline.search(query, { k });
  if (values.json) {
    io.out(JSON.stringify({ config, ...result }, null, 2));
    return 0;
  }
  const { style } = io;
  io.out(`${style.dim("config")}  ${describePipeline(config)}`);
  io.out(`${style.dim("corpus")}  ${docs.length} documents, ${pipeline.chunks.length} chunks`);
  io.out(`${style.dim("terms ")}  ${result.queryTerms.join(" ") || "(none)"}\n`);
  if (result.hits.length === 0) {
    io.out("No results. Try other words, or --retriever vector for fuzzy matching.");
    return 0;
  }
  const titles = new Map(docs.map((d) => [d.id, d.title ?? d.id]));
  const rows = result.hits.map((hit) => {
    const s = hit.signals;
    const section = hit.chunk.headingPath?.slice(-1)[0];
    return [
      String(hit.rank),
      f3(hit.score),
      s.bm25 ? `${f3(s.bm25.score)} #${rankCell(s.bm25.rank)}` : "",
      s.vector ? `${f3(s.vector.score)} #${rankCell(s.vector.rank)}` : "",
      s.rerank ? `#${s.rerank.before}→#${s.rerank.rank}` : "",
      truncate(`${titles.get(hit.chunk.docId)}${section ? ` › ${section}` : ""}`, 34),
      truncate(oneLine(hit.chunk.text), 56),
    ];
  });
  io.out(
    renderTable(
      [
        { header: "#", align: "right" },
        { header: "score", align: "right" },
        { header: "bm25", align: "right" },
        { header: "vector", align: "right" },
        { header: "rerank" },
        { header: "document" },
        { header: "chunk" },
      ],
      rows,
      style,
    ),
  );
  io.out(
    `\n${style.dim("documents (aggregated by " + config.aggregation + "):")} ${result.docs.map((d) => d.docId).join(", ")}`,
  );
  return 0;
}

async function commandEval(values: Values, io: Io): Promise<number> {
  const dataset = loadDataset(resolve(io.cwd, values.dataset ?? DEFAULT_CORPUS));
  const gridPath = resolve(io.cwd, values.grid ?? DEFAULT_GRID);
  let rawGrid: unknown;
  try {
    rawGrid = JSON.parse(readFileSync(gridPath, "utf8"));
  } catch {
    throw new Error(`Cannot read grid ${gridPath} (missing or invalid JSON)`);
  }
  const grid = GridSchema.safeParse(rawGrid);
  if (!grid.success) {
    throw new Error(
      `Invalid grid ${gridPath}:\n  ${grid.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ")}`,
    );
  }
  const formats = (values.format ?? "md,json,csv,html").split(",").map((s) => s.trim().toLowerCase());
  for (const format of formats) {
    if (!["md", "json", "csv", "html"].includes(format)) throw new UsageError(`Unknown format "${format}"`);
  }

  const { style } = io;
  io.err(style.dim(`Running ${dataset.queries.length} queries on ${dataset.documents.length} documents...`));
  const started = performance.now();
  const result = await runExperiment(dataset, grid.data, {
    onProgress: (done, total, label) => io.err(style.dim(`  [${done}/${total}] ${label}`)),
  });
  const metric = values.metric ?? result.primaryMetric;
  if (!result.metricKeys.includes(metric)) {
    throw new UsageError(`Unknown metric "${metric}". Available: ${result.metricKeys.join(", ")}`);
  }
  io.err(
    style.dim(
      `Done: ${result.configs.length} configurations in ${((performance.now() - started) / 1000).toFixed(1)}s\n`,
    ),
  );

  const keys = summaryMetricKeys(result);
  const ranked = rankConfigs(result, metric);
  io.out(
    renderTable(
      [
        { header: "#", align: "right" },
        { header: "configuration" },
        { header: "chunks", align: "right" },
        ...keys.map((k) => ({ header: k, align: "right" as const })),
        { header: `${metric} 95% CI`, align: "right" },
      ],
      ranked.map((c, i) => [
        String(i + 1),
        i === 0 ? style.accent(c.label) : c.label,
        String(c.chunkCount),
        ...keys.map((k) => f3(c.metrics[k])),
        `${f3(c.ci[metric]?.[0])}–${f3(c.ci[metric]?.[1])}`,
      ]),
      style,
    ),
  );

  const best = ranked[0];
  const comparisons = [
    ["runner-up", ranked[1]],
    ["first config in grid", result.configs[0]],
  ] as const;
  if (best) {
    io.out(`\n${style.bold(`Is the best configuration really better? (paired bootstrap on ${metric})`)}`);
    for (const [name, other] of comparisons) {
      if (!other || other === best) continue;
      const cmp = compareConfigs(other, best, metric, { samples: 10_000, seed: result.grid.bootstrap.seed });
      const verdict = cmp.significant
        ? style.good("distinguishable from noise")
        : style.bad("not distinguishable from noise");
      io.out(
        `  vs ${name} (${other.label}): Δ ${cmp.delta >= 0 ? "+" : ""}${cmp.delta.toFixed(3)}, 95% CI [${cmp.ci[0].toFixed(3)}, ${cmp.ci[1].toFixed(3)}], p≈${cmp.pValue.toFixed(3)}, ${cmp.wins}W/${cmp.losses}L/${cmp.ties}T: ${verdict}`,
      );
    }
  }

  if (values.out) {
    const outDir = resolve(io.cwd, values.out);
    mkdirSync(outDir, { recursive: true });
    const queryText = new Map(dataset.queries.map((q) => [q.id, q.text]));
    const writers: Record<string, () => string> = {
      md: () => toMarkdown(result),
      json: () => toJson(result),
      csv: () => toCsv(result),
      html: () => toHtml(result, { queryText }),
    };
    for (const format of formats) {
      const file = resolve(outDir, `report.${format}`);
      writeFileSync(file, writers[format]!());
      io.err(style.dim(`wrote ${file}`));
    }
  }
  return 0;
}

function commandChunk(positionals: string[], values: Values, io: Io): number {
  const [file] = positionals;
  if (!file) throw new UsageError("chunk needs a file, e.g. chunk datasets/nimbus/docs/deployments-guide.md");
  const config = chunkerFromFlags(values);
  const doc = documentFromFile(resolve(io.cwd, file));
  const chunks = createChunker(config)(doc);
  const lengths = chunks.map((c) => c.text.length);
  const { style } = io;
  io.out(`${style.dim("chunker")}  ${JSON.stringify(config)}`);
  io.out(
    `${style.dim("chunks ")}  ${chunks.length} from ${doc.text.length} chars · min ${lengths.length ? Math.min(...lengths) : 0} · mean ${
      lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0
    } · max ${Math.max(...lengths, 0)}`,
  );
  if (!values.preview) {
    io.out(style.dim("\n(add --preview to print every chunk)"));
    return 0;
  }
  for (const chunk of chunks) {
    const path = chunk.headingPath ? ` ${style.accent(chunk.headingPath.join(" › "))}` : "";
    io.out(
      `\n${style.bold(`#${chunk.index}`)} ${style.dim(`[${chunk.start}, ${chunk.end}) ${chunk.text.length} chars`)}${path}`,
    );
    io.out(chunk.text);
  }
  return 0;
}

/** Runs the CLI and returns the process exit code. */
export async function run(
  argv: readonly string[],
  io: Io = { out: console.log, err: console.error, style: PLAIN, cwd: process.cwd() },
): Promise<number> {
  let parsed: { values: Values; positionals: string[] };
  try {
    parsed = parseArgs({ args: [...argv], options, allowPositionals: true, strict: true });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\nRun with --help for usage.`);
    return 2;
  }
  const [command, ...rest] = parsed.positionals;
  if (!command || command === "help" || parsed.values.help) {
    io.out(HELP);
    return command || parsed.values.help ? 0 : 2;
  }
  try {
    switch (command) {
      case "search":
        return await commandSearch(rest, parsed.values, io);
      case "eval":
        return await commandEval(parsed.values, io);
      case "chunk":
        return commandChunk(rest, parsed.values, io);
      default:
        throw new UsageError(`Unknown command "${command}"`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\nRun with --help for usage.`);
      return 2;
    }
    io.err(io.style.bad(`Error: ${error instanceof Error ? error.message : String(error)}`));
    return 1;
  }
}

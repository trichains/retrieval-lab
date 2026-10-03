/**
 * Indexing and query latency on a synthetic corpus. Numbers depend on hardware, Node version and
 * load; run it on your machine instead of trusting anyone's table, including the README's.
 *
 *   npm run bench                 # 1,000 and 5,000 documents
 *   npm run bench -- 20000        # custom sizes
 */
import { cpus, platform, release, totalmem } from "node:os";
import {
  Bm25Index,
  chunkCorpus,
  HashingEmbedder,
  mulberry32,
  parsePipelineConfig,
  quantile,
  RetrievalPipeline,
  VectorIndex,
  type SourceDocument,
} from "../src/core";
import { PLAIN, renderTable } from "../src/cli/table";

const SYLLABLES = [
  "ka",
  "lo",
  "mi",
  "ne",
  "ru",
  "ta",
  "vo",
  "zen",
  "pra",
  "dex",
  "qui",
  "mon",
  "sol",
  "ber",
  "tin",
  "gar",
];

/** A seeded vocabulary with Zipf-like word frequencies, so posting lists look like real text. */
function makeCorpus(docCount: number, seed = 1): { docs: SourceDocument[]; queries: string[] } {
  const rand = mulberry32(seed);
  const vocab = Array.from({ length: 20_000 }, () => {
    const n = 2 + Math.floor(rand() * 3);
    return Array.from({ length: n }, () => SYLLABLES[Math.floor(rand() * SYLLABLES.length)]).join("");
  });
  const zipf = () => vocab[Math.min(vocab.length - 1, Math.floor(Math.exp(rand() * Math.log(vocab.length))) - 1)]!;
  const sentence = () => {
    const words = Array.from({ length: 6 + Math.floor(rand() * 14) }, zipf);
    return `${words.join(" ")}.`;
  };
  const docs = Array.from({ length: docCount }, (_, i) => {
    const paragraphs = Array.from({ length: 2 + Math.floor(rand() * 4) }, () =>
      Array.from({ length: 2 + Math.floor(rand() * 4) }, sentence).join(" "),
    );
    return { id: `doc-${i}`, text: `# Section ${i}\n\n${paragraphs.join("\n\n")}`, lang: "en" };
  });
  const queries = Array.from({ length: 200 }, () => Array.from({ length: 2 + Math.floor(rand() * 4) }, zipf).join(" "));
  return { docs, queries };
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const value = fn();
  return [value, performance.now() - start];
}

async function latencies(queries: string[], fn: (q: string) => unknown | Promise<unknown>): Promise<number[]> {
  for (const q of queries.slice(0, 20)) await fn(q); // warm-up
  const out: number[] = [];
  for (const q of queries) {
    const start = performance.now();
    await fn(q);
    out.push(performance.now() - start);
  }
  return out.sort((a, b) => a - b);
}

const ms = (n: number) => (n < 10 ? n.toFixed(2) : n.toFixed(0));

const sizes = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n > 0);
const rows: string[][] = [];
for (const size of sizes.length ? sizes : [1000, 5000]) {
  const { docs, queries } = makeCorpus(size);
  const chars = docs.reduce((s, d) => s + d.text.length, 0);
  const [chunks, chunkMs] = time(() => chunkCorpus(docs, { type: "recursive", size: 500, overlap: 100 }));
  const items = chunks.map((c) => ({ id: c.id, docId: c.docId, text: c.text, lang: "en" }));
  const [bm25, bm25Ms] = time(() => new Bm25Index(items));
  const embedStart = performance.now();
  const vector = await VectorIndex.build(items, new HashingEmbedder());
  const embedMs = performance.now() - embedStart;
  const bm25Lat = await latencies(queries, (q) => bm25.search(q, 10));
  const vecLat = await latencies(queries, (q) => vector.search(q, 10));
  const pipeline = await RetrievalPipeline.build(
    docs,
    parsePipelineConfig({ chunker: { type: "recursive", size: 500, overlap: 100 }, retriever: { type: "hybrid" } }),
  );
  const hybridLat = await latencies(queries, (q) => pipeline.search(q, { k: 10 }));
  const p = (xs: number[], q: number) => ms(quantile(xs, q));
  rows.push([
    String(size),
    String(chunks.length),
    `${(chars / 1e6).toFixed(1)}M`,
    ms(chunkMs),
    ms(bm25Ms),
    ms(embedMs),
    `${p(bm25Lat, 0.5)} / ${p(bm25Lat, 0.95)}`,
    `${p(vecLat, 0.5)} / ${p(vecLat, 0.95)}`,
    `${p(hybridLat, 0.5)} / ${p(hybridLat, 0.95)}`,
  ]);
}

console.log(
  `Hardware: ${cpus()[0]?.model ?? "unknown CPU"} (${cpus().length} threads), ${(totalmem() / 2 ** 30).toFixed(0)} GB RAM, ${platform()} ${release()}, Node ${process.version}`,
);
console.log("Chunker recursive(500/100); hashing embedder 1024 dims; 200 queries, top 10; times in ms.\n");
console.log(
  renderTable(
    [
      { header: "docs", align: "right" },
      { header: "chunks", align: "right" },
      { header: "chars", align: "right" },
      { header: "chunk", align: "right" },
      { header: "bm25 index", align: "right" },
      { header: "embed all", align: "right" },
      { header: "bm25 p50/p95", align: "right" },
      { header: "vector p50/p95", align: "right" },
      { header: "hybrid p50/p95", align: "right" },
    ],
    rows,
    PLAIN,
  ),
);

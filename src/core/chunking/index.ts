import type { ChunkerConfig } from "../config";
import { chunkFixedChars, chunkFixedTokens } from "./fixed";
import { chunkMarkdown } from "./markdown";
import { chunkParagraphs } from "./paragraph";
import { chunkRecursive } from "./recursive";
import { chunkSentences } from "./sentence";
import { spansToChunks, type Chunk, type ChunkFn, type SourceDocument } from "./types";

export * from "./types";
export { chunkFixedChars, chunkFixedTokens } from "./fixed";
export { chunkMarkdown, splitMarkdownSections, type MarkdownSection } from "./markdown";
export { chunkParagraphs, splitParagraphs } from "./paragraph";
export { addOverlap, chunkRecursive, DEFAULT_SEPARATORS, recursiveSpans } from "./recursive";
export { chunkSentences } from "./sentence";

/** The whole document as a single chunk: the document-level baseline. */
export function chunkWhole(doc: SourceDocument): Chunk[] {
  return spansToChunks(doc, [{ start: 0, end: doc.text.length }]);
}

export function createChunker(config: ChunkerConfig): ChunkFn {
  switch (config.type) {
    case "none":
      return chunkWhole;
    case "fixed-chars":
      return (doc) => chunkFixedChars(doc, config.size, config.overlap);
    case "fixed-tokens":
      return (doc) => chunkFixedTokens(doc, config.size, config.overlap);
    case "sentence":
      return (doc) => chunkSentences(doc, config.maxChars, config.overlapSentences);
    case "paragraph":
      return (doc) => chunkParagraphs(doc, config.maxChars);
    case "markdown":
      return (doc) => chunkMarkdown(doc, config.maxChars);
    case "recursive":
      return (doc) => chunkRecursive(doc, config.size, config.overlap);
  }
}

export function chunkCorpus(docs: readonly SourceDocument[], config: ChunkerConfig): Chunk[] {
  const chunk = createChunker(config);
  return docs.flatMap((doc) => chunk(doc));
}

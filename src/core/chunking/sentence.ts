import { splitSentences } from "../text/sentences";
import { spansToChunks, type Chunk, type RawSpan, type SourceDocument } from "./types";

/**
 * Packs whole sentences into chunks of at most `maxChars` characters. A single sentence longer than
 * `maxChars` becomes its own (oversized) chunk rather than being cut. `overlapSentences` repeats the
 * last N sentences of a chunk at the start of the next one.
 */
export function chunkSentences(doc: SourceDocument, maxChars: number, overlapSentences = 0): Chunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError(`maxChars must be a positive integer`);
  if (!Number.isInteger(overlapSentences) || overlapSentences < 0) {
    throw new RangeError(`overlapSentences must be a non-negative integer`);
  }
  const sentences = splitSentences(doc.text);
  const spans: RawSpan[] = [];
  let first = 0;
  while (first < sentences.length) {
    const start = sentences[first]!.start;
    let last = first;
    while (last + 1 < sentences.length && sentences[last + 1]!.end - start <= maxChars) last++;
    spans.push({ start, end: sentences[last]!.end });
    if (last === sentences.length - 1) break;
    // Step back for overlap, but always move forward by at least one sentence.
    first = Math.max(first + 1, last + 1 - overlapSentences);
  }
  return spansToChunks(doc, spans);
}

import { tokenize } from "../text/tokenize";
import { assertSizes, spansToChunks, type Chunk, type RawSpan, type SourceDocument } from "./types";

/**
 * Fixed windows of `size` characters, each starting `size - overlap` after the previous one.
 * Cuts mid-word on purpose: it is the naive baseline the other strategies are measured against.
 */
export function chunkFixedChars(doc: SourceDocument, size: number, overlap = 0): Chunk[] {
  assertSizes(size, overlap);
  const spans: RawSpan[] = [];
  const step = size - overlap;
  for (let start = 0; start < doc.text.length; start += step) {
    const end = Math.min(start + size, doc.text.length);
    spans.push({ start, end });
    if (end === doc.text.length) break;
  }
  return spansToChunks(doc, spans);
}

/**
 * Fixed windows of `size` word tokens (see `tokenize`), stepping `size - overlap` tokens. A chunk runs
 * from the first character of its first token to the last character of its last token, so it never
 * cuts a word and punctuation between tokens is kept.
 */
export function chunkFixedTokens(doc: SourceDocument, size: number, overlap = 0): Chunk[] {
  assertSizes(size, overlap);
  const tokens = tokenize(doc.text);
  const spans: RawSpan[] = [];
  const step = size - overlap;
  for (let i = 0; i < tokens.length; i += step) {
    const first = tokens[i];
    const last = tokens[Math.min(i + size, tokens.length) - 1];
    if (!first || !last) break;
    spans.push({ start: first.start, end: last.end });
    if (i + size >= tokens.length) break;
  }
  return spansToChunks(doc, spans);
}

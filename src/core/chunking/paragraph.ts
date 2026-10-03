import { spansToChunks, type Chunk, type RawSpan, type SourceDocument } from "./types";
import type { Span } from "../text/sentences";

/** Paragraph spans: text separated by one or more blank lines. */
export function splitParagraphs(text: string): Span[] {
  const spans: Span[] = [];
  const blank = /\n[ \t]*\n\s*/g;
  let start = 0;
  for (const match of text.matchAll(blank)) {
    spans.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  spans.push({ start, end: text.length });
  return spans.filter((s) => text.slice(s.start, s.end).trim().length > 0);
}

/**
 * One chunk per paragraph. With `maxChars > 0`, consecutive short paragraphs are merged while the
 * merged chunk stays within `maxChars`; a paragraph longer than `maxChars` is kept whole.
 */
export function chunkParagraphs(doc: SourceDocument, maxChars = 0): Chunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 0) throw new RangeError(`maxChars must be a non-negative integer`);
  const paragraphs = splitParagraphs(doc.text);
  if (maxChars === 0) return spansToChunks(doc, paragraphs);
  const spans: RawSpan[] = [];
  let current: RawSpan | null = null;
  for (const p of paragraphs) {
    if (current && p.end - current.start <= maxChars) {
      current.end = p.end;
    } else {
      if (current) spans.push(current);
      current = { start: p.start, end: p.end };
    }
  }
  if (current) spans.push(current);
  return spansToChunks(doc, spans);
}

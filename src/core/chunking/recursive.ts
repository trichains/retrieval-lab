import { assertSizes, spansToChunks, type Chunk, type RawSpan, type SourceDocument } from "./types";
import type { Span } from "../text/sentences";

/** From coarse to fine. The empty string means "cut at any character" and always succeeds. */
export const DEFAULT_SEPARATORS: readonly string[] = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""];

function hardSplit(start: number, end: number, size: number): Span[] {
  const out: Span[] = [];
  for (let s = start; s < end; s += size) out.push({ start: s, end: Math.min(s + size, end) });
  return out;
}

/** Cuts [start, end) right after every occurrence of `sep`; the separator stays with the left piece. */
function cutAfter(text: string, start: number, end: number, sep: string): Span[] {
  const pieces: Span[] = [];
  let pieceStart = start;
  let at = text.indexOf(sep, start);
  while (at !== -1 && at + sep.length < end) {
    pieces.push({ start: pieceStart, end: at + sep.length });
    pieceStart = at + sep.length;
    at = text.indexOf(sep, pieceStart);
  }
  pieces.push({ start: pieceStart, end });
  return pieces;
}

/**
 * Splits [start, end) into contiguous spans of at most `size` characters, preferring the coarsest
 * separator that works: paragraphs, then lines, then sentences, then words, then characters.
 * Adjacent small pieces are merged back together while they fit.
 */
export function recursiveSpans(
  text: string,
  start: number,
  end: number,
  size: number,
  separators: readonly string[] = DEFAULT_SEPARATORS,
): Span[] {
  if (end - start <= size) return end > start ? [{ start, end }] : [];
  const [sep, ...rest] = separators;
  if (sep === undefined || sep === "") return hardSplit(start, end, size);
  const pieces = cutAfter(text, start, end, sep);
  if (pieces.length === 1) return recursiveSpans(text, start, end, size, rest);

  const out: Span[] = [];
  let current: Span | null = null;
  for (const piece of pieces) {
    if (piece.end - piece.start > size) {
      if (current) out.push(current);
      const sub = recursiveSpans(text, piece.start, piece.end, size, rest);
      // Keep the last sub-span open so following small pieces can still merge into it.
      current = sub.pop() ?? null;
      out.push(...sub);
    } else if (current && piece.end - current.start <= size) {
      current.end = piece.end;
    } else {
      if (current) out.push(current);
      current = { start: piece.start, end: piece.end };
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Extends each span (except the first) backwards by up to `overlap` characters, then moves the new
 * start forward to the next word boundary so the overlap never begins mid-word.
 */
export function addOverlap(text: string, spans: readonly Span[], overlap: number): Span[] {
  if (overlap <= 0) return spans.map((s) => ({ ...s }));
  return spans.map((span, i) => {
    if (i === 0) return { ...span };
    let start = Math.max(0, span.start - overlap);
    if (start > 0 && !/\s/.test(text[start - 1] ?? " ")) {
      while (start < span.start && !/\s/.test(text[start] ?? " ")) start++;
    }
    while (start < span.start && /\s/.test(text[start] ?? "")) start++;
    return { start, end: span.end };
  });
}

/**
 * LangChain-style recursive character splitter. Chunks are at most `size` characters before overlap
 * is added, so with overlap a chunk can reach `size + overlap` characters.
 */
export function chunkRecursive(
  doc: SourceDocument,
  size: number,
  overlap = 0,
  separators: readonly string[] = DEFAULT_SEPARATORS,
): Chunk[] {
  assertSizes(size, overlap);
  const base = recursiveSpans(doc.text, 0, doc.text.length, size, separators).filter(
    (s) => doc.text.slice(s.start, s.end).trim().length > 0,
  );
  const spans = addOverlap(doc.text, base, overlap);
  return spansToChunks(doc, spans as RawSpan[]);
}

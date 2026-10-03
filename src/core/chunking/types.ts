/** A document as the chunkers and retrievers see it. */
export interface SourceDocument {
  id: string;
  text: string;
  title?: string;
  /** "pt" or "en" when known. Anything else is treated as unknown and detected from the text. */
  lang?: string;
}

/**
 * A contiguous piece of a document. Invariant (property-tested): `doc.text.slice(start, end) === text`.
 * Leading and trailing whitespace is never part of a chunk, and a chunk is never empty.
 */
export interface Chunk {
  /** Stable for a given document and chunker config: `${docId}:${start}-${end}`. */
  id: string;
  docId: string;
  /** Position of the chunk within its document, from 0. */
  index: number;
  text: string;
  start: number;
  end: number;
  /** Markdown headings that contain this chunk, outermost first (markdown chunker only). */
  headingPath?: string[];
}

export interface RawSpan {
  start: number;
  end: number;
  headingPath?: string[];
}

export type ChunkFn = (doc: SourceDocument) => Chunk[];

/** Trims whitespace off each span, drops empty ones and assigns ids and indexes. */
export function spansToChunks(doc: SourceDocument, spans: readonly RawSpan[]): Chunk[] {
  const chunks: Chunk[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    let start = Math.max(0, span.start);
    let end = Math.min(doc.text.length, span.end);
    while (start < end && /\s/.test(doc.text[start] ?? "")) start++;
    while (end > start && /\s/.test(doc.text[end - 1] ?? "")) end--;
    if (end <= start) continue;
    const id = `${doc.id}:${start}-${end}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk: Chunk = { id, docId: doc.id, index: chunks.length, text: doc.text.slice(start, end), start, end };
    if (span.headingPath && span.headingPath.length > 0) chunk.headingPath = [...span.headingPath];
    chunks.push(chunk);
  }
  return chunks;
}

export function assertSizes(size: number, overlap: number): void {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`size must be a positive integer, got ${size}`);
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new RangeError(`overlap must be an integer in [0, size), got ${overlap} for size ${size}`);
  }
}

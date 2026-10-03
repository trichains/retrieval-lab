import { analyzeTokens, type AnalyzerOptions } from "@/src/core";

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into plain and matched parts: a token is matched when one of its analyzed terms is
 * a query term, which is exactly how BM25 decided to score it (so "rotação" lights up for "rotacao").
 */
export function highlightParts(
  text: string,
  queryTerms: readonly string[],
  analyzer: AnalyzerOptions,
  lang?: string,
): TextPart[] {
  if (queryTerms.length === 0) return [{ text, match: false }];
  const wanted = new Set(queryTerms);
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const token of analyzeTokens(text, analyzer, lang)) {
    if (!token.terms.some((t) => wanted.has(t))) continue;
    if (token.start > cursor) parts.push({ text: text.slice(cursor, token.start), match: false });
    parts.push({ text: token.raw, match: true });
    cursor = token.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/** Cuts a long text around its first match, so long chunks still show why they were retrieved. */
export function clipAroundMatch(parts: TextPart[], maxChars: number): { parts: TextPart[]; clipped: boolean } {
  const total = parts.reduce((s, p) => s + p.text.length, 0);
  if (total <= maxChars) return { parts, clipped: false };
  let offset = 0;
  let firstMatch = 0;
  for (const p of parts) {
    if (p.match) {
      firstMatch = offset;
      break;
    }
    offset += p.text.length;
  }
  const start = Math.max(0, Math.min(firstMatch - Math.floor(maxChars / 4), total - maxChars));
  const end = start + maxChars;
  const out: TextPart[] = [];
  let pos = 0;
  for (const p of parts) {
    const pStart = pos;
    const pEnd = pos + p.text.length;
    pos = pEnd;
    if (pEnd <= start || pStart >= end) continue;
    out.push({
      text: p.text.slice(Math.max(0, start - pStart), Math.min(p.text.length, end - pStart)),
      match: p.match,
    });
  }
  if (start > 0 && out[0]) out[0] = { ...out[0], text: `…${out[0].text.trimStart()}` };
  const last = out[out.length - 1];
  if (end < total && last) out[out.length - 1] = { ...last, text: `${last.text.trimEnd()}…` };
  return { parts: out, clipped: true };
}

export interface CoverageSegment {
  start: number;
  end: number;
  /** Indexes of the chunks covering this segment (empty for text no chunk kept, e.g. whitespace). */
  chunks: number[];
}

/** Splits [0, length) at every chunk boundary and lists which chunks cover each piece. */
export function coverageSegments(length: number, chunks: readonly { start: number; end: number }[]): CoverageSegment[] {
  const cuts = new Set<number>([0, length]);
  for (const c of chunks) {
    cuts.add(c.start);
    cuts.add(c.end);
  }
  const points = [...cuts].filter((p) => p >= 0 && p <= length).sort((a, b) => a - b);
  const segments: CoverageSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;
    const covering: number[] = [];
    chunks.forEach((c, index) => {
      if (c.start <= start && c.end >= end) covering.push(index);
    });
    segments.push({ start, end, chunks: covering });
  }
  return segments;
}

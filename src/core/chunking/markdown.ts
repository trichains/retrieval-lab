import { recursiveSpans } from "./recursive";
import { spansToChunks, type Chunk, type RawSpan, type SourceDocument } from "./types";

export interface MarkdownSection {
  start: number;
  end: number;
  /** Heading titles from the outermost to this section's own heading. Empty before the first heading. */
  headingPath: string[];
  /** Level of this section's own heading (1-6), or 0 for text before the first heading. */
  level: number;
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

/**
 * Splits markdown into sections at ATX headings (`#` to `######`), ignoring lines inside fenced code
 * blocks. A heading with no body of its own (directly followed by a deeper heading) is merged into
 * the next section, so no chunk is just a bare title.
 */
export function splitMarkdownSections(text: string): MarkdownSection[] {
  const raw: MarkdownSection[] = [];
  const stack: { level: number; title: string }[] = [];
  let inFence: string | null = null;
  let current: MarkdownSection = { start: 0, end: text.length, headingPath: [], level: 0 };
  let offset = 0;

  for (const line of text.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    const fence = FENCE.exec(line)?.[1];
    if (fence) {
      if (inFence === null) inFence = fence;
      else if (inFence === fence) inFence = null;
      continue;
    }
    if (inFence !== null) continue;
    const heading = HEADING.exec(line.replace(/\r$/, ""));
    if (!heading) continue;
    const level = heading[1]!.length;
    const title = heading[2]!.trim();
    current.end = lineStart;
    raw.push(current);
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, title });
    current = { start: lineStart, end: text.length, headingPath: stack.map((h) => h.title), level };
  }
  raw.push(current);

  // Merge heading-only sections forward and drop empty preambles.
  const out: MarkdownSection[] = [];
  let carryStart: number | null = null;
  for (const section of raw) {
    const body = text.slice(section.start, section.end);
    const content = section.level === 0 ? body : body.slice(body.indexOf("\n") + 1 || body.length);
    if (content.trim().length === 0) {
      if (section.level > 0 && carryStart === null) carryStart = section.start;
      continue;
    }
    out.push({ ...section, start: carryStart ?? section.start });
    carryStart = null;
  }
  if (carryStart !== null) {
    // Trailing heading(s) with no body: keep them as a final section rather than dropping text.
    const last = raw[raw.length - 1]!;
    out.push({ ...last, start: carryStart });
  }
  return out;
}

/**
 * Heading-aware chunking: one chunk per markdown section, carrying its heading path. Sections longer
 * than `maxChars` are split further with the recursive splitter, and every piece keeps the path.
 * Plain text without headings degrades to the recursive splitter.
 */
export function chunkMarkdown(doc: SourceDocument, maxChars: number): Chunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError(`maxChars must be a positive integer`);
  const spans: RawSpan[] = [];
  for (const section of splitMarkdownSections(doc.text)) {
    for (const piece of recursiveSpans(doc.text, section.start, section.end, maxChars)) {
      spans.push({ ...piece, headingPath: section.headingPath });
    }
  }
  return spansToChunks(doc, spans);
}

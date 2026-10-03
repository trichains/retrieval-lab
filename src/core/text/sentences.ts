/** A span of the source text: `source.slice(start, end)`. */
export interface Span {
  start: number;
  end: number;
}

// Abbreviations whose trailing period does not end a sentence (normalized, without the period).
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "ex", "dr", "sr", "sra", "p.ex", "obs", "approx", "aprox"]);

/**
 * Splits text into sentence spans. A sentence ends at `.`, `!`, `?` or `…` followed by whitespace,
 * at a line break that is followed by a blank line, a markdown heading, a list item or a code fence,
 * and at the end of the text. Decimal numbers ("1.5"), version strings ("v2.1") and a short list of
 * abbreviations do not end sentences. Leading and trailing whitespace is excluded from every span, and
 * spans are returned in order and never overlap.
 */
export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;

  const push = (end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s] ?? "")) s++;
    while (e > s && /\s/.test(text[e - 1] ?? "")) e--;
    if (e > s) spans.push({ start: s, end: e });
    start = end;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      const rest = text.slice(i + 1, i + 8);
      if (/^\s*\n/.test(rest) || /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|```|>)/.test(rest)) {
        push(i + 1);
      }
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    // Consume runs like "?!" or "...".
    let j = i;
    while (j + 1 < text.length && /[.!?…"'”’)\]]/.test(text[j + 1] ?? "")) j++;
    const next = text[j + 1];
    if (next !== undefined && !/\s/.test(next)) continue; // "1.5", "v2.1", "api.nimbus.dev"
    if (ch === ".") {
      const before = text
        .slice(Math.max(0, i - 6), i)
        .match(/([\p{L}.]+)$/u)?.[1]
        ?.toLowerCase();
      if (before && ABBREVIATIONS.has(before)) continue;
    }
    push(j + 1);
    i = j;
  }
  push(text.length);
  return spans;
}

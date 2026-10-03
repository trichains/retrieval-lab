import { normalizeText } from "./normalize";

/** A word token with its exact position in the source text. */
export interface Token {
  /** The text exactly as it appears in the source: `source.slice(start, end)`. */
  raw: string;
  /** Accent-folded, lowercased form. */
  norm: string;
  start: number;
  end: number;
}

// Letters, digits and combining marks (so text that is already decomposed stays one token).
// Everything else (spaces, punctuation, hyphens, dots, underscores) separates tokens, which makes
// "rate-limit", "rate_limit" and "rate limit" all produce the same two tokens.
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

/** Splits text into word tokens, keeping offsets into the original string. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const start = match.index;
    tokens.push({ raw, norm: normalizeText(raw), start, end: start + raw.length });
  }
  return tokens;
}

/** Normalized token strings only. */
export function tokenizeToStrings(text: string): string[] {
  return tokenize(text).map((t) => t.norm);
}

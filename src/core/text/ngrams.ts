/** Contiguous word n-grams, joined with a single space. */
export function wordNgrams(tokens: readonly string[], n: number): string[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer, got ${n}`);
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}

export interface CharNgramOptions {
  /** Pad with a boundary marker so prefixes and suffixes get their own grams. Default true. */
  pad?: boolean;
  /** Boundary marker. Default "#". */
  marker?: string;
}

/**
 * Character n-grams of a single word, by code point (so accented letters are never split).
 * With padding, "api" -> "#ap", "api", "pi#" for n = 3. Words shorter than n (after padding) yield
 * the whole padded word once, so very short tokens still produce a feature.
 */
export function charNgrams(word: string, n: number, options: CharNgramOptions = {}): string[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer, got ${n}`);
  const marker = options.marker ?? "#";
  const padded = options.pad === false ? word : `${marker}${word}${marker}`;
  const chars = Array.from(padded);
  if (chars.length === 0) return [];
  if (chars.length <= n) return [padded];
  const out: string[] = [];
  for (let i = 0; i + n <= chars.length; i++) out.push(chars.slice(i, i + n).join(""));
  return out;
}

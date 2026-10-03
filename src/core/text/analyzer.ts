import { stemEn, stemPt } from "./stem";
import { STOPWORDS_EN, STOPWORDS_PT, stopwordsFor, type Language } from "./stopwords";
import { tokenize, type Token } from "./tokenize";

export type DetectedLanguage = Language | "unknown";

export interface AnalyzerOptions {
  /**
   * `auto`: stem with the document's language when it is known, otherwise detect it; when detection
   * is inconclusive (typical for 2-word queries) emit both the Portuguese and the English stem.
   * `none`: no stemming, only normalization.
   */
  stem: "auto" | "none";
  /** Drop function words. The list follows the detected language (both lists when unknown). */
  stopwords: boolean;
}

export const DEFAULT_ANALYZER: AnalyzerOptions = { stem: "auto", stopwords: true };

const PT_ONLY_CHARS = /[ãõçâêô]/i;

/**
 * Guesses pt vs en by counting stopwords of each language (plus a bonus for characters that only
 * Portuguese uses). Returns "unknown" on a tie, which is common for short keyword queries.
 */
export function detectLanguage(text: string): DetectedLanguage {
  let pt = PT_ONLY_CHARS.test(text) ? 2 : 0;
  let en = 0;
  for (const token of tokenize(text)) {
    const inPt = STOPWORDS_PT.has(token.norm);
    const inEn = STOPWORDS_EN.has(token.norm);
    if (inPt && !inEn) pt += 1;
    if (inEn && !inPt) en += 1;
  }
  if (pt > en) return "pt";
  if (en > pt) return "en";
  return "unknown";
}

export function resolveLanguage(text: string, hint?: string): DetectedLanguage {
  if (hint === "pt" || hint === "en") return hint;
  return detectLanguage(text);
}

/** Stems for one normalized token. Usually one, two when the language is unknown and they differ. */
export function stemsFor(norm: string, language: DetectedLanguage): string[] {
  if (language === "pt") return [stemPt(norm)];
  if (language === "en") return [stemEn(norm)];
  const pt = stemPt(norm);
  const en = stemEn(norm);
  return pt === en ? [pt] : [pt, en];
}

/** A token plus the index terms it produced (empty when it was dropped as a stopword). */
export interface AnalyzedToken extends Token {
  terms: string[];
}

export function analyzeTokens(
  text: string,
  options: AnalyzerOptions = DEFAULT_ANALYZER,
  languageHint?: string,
): AnalyzedToken[] {
  const language = resolveLanguage(text, languageHint);
  const stopwords = stopwordsFor(language);
  return tokenize(text).map((token) => {
    if (options.stopwords && stopwords.has(token.norm)) return { ...token, terms: [] };
    const terms = options.stem === "none" ? [token.norm] : stemsFor(token.norm, language);
    return { ...token, terms };
  });
}

/** The index terms for a text, in order, with repeats (term frequency matters for BM25). */
export function analyze(text: string, options: AnalyzerOptions = DEFAULT_ANALYZER, languageHint?: string): string[] {
  const out: string[] = [];
  for (const token of analyzeTokens(text, options, languageHint)) out.push(...token.terms);
  return out;
}

/**
 * Unicode normalization used everywhere text is compared.
 *
 * NFKD splits accented letters into base letter + combining mark ("ç" -> "c" + U+0327) and folds
 * compatibility forms ("ﬁ" -> "fi", full-width digits -> ASCII digits). Removing the combining marks
 * then gives accent folding, so "autenticação" and "autenticacao" compare equal.
 */

const COMBINING_MARKS = /\p{M}+/gu;

/** Removes diacritics and folds compatibility characters. Case is preserved. */
export function foldAccents(text: string): string {
  return text.normalize("NFKD").replace(COMBINING_MARKS, "");
}

/** Accent folding plus lowercase: the canonical form used for matching. */
export function normalizeText(text: string): string {
  return foldAccents(text).toLowerCase();
}

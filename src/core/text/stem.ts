/**
 * Light suffix-stripping stemmers for English and Portuguese.
 *
 * These are deliberately small heuristics, not Porter/Snowball/RSLP implementations. They conflate
 * the most common inflections (plurals, verb tenses, -ção/-ation nominalizations, adverbs) so that
 * "rotate", "rotated", "rotating" and "rotation" meet, and "autenticação", "autenticar" and
 * "autenticado" meet. They will over- and under-stem in places; what matters for retrieval is that
 * the same word always maps to the same stem, for documents and queries alike.
 *
 * Both functions expect normalized input (lowercase, accents folded, see `normalizeText`). Tokens
 * containing digits are returned unchanged, and no rule may leave a stem shorter than 3 characters.
 */

const MIN_STEM = 3;
const HAS_VOWEL_EN = /[aeiouy]/;
const DIGIT = /\d/;

function strip(word: string, suffix: string, replacement = "", minStem = MIN_STEM): string | null {
  if (!word.endsWith(suffix)) return null;
  const stem = word.slice(0, word.length - suffix.length);
  if (stem.length < minStem) return null;
  return stem + replacement;
}

/** First matching rule wins; rules are ordered longest/most specific first. */
function applyFirst(word: string, rules: readonly (readonly [string, string, number?])[]): string | null {
  for (const [suffix, replacement, minStem] of rules) {
    const result = strip(word, suffix, replacement, minStem ?? MIN_STEM);
    if (result !== null) return result;
  }
  return null;
}

// ---------------------------------------------------------------- English

const EN_DERIVATIONAL: readonly (readonly [string, string, number?])[] = [
  ["ibility", ""],
  ["ability", ""],
  ["ational", ""],
  ["ization", ""],
  ["fulness", "ful"],
  ["iveness", "ive"],
  ["ation", ""],
  ["ition", ""],
  ["ment", ""],
  ["ness", ""],
  ["able", ""],
  ["ible", ""],
  ["sion", "s"],
  ["tion", "t"],
  ["ity", ""],
  ["ate", ""],
  ["ly", "", 4],
];

export function stemEn(word: string): string {
  if (word.length <= 3 || DIGIT.test(word)) return word;
  let w = word;

  // 1. Plurals and third person singular.
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (/(?:ch|sh|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);

  // 2. Past tense and gerund.
  if (w.endsWith("ied") && w.length > 4) {
    w = w.slice(0, -3) + "y";
  } else {
    for (const suffix of ["ing", "ed"]) {
      if (!w.endsWith(suffix)) continue;
      const stem = w.slice(0, -suffix.length);
      if (stem.length >= MIN_STEM && HAS_VOWEL_EN.test(stem)) {
        w = stem;
        if (/(?:at|bl|iz)$/.test(w))
          w += "e"; // rotat -> rotate, enabl -> enable
        else if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1); // stopp -> stop, logg -> log
      }
      break;
    }
  }

  // 3. One derivational suffix.
  w = applyFirst(w, EN_DERIVATIONAL) ?? w;

  // 4. Final silent "e".
  if (w.endsWith("e") && w.length > MIN_STEM) w = w.slice(0, -1);
  return w;
}

// ---------------------------------------------------------------- Portuguese

const PT_PLURAL: readonly (readonly [string, string])[] = [
  ["oes", "ao"],
  ["aes", "ao"],
  ["ais", "al"],
  ["eis", "el"],
  ["ois", "ol"],
  ["ns", "m"],
  ["res", "r"],
  ["zes", "z"],
  ["ses", "s"],
];

const PT_DIMINUTIVE: readonly (readonly [string, string])[] = [
  ["zinho", ""],
  ["zinha", ""],
  ["inho", ""],
  ["inha", ""],
  ["issimo", ""],
  ["issima", ""],
];

const PT_NOMINAL: readonly (readonly [string, string])[] = [
  ["amento", ""],
  ["imento", ""],
  ["mento", ""],
  ["acao", ""],
  ["icao", ""],
  ["idade", ""],
  ["ancia", ""],
  ["encia", ""],
  ["agem", ""],
  ["ismo", ""],
  ["ista", ""],
  ["avel", ""],
  ["ivel", ""],
  ["eiro", ""],
  ["eira", ""],
  ["cao", ""],
  ["oso", ""],
  ["osa", ""],
];

const PT_VERBAL: readonly (readonly [string, string])[] = [
  ["ando", ""],
  ["endo", ""],
  ["indo", ""],
  ["aram", ""],
  ["eram", ""],
  ["iram", ""],
  ["avam", ""],
  ["ado", ""],
  ["ido", ""],
  ["ada", ""],
  ["ida", ""],
  ["ava", ""],
  ["ou", ""],
  ["ar", ""],
  ["er", ""],
  ["ir", ""],
];

export function stemPt(word: string): string {
  if (word.length <= 3 || DIGIT.test(word)) return word;
  let w = word;

  // 1. Plurals (only on words long enough that the rule is not a guess).
  if (w.length > 4) {
    const plural = applyFirst(w, PT_PLURAL);
    if (plural !== null) w = plural;
    else if (w.endsWith("s") && !/(?:ss|us)$/.test(w)) w = w.slice(0, -1);
  }

  // 2. Adverbs: rapidamente -> rapida.
  w = strip(w, "mente") ?? w;

  // 3. Diminutive and superlative.
  w = applyFirst(w, PT_DIMINUTIVE) ?? w;

  // 4. Nominal suffixes, otherwise 5. verbal endings.
  const nominal = applyFirst(w, PT_NOMINAL);
  if (nominal !== null) w = nominal;
  else w = applyFirst(w, PT_VERBAL) ?? w;

  // 6. Final unstressed vowel (gender/theme vowel): fatura -> fatur, chave -> chav.
  if (/[aeo]$/.test(w) && w.length > MIN_STEM) w = w.slice(0, -1);
  return w;
}

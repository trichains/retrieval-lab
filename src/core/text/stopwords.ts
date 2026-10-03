/**
 * Small, hand-picked stopword lists in normalized form (lowercase, no accents), so they can be
 * compared directly with `Token.norm`. They cover function words only: articles, pronouns,
 * prepositions, conjunctions and the most common auxiliary verbs. Content words ("api", "erro",
 * "limite") are never stopwords here, even when frequent, because BM25's IDF already discounts them.
 */

const EN = `a about above after again against all am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has
have having he her here hers herself him himself his how i if in into is it its itself just me more
most my myself no nor not now of off on once only or other our ours ourselves out over own same she
should so some such than that the their theirs them themselves then there these they this those
through to too under until up very was we were what when where which while who whom why will with
would you your yours yourself yourselves s t don shall may might must let`;

const PT = `a ao aos aquela aquelas aquele aqueles aquilo as ate com como da das de dela delas dele deles
depois do dos e ela elas ele eles em entre era eram essa essas esse esses esta estas este estes eu foi
foram ha isso isto ja lhe lhes mais mas me mesmo meu meus minha minhas muito na nas nem no nos nossa
nossas nosso nossos num numa o os ou para pela pelas pelo pelos por qual quando que quem se sem ser
seu seus so sua suas tambem te tem tinha tu tua tuas um uma umas uns voce voces vos sao seja sejam
esta estao estou ser sera serao tenho temos tera teve tiver onde porque pois cada outro outra outros
outras sobre apos`;

function toSet(list: string): ReadonlySet<string> {
  return new Set(list.split(/\s+/).filter(Boolean));
}

export const STOPWORDS_EN: ReadonlySet<string> = toSet(EN);
export const STOPWORDS_PT: ReadonlySet<string> = toSet(PT);

/** Union of both lists, for text whose language is unknown or mixed. */
export const STOPWORDS_ALL: ReadonlySet<string> = new Set([...STOPWORDS_EN, ...STOPWORDS_PT]);

export type Language = "pt" | "en";

export function stopwordsFor(language: Language | "unknown"): ReadonlySet<string> {
  if (language === "pt") return STOPWORDS_PT;
  if (language === "en") return STOPWORDS_EN;
  return STOPWORDS_ALL;
}

# Nimbus mini corpus

An original, bilingual (pt-BR and en) toy corpus about **Nimbus**, a fictional developer platform.
Every document and query was written for this repository. Nimbus does not exist; any resemblance to a
real product is coincidental.

## Layout

- `docs/<id>.md`: one document per file, with a small frontmatter block (`id`, `title`, `lang`, `tags`).
- `queries.json`: queries with graded relevance judgments.
- `../nimbus.json`: the compiled dataset consumed by the CLI, tests and web UI. Regenerate it with
  `npm run dataset:build` after editing anything here (a unit test fails if it is out of date).

## Relevance grades

| Grade | Meaning                                                            |
| ----- | ------------------------------------------------------------------ |
| 3     | The document directly and fully answers the query.                 |
| 2     | The document contains a substantial part of the answer.            |
| 1     | The document is on topic and useful context, but does not answer.  |
| 0     | Not relevant (omitted; anything not listed is treated as grade 0). |

Judgments are made at **document** level and ignore language: the Nimbus team is assumed to read both
Portuguese and English, so an English page that answers a Portuguese question is relevant.

## Query tags

`keyword` (shares the key terms with the answer), `paraphrase` (asks the same thing in different
words), `no-accents` (Portuguese typed without diacritics), `cross-lingual` (query language differs
from the answering document), `typo` / `morphology` (misspellings, inflected or derived word forms),
`long-doc` (the answer is one section of a long document), `multi-doc` (several documents are needed).

## Honesty note

The judgments were written by reading the documents, before any retrieval strategy was run against
them, and were not adjusted afterwards to favour any strategy. It is a small toy set: use it to see how
the pieces behave, not as a benchmark.

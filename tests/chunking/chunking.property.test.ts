import fc from "fast-check";
import { describe, it } from "vitest";
import { createChunker, type ChunkerConfig } from "@/src/core";

// Text generator biased towards the structure chunkers care about: words, sentence ends, newlines,
// blank lines, markdown headings, code fences, accents and astral characters.
const piece = fc.oneof(
  fc.constantFrom(
    "word",
    "API",
    "chave",
    "ação",
    " ",
    " ",
    "\n",
    "\n\n",
    ". ",
    "? ",
    "# ",
    "## ",
    "```",
    "\r\n",
    "𝔸",
    "-",
    "1.5",
  ),
  fc.string({ maxLength: 8 }),
);
const text = fc.array(piece, { maxLength: 80 }).map((parts) => parts.join(""));

const configs: ChunkerConfig[] = [
  { type: "none" },
  { type: "fixed-chars", size: 17, overlap: 5 },
  { type: "fixed-chars", size: 1, overlap: 0 },
  { type: "fixed-tokens", size: 4, overlap: 1 },
  { type: "sentence", maxChars: 40, overlapSentences: 1 },
  { type: "paragraph", maxChars: 0 },
  { type: "paragraph", maxChars: 60 },
  { type: "markdown", maxChars: 50 },
  { type: "recursive", size: 30, overlap: 10 },
  { type: "recursive", size: 3, overlap: 0 },
];

describe.each(configs)("chunker invariants: $type", (config) => {
  const chunk = createChunker(config);

  it("source.slice(start, end) === chunk.text for every chunk", () => {
    fc.assert(
      fc.property(text, (t) => chunk({ id: "doc", text: t }).every((c) => t.slice(c.start, c.end) === c.text)),
      { numRuns: 200 },
    );
  });

  it("chunks are non-empty, trimmed, in bounds, uniquely identified and indexed in order", () => {
    fc.assert(
      fc.property(text, (t) => {
        const chunks = chunk({ id: "doc", text: t });
        const ids = new Set(chunks.map((c) => c.id));
        return (
          ids.size === chunks.length &&
          chunks.every(
            (c, i) =>
              c.index === i &&
              c.docId === "doc" &&
              c.start >= 0 &&
              c.end <= t.length &&
              c.text.length > 0 &&
              c.text.trim() === c.text &&
              (i === 0 || c.start >= chunks[i - 1]!.start),
          )
        );
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(
        text,
        (t) => JSON.stringify(chunk({ id: "d", text: t })) === JSON.stringify(chunk({ id: "d", text: t })),
      ),
      { numRuns: 50 },
    );
  });
});

describe("coverage", () => {
  // Strategies without overlap that are meant to cover the whole text must not drop any content.
  it.each<ChunkerConfig>([
    { type: "none" },
    { type: "fixed-chars", size: 13, overlap: 0 },
    { type: "paragraph", maxChars: 0 },
    { type: "markdown", maxChars: 40 },
    { type: "recursive", size: 25, overlap: 0 },
    { type: "sentence", maxChars: 30, overlapSentences: 0 },
  ])("$type keeps every non-whitespace character exactly once", (config) => {
    const chunk = createChunker(config);
    fc.assert(
      fc.property(text, (t) => {
        const joined = chunk({ id: "d", text: t })
          .map((c) => c.text)
          .join("")
          .replace(/\s/g, "");
        return joined === t.replace(/\s/g, "");
      }),
      { numRuns: 200 },
    );
  });
});

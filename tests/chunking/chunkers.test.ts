import { describe, expect, it } from "vitest";
import {
  addOverlap,
  chunkFixedChars,
  chunkFixedTokens,
  chunkMarkdown,
  chunkParagraphs,
  chunkRecursive,
  chunkSentences,
  chunkWhole,
  createChunker,
  recursiveSpans,
  splitMarkdownSections,
  splitParagraphs,
  type Chunk,
} from "@/src/core";

const doc = (text: string, id = "d") => ({ id, text });
const texts = (chunks: Chunk[]) => chunks.map((c) => c.text);

describe("chunkWhole", () => {
  it("returns the trimmed document as one chunk with a stable id", () => {
    expect(chunkWhole(doc("  hello world \n"))).toEqual([
      { id: "d:2-13", docId: "d", index: 0, text: "hello world", start: 2, end: 13 },
    ]);
  });

  it("returns nothing for a blank document", () => {
    expect(chunkWhole(doc("   "))).toEqual([]);
  });
});

describe("chunkFixedChars", () => {
  it("cuts fixed windows with overlap", () => {
    expect(texts(chunkFixedChars(doc("abcdefghij"), 4, 1))).toEqual(["abcd", "defg", "ghij"]);
  });

  it("does not emit a trailing window already covered by the previous one", () => {
    expect(texts(chunkFixedChars(doc("abcdef"), 4, 2))).toEqual(["abcd", "cdef"]);
  });

  it("validates size and overlap", () => {
    expect(() => chunkFixedChars(doc("abc"), 0)).toThrow(RangeError);
    expect(() => chunkFixedChars(doc("abc"), 4, 4)).toThrow(RangeError);
    expect(() => chunkFixedChars(doc("abc"), 4, -1)).toThrow(RangeError);
  });
});

describe("chunkFixedTokens", () => {
  it("never cuts words and keeps the punctuation between tokens", () => {
    expect(texts(chunkFixedTokens(doc("one, two; three four five"), 2))).toEqual(["one, two", "three four", "five"]);
  });

  it("overlaps by tokens", () => {
    expect(texts(chunkFixedTokens(doc("a b c d e"), 3, 1))).toEqual(["a b c", "c d e"]);
  });
});

describe("chunkSentences", () => {
  const text = "One is short. Two is a bit longer. Three. Four is the last sentence here.";

  it("packs whole sentences up to maxChars", () => {
    expect(texts(chunkSentences(doc(text), 40))).toEqual([
      "One is short. Two is a bit longer.",
      "Three. Four is the last sentence here.",
    ]);
  });

  it("keeps an oversized sentence whole", () => {
    expect(texts(chunkSentences(doc("A very long sentence indeed. Short."), 10))).toEqual([
      "A very long sentence indeed.",
      "Short.",
    ]);
  });

  it("repeats trailing sentences when overlapping", () => {
    expect(texts(chunkSentences(doc("A. B. C. D."), 5, 1))).toEqual(["A. B.", "B. C.", "C. D."]);
  });
});

describe("paragraphs", () => {
  const text = "First para.\n\nSecond para\nstill second.\n\n\n  Third.";

  it("splits on blank lines", () => {
    const spans = splitParagraphs(text);
    expect(spans.map((s) => text.slice(s.start, s.end).trim())).toEqual([
      "First para.",
      "Second para\nstill second.",
      "Third.",
    ]);
  });

  it("merges short neighbours up to maxChars", () => {
    expect(texts(chunkParagraphs(doc(text), 40))).toEqual(["First para.\n\nSecond para\nstill second.", "Third."]);
  });

  it("emits one chunk per paragraph without maxChars", () => {
    expect(chunkParagraphs(doc(text))).toHaveLength(3);
  });
});

describe("recursive splitter", () => {
  it("prefers paragraph boundaries", () => {
    const text = "Alpha beta gamma.\n\nDelta epsilon.";
    expect(texts(chunkRecursive(doc(text), 20))).toEqual(["Alpha beta gamma.", "Delta epsilon."]);
  });

  it("falls back to sentences, then words, then characters", () => {
    expect(texts(chunkRecursive(doc("Hello world. This is a test. Another sentence here.\n\nNew para."), 30))).toEqual([
      "Hello world. This is a test.",
      "Another sentence here.",
      "New para.",
    ]);
    expect(texts(chunkRecursive(doc("abcdefghij"), 4))).toEqual(["abcd", "efgh", "ij"]);
  });

  it("does not produce whitespace-only or stray chunks", () => {
    const chunks = chunkRecursive(doc("Hello world. This is a test. Another sentence here.\n\nNew para."), 30, 8);
    expect(chunks.every((c) => c.text.trim().length > 3)).toBe(true);
  });

  it("raw spans are contiguous and within size", () => {
    const text = "word ".repeat(100);
    const spans = recursiveSpans(text, 0, text.length, 37);
    expect(spans[0]!.start).toBe(0);
    expect(spans[spans.length - 1]!.end).toBe(text.length);
    spans.forEach((s, i) => {
      expect(s.end - s.start).toBeLessThanOrEqual(37);
      if (i > 0) expect(s.start).toBe(spans[i - 1]!.end);
    });
  });

  it("overlap starts on a word boundary", () => {
    const text = "alpha beta gamma delta epsilon zeta";
    const spans = addOverlap(
      text,
      [
        { start: 0, end: 17 },
        { start: 17, end: text.length },
      ],
      8,
    );
    expect(text.slice(spans[1]!.start, spans[1]!.end)).toBe("gamma delta epsilon zeta");
  });
});

describe("markdown", () => {
  const md = [
    "# Webhooks",
    "",
    "## Signing",
    "",
    "Every request carries a signature.",
    "",
    "### Verifying",
    "",
    "Compute an HMAC.",
    "```",
    "# not a heading",
    "```",
    "## Retries",
    "Up to 8 attempts.",
  ].join("\n");

  it("splits at headings and tracks the heading path", () => {
    const chunks = chunkMarkdown(doc(md), 1000);
    expect(chunks.map((c) => c.headingPath)).toEqual([
      ["Webhooks", "Signing"],
      ["Webhooks", "Signing", "Verifying"],
      ["Webhooks", "Retries"],
    ]);
  });

  it("merges a heading with no body into the next section", () => {
    const [first] = chunkMarkdown(doc(md), 1000);
    expect(first!.text.startsWith("# Webhooks")).toBe(true);
  });

  it("ignores # lines inside fenced code", () => {
    const sections = splitMarkdownSections(md);
    expect(sections.some((s) => s.headingPath.includes("not a heading"))).toBe(false);
  });

  it("keeps text before the first heading", () => {
    const chunks = chunkMarkdown(doc("Preamble text.\n\n# A\nBody."), 1000);
    expect(chunks[0]).toMatchObject({ text: "Preamble text." });
    expect(chunks[0]!.headingPath).toBeUndefined();
  });

  it("sub-splits long sections and keeps the path on every piece", () => {
    const long = `# Guide\n\n${"Sentence number one is here. ".repeat(20)}`;
    const chunks = chunkMarkdown(doc(long), 120);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.headingPath?.[0] === "Guide")).toBe(true);
  });

  it("handles CRLF line endings", () => {
    const chunks = chunkMarkdown(doc("# A\r\nbody a\r\n# B\r\nbody b"), 1000);
    expect(chunks.map((c) => c.headingPath)).toEqual([["A"], ["B"]]);
  });

  it("degrades to plain splitting without headings", () => {
    expect(chunkMarkdown(doc("Just text."), 1000)).toHaveLength(1);
  });
});

describe("createChunker", () => {
  it("dispatches on config type", () => {
    const text = "One. Two.\n\nThree.";
    expect(createChunker({ type: "none" })(doc(text))).toHaveLength(1);
    expect(createChunker({ type: "paragraph", maxChars: 0 })(doc(text))).toHaveLength(2);
    expect(createChunker({ type: "sentence", maxChars: 5, overlapSentences: 0 })(doc(text))).toHaveLength(3);
    expect(createChunker({ type: "fixed-chars", size: 5, overlap: 0 })(doc(text)).length).toBeGreaterThan(2);
  });

  it("indexes chunks from 0 and prefixes ids with the doc id", () => {
    const chunks = createChunker({ type: "recursive", size: 10, overlap: 0 })(doc("aaaa bbbb cccc dddd", "x"));
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.id).toBe(`x:${c.start}-${c.end}`);
    });
  });
});

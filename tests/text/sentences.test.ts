import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitSentences } from "@/src/core";

const texts = (text: string) => splitSentences(text).map((s) => text.slice(s.start, s.end));

describe("splitSentences", () => {
  it("splits on terminal punctuation followed by whitespace", () => {
    expect(texts("First one. Second one! Third? Fourth")).toEqual(["First one.", "Second one!", "Third?", "Fourth"]);
  });

  it("does not split decimals, versions, hostnames or abbreviations", () => {
    expect(texts("Version 2.1 is live on api.nimbus.dev today. E.g. this stays. Done")).toEqual([
      "Version 2.1 is live on api.nimbus.dev today.",
      "E.g. this stays.",
      "Done",
    ]);
  });

  it("keeps closing quotes and brackets with the sentence", () => {
    expect(texts('He said "stop." Then left.')).toEqual(['He said "stop."', "Then left."]);
  });

  it("breaks at blank lines, headings, list items and code fences", () => {
    expect(texts("Intro line\n\n# Title\n- one\n- two\n```\ncode\n```")).toEqual([
      "Intro line",
      "# Title",
      "- one",
      "- two",
      "```\ncode",
      "```",
    ]);
  });

  it("handles Portuguese text", () => {
    expect(texts("A chave expira em 90 dias. Gere outra no painel.")).toHaveLength(2);
  });

  it("returns nothing for blank text", () => {
    expect(splitSentences("   \n\n ")).toEqual([]);
  });

  it("spans are trimmed, ordered and non-overlapping (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const spans = splitSentences(s);
        return spans.every((span, i) => {
          const text = s.slice(span.start, span.end);
          const trimmed = text.length > 0 && text.trim() === text;
          return trimmed && (i === 0 || span.start >= spans[i - 1]!.end);
        });
      }),
    );
  });

  it("never loses non-whitespace characters (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const joined = splitSentences(s)
          .map((span) => s.slice(span.start, span.end))
          .join("")
          .replace(/\s/g, "");
        return joined === s.replace(/\s/g, "");
      }),
    );
  });
});

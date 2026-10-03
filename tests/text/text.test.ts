import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  analyze,
  analyzeTokens,
  charNgrams,
  detectLanguage,
  foldAccents,
  normalizeText,
  stemsFor,
  STOPWORDS_EN,
  STOPWORDS_PT,
  tokenize,
  wordNgrams,
} from "@/src/core";

describe("normalizeText", () => {
  it.each([
    ["Autenticação", "autenticacao"],
    ["AÇÃO", "acao"],
    ["Rotação de chaves", "rotacao de chaves"],
    ["naïve café", "naive cafe"],
    ["ﬁle", "file"],
    ["ＡＰＩ", "api"],
  ])("folds %j to %j", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("keeps case in foldAccents", () => {
    expect(foldAccents("Ação")).toBe("Acao");
  });

  it("treats precomposed and decomposed input the same", () => {
    const decomposed = "ção"; // c + cedilla, a + tilde, o
    expect(decomposed).not.toBe("ção");
    expect(normalizeText(decomposed)).toBe(normalizeText("ção"));
    expect(normalizeText(decomposed)).toBe("cao");
  });

  it("is idempotent (property)", () => {
    fc.assert(fc.property(fc.string(), (s) => normalizeText(normalizeText(s)) === normalizeText(s)));
  });
});

describe("tokenize", () => {
  it("splits on punctuation, hyphens, dots and underscores", () => {
    expect(tokenize("rate-limit, rate_limit; api.nimbus.dev").map((t) => t.norm)).toEqual([
      "rate",
      "limit",
      "rate",
      "limit",
      "api",
      "nimbus",
      "dev",
    ]);
  });

  it("keeps accented words whole and normalizes them", () => {
    const [token] = tokenize("Configuração");
    expect(token).toMatchObject({ raw: "Configuração", norm: "configuracao", start: 0, end: 12 });
  });

  it("keeps digits and mixed tokens", () => {
    expect(tokenize("HTTP 429 v2").map((t) => t.norm)).toEqual(["http", "429", "v2"]);
  });

  it("returns no tokens for whitespace and punctuation only", () => {
    expect(tokenize("  ... --- !!! ")).toEqual([]);
  });

  it("offsets always slice back to the raw token (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) =>
        tokenize(s).every((t) => s.slice(t.start, t.end) === t.raw && t.end > t.start),
      ),
    );
  });

  it("tokens are ordered and never overlap (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const tokens = tokenize(s);
        return tokens.every((t, i) => i === 0 || t.start >= tokens[i - 1]!.end);
      }),
    );
  });
});

describe("stopwords", () => {
  it("are stored in normalized form", () => {
    for (const word of [...STOPWORDS_EN, ...STOPWORDS_PT]) expect(normalizeText(word)).toBe(word);
  });

  it("do not include domain words", () => {
    for (const word of ["api", "erro", "limite", "chave", "key", "error", "webhook"]) {
      expect(STOPWORDS_EN.has(word) || STOPWORDS_PT.has(word)).toBe(false);
    }
  });
});

describe("detectLanguage", () => {
  it.each([
    ["Como faço para trocar a chave de API do meu projeto?", "pt"],
    ["How do I rotate the API key for my project?", "en"],
    ["a rotação das chaves", "pt"],
    ["webhook retries", "unknown"],
    ["", "unknown"],
  ])("%j -> %s", (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
});

describe("analyzer", () => {
  it("drops stopwords and stems with the hinted language", () => {
    expect(analyze("The keys were rotated", undefined, "en")).toEqual(["key", "rot"]);
    expect(analyze("As chaves foram rotacionadas", undefined, "pt")).toContain("chav");
  });

  it("emits both stems when the language is unknown and they differ", () => {
    expect(stemsFor("retries", "unknown")).toEqual(["retri", "retry"]);
    expect(stemsFor("webhooks", "unknown")).toEqual(["webhook"]);
  });

  it("matches accented and unaccented Portuguese", () => {
    expect(analyze("autenticação", undefined, "pt")).toEqual(analyze("autenticacao", undefined, "pt"));
  });

  it("can disable stemming and stopwords", () => {
    expect(analyze("The keys", { stem: "none", stopwords: false }, "en")).toEqual(["the", "keys"]);
  });

  it("keeps token offsets and marks stopwords with no terms", () => {
    const tokens = analyzeTokens("the API keys", undefined, "en");
    expect(tokens.map((t) => t.terms)).toEqual([[], ["api"], ["key"]]);
    expect(tokens[2]).toMatchObject({ start: 8, end: 12 });
  });

  it("is deterministic (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (s) => JSON.stringify(analyze(s)) === JSON.stringify(analyze(s))),
    );
  });
});

describe("n-grams", () => {
  it("builds word bigrams and trigrams", () => {
    expect(wordNgrams(["a", "b", "c"], 2)).toEqual(["a b", "b c"]);
    expect(wordNgrams(["a", "b", "c"], 3)).toEqual(["a b c"]);
    expect(wordNgrams(["a"], 2)).toEqual([]);
  });

  it("builds padded character trigrams", () => {
    expect(charNgrams("api", 3)).toEqual(["#ap", "api", "pi#"]);
    expect(charNgrams("api", 3, { pad: false })).toEqual(["api"]);
  });

  it("returns the whole word when shorter than n", () => {
    expect(charNgrams("a", 4)).toEqual(["#a#"]);
    expect(charNgrams("", 3, { pad: false })).toEqual([]);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(charNgrams("𝔸𝔹", 2, { pad: false })).toEqual(["𝔸𝔹"]);
  });

  it("rejects invalid n", () => {
    expect(() => wordNgrams(["a"], 0)).toThrow(RangeError);
    expect(() => charNgrams("a", 1.5)).toThrow(RangeError);
  });

  it("produces length - n + 1 word n-grams (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 30 }), fc.integer({ min: 1, max: 5 }), (words, n) => {
        return wordNgrams(words, n).length === Math.max(0, words.length - n + 1);
      }),
    );
  });
});

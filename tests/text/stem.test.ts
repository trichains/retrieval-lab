import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeText, stemEn, stemPt } from "@/src/core";

// Golden stems. These are the light heuristics' actual outputs, pinned so changes are deliberate.
describe("stemEn", () => {
  it.each([
    ["rotations", "rot"],
    ["retries", "retry"],
    ["retried", "retry"],
    ["deployments", "deploy"],
    ["authentication", "authentic"],
    ["policies", "policy"],
    ["caches", "cach"],
    ["billing", "bill"],
    ["stopped", "stop"],
    ["logging", "log"],
    ["connection", "connect"],
    ["quickly", "quick"],
    ["status", "status"],
    ["http2", "http2"],
    ["api", "api"],
  ])("%s -> %s", (word, stem) => {
    expect(stemEn(word)).toBe(stem);
  });

  // Families that must conflate: this is what matters for retrieval.
  it.each([
    [["rotate", "rotated", "rotating", "rotation"]],
    [["configure", "configured", "configuration"]],
    [["retry", "retries", "retried", "retrying"]],
    [["deploy", "deploys", "deployed", "deploying", "deployment"]],
    [["authenticate", "authenticated", "authentication"]],
    [["enable", "enabled"]],
    [["available", "availability"]],
    [["secure", "security"]],
    [["limit", "limits", "limited"]],
    [["invoice", "invoices"]],
    [["signature", "signatures"]],
  ])("conflates %j", (family) => {
    expect(new Set(family.map(stemEn)).size).toBe(1);
  });

  it("does not over-merge unrelated short words", () => {
    expect(stemEn("apply")).not.toBe(stemEn("app"));
    expect(stemEn("string")).toBe("string");
  });
});

describe("stemPt", () => {
  const pt = (w: string) => stemPt(normalizeText(w));

  it.each([
    ["autenticação", "autentic"],
    ["faturas", "fatur"],
    ["chaves", "chav"],
    ["servidores", "servidor"],
    ["itens", "item"],
    ["papéis", "papel"],
    ["fiscais", "fiscal"],
    ["webhooks", "webhook"],
    ["status", "status"],
    ["v2", "v2"],
  ])("%s -> %s", (word, stem) => {
    expect(pt(word)).toBe(stem);
  });

  it.each([
    [["autenticação", "autenticações", "autenticar", "autenticado", "autenticada"]],
    [["fatura", "faturas", "faturamento", "faturar"]],
    [["configuração", "configurar", "configurado"]],
    [["implantação", "implantar", "implantações"]],
    [["rotação", "rotações"]],
    [["mensagem", "mensagens"]],
    [["cobrança", "cobranças"]],
    [["limite", "limites"]],
    [["tentativa", "tentativas"]],
  ])("conflates %j", (family) => {
    expect(new Set(family.map(pt)).size).toBe(1);
  });

  it("treats accented and unaccented input the same once normalized", () => {
    expect(pt("rotação")).toBe(pt("rotacao"));
  });
});

describe("stemmer invariants (property)", () => {
  const word = fc.stringMatching(/^[a-z]{1,16}$/);

  it("never grows a word by more than one character and never returns empty", () => {
    fc.assert(
      fc.property(word, (w) => {
        for (const s of [stemEn(w), stemPt(w)]) {
          if (s.length === 0 || s.length > w.length + 1) return false;
        }
        return true;
      }),
    );
  });

  it("leaves words of 3 characters or fewer unchanged", () => {
    fc.assert(fc.property(fc.stringMatching(/^[a-z]{1,3}$/), (w) => stemEn(w) === w && stemPt(w) === w));
  });

  it("is deterministic", () => {
    fc.assert(fc.property(word, (w) => stemEn(w) === stemEn(w) && stemPt(w) === stemPt(w)));
  });
});

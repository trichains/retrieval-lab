import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbeddingRequestError, OpenAICompatibleEmbedder } from "@/src/core";

type FetchArgs = [string, RequestInit];

function mockFetch(handler: (body: { model: string; input: string[]; dimensions?: number }) => Response) {
  const calls: FetchArgs[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return handler(JSON.parse(String(init.body)));
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const ok = (input: string[], reverse = false) => {
  const data = input.map((text, index) => ({ index, embedding: [text.length, 1, 0] }));
  return new Response(JSON.stringify({ data: reverse ? data.reverse() : data }), { status: 200 });
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenAICompatibleEmbedder", () => {
  it("posts to {baseUrl}/embeddings with the model, input and bearer key", async () => {
    const { fetch, calls } = mockFetch((body) => ok(body.input));
    const embedder = new OpenAICompatibleEmbedder({
      baseUrl: "https://example.test/v1/",
      model: "m",
      apiKey: "k-123",
      fetch,
    });
    await embedder.embed(["hello"]);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://example.test/v1/embeddings");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
    expect(JSON.parse(String(init.body))).toEqual({ model: "m", input: ["hello"] });
  });

  it("sends dimensions when configured", async () => {
    const { fetch, calls } = mockFetch((body) => ok(body.input));
    await new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", dimensions: 256, fetch }).embed(["a"]);
    expect(JSON.parse(String(calls[0]![1].body)).dimensions).toBe(256);
  });

  it("omits Authorization when there is no key (local servers)", async () => {
    vi.stubEnv("RLAB_EMBEDDINGS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const { fetch, calls } = mockFetch((body) => ok(body.input));
    const embedder = new OpenAICompatibleEmbedder({ baseUrl: "http://localhost:11434/v1", model: "m", fetch });
    expect(embedder.hasApiKey).toBe(false);
    await embedder.embed(["a"]);
    expect((calls[0]![1].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("reads the key from the environment when not given", async () => {
    vi.stubEnv("RLAB_EMBEDDINGS_API_KEY", "from-env");
    const { fetch, calls } = mockFetch((body) => ok(body.input));
    await new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", fetch }).embed(["a"]);
    expect((calls[0]![1].headers as Record<string, string>).Authorization).toBe("Bearer from-env");
  });

  it("never exposes the key through serialization or the id", () => {
    const { fetch } = mockFetch((body) => ok(body.input));
    const embedder = new OpenAICompatibleEmbedder({
      baseUrl: "http://x.test",
      model: "m",
      apiKey: "secret-key",
      fetch,
    });
    expect(JSON.stringify(embedder)).not.toContain("secret-key");
    expect(embedder.id).not.toContain("secret-key");
  });

  it("batches requests and keeps input order", async () => {
    const { fetch, calls } = mockFetch((body) => ok(body.input, true));
    const embedder = new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", batchSize: 2, fetch });
    const vectors = await embedder.embed(["a", "bbb", "cc"]);
    expect(calls).toHaveLength(2);
    // [len, 1, 0] normalized: the first component orders the inputs by length 1, 3, 2.
    const ratios = vectors.map((v) => v[0]! / v[1]!);
    [1, 3, 2].forEach((expected, i) => expect(ratios[i]).toBeCloseTo(expected, 5));
  });

  it("normalizes returned vectors", async () => {
    const { fetch } = mockFetch((body) => ok(body.input));
    const [v] = await new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", fetch }).embed(["abc"]);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 5);
  });

  it("turns HTTP errors into EmbeddingRequestError without leaking the key", async () => {
    const { fetch } = mockFetch(() => new Response("invalid api key", { status: 401 }));
    const embedder = new OpenAICompatibleEmbedder({
      baseUrl: "http://x.test",
      model: "m",
      apiKey: "secret-key",
      fetch,
    });
    const error = await embedder.embed(["a"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmbeddingRequestError);
    expect((error as EmbeddingRequestError).status).toBe(401);
    expect((error as Error).message).toContain("HTTP 401");
    expect((error as Error).message).not.toContain("secret-key");
  });

  it("rejects malformed and short responses", async () => {
    const bad = mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(
      new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", fetch: bad.fetch }).embed(["a"]),
    ).rejects.toThrow(/expected shape/);
    const short = mockFetch(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(
      new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", fetch: short.fetch }).embed(["a"]),
    ).rejects.toThrow(/Expected 1 embeddings/);
  });

  it("wraps network failures", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("connection refused");
    }) as unknown as typeof fetch;
    await expect(
      new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", fetch: failing }).embed(["a"]),
    ).rejects.toThrow(/connection refused/);
  });

  it("validates batch size", () => {
    expect(
      () => new OpenAICompatibleEmbedder({ baseUrl: "http://x.test", model: "m", batchSize: 0, fetch: vi.fn() }),
    ).toThrow(RangeError);
  });
});

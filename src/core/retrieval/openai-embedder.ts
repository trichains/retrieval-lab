import { z } from "zod";
import { l2Normalize, type Embedder } from "./embedder";

export interface OpenAICompatibleEmbedderOptions {
  /** Base URL of an OpenAI-compatible API, e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1". */
  baseUrl: string;
  model: string;
  /**
   * API key. If omitted, read from the `RLAB_EMBEDDINGS_API_KEY` or `OPENAI_API_KEY` environment
   * variable when running under Node. Local servers usually need none. The key is only ever sent in
   * the Authorization header; it is never stored, logged or included in errors.
   */
  apiKey?: string;
  /** Requested output dimensions, for models that support it. */
  dimensions?: number;
  /** Inputs per request. Default 64. */
  batchSize?: number;
  /** Injected for tests or custom transports. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const ResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().min(0), embedding: z.array(z.number()) })),
});

function envKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.RLAB_EMBEDDINGS_API_KEY || env?.OPENAI_API_KEY || undefined;
}

export class EmbeddingRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmbeddingRequestError";
  }
}

/** Thrown when a base URL is not acceptable for sending an API key to. */
export class EmbeddingUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingUrlError";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validates the base URL of a network embedder before any request (and before any key is attached):
 * it must parse, carry no user:password, and use https unless the host is localhost, 127.0.0.1 or
 * [::1]. Returns the normalized URL without a trailing slash.
 */
export function checkEmbeddingBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EmbeddingUrlError(`Invalid embedding base URL: "${raw}"`);
  }
  if (url.username || url.password) {
    throw new EmbeddingUrlError("Embedding base URL must not contain credentials; use the API key variable instead");
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  }
  throw new EmbeddingUrlError(
    `Refusing embedding base URL "${url.origin}": use https (plain http is only allowed for localhost, 127.0.0.1 or [::1])`,
  );
}

/**
 * Calls `POST {baseUrl}/embeddings` on any OpenAI-compatible server (OpenAI, Azure-style proxies,
 * Ollama, LM Studio, vLLM...). Never used by default: the lab runs fully offline with
 * `HashingEmbedder`. This exists to show that a real semantic model plugs into the same interface.
 */
export class OpenAICompatibleEmbedder implements Embedder {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimensions?: number;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  // Kept in a closure-like private field and never serialized (no toJSON exposure).
  readonly #apiKey: string | undefined;

  constructor(options: OpenAICompatibleEmbedderOptions) {
    this.baseUrl = checkEmbeddingBaseUrl(options.baseUrl);
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.batchSize = options.batchSize ?? 64;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) throw new RangeError("batchSize must be >= 1");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("No fetch implementation available");
    this.fetchImpl = fetchImpl;
    this.#apiKey = options.apiKey ?? envKey();
    this.id = `openai:${this.baseUrl}:${this.model}:${this.dimensions ?? "default"}`;
  }

  get hasApiKey(): boolean {
    return Boolean(this.#apiKey);
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      out.push(...(await this.embedBatch(texts.slice(i, i + this.batchSize))));
    }
    return out;
  }

  private async embedBatch(batch: readonly string[]): Promise<Float32Array[]> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.#apiKey) headers.Authorization = `Bearer ${this.#apiKey}`;
    const body: Record<string, unknown> = { model: this.model, input: batch };
    if (this.dimensions !== undefined) body.dimensions = this.dimensions;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new EmbeddingRequestError(`Embedding request to ${this.baseUrl} failed: ${reason}`);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new EmbeddingRequestError(
        `Embedding request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }
    const parsed = ResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new EmbeddingRequestError("Embedding response did not match the expected shape");
    const rows = [...parsed.data.data].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) {
      throw new EmbeddingRequestError(`Expected ${batch.length} embeddings, got ${rows.length}`);
    }
    const dims = rows[0]?.embedding.length ?? 0;
    return rows.map((row) => {
      if (row.embedding.length !== dims) throw new EmbeddingRequestError("Embeddings have inconsistent dimensions");
      return l2Normalize(Float32Array.from(row.embedding));
    });
  }
}

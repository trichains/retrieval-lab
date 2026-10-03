import { dot, l2Normalize, type Embedder } from "./embedder";
import { topK } from "./topk";
import { compareScored, type Hit, type IndexItem } from "./types";

/**
 * Exact (brute-force) nearest-neighbour search by cosine similarity. Every query is compared with
 * every vector: O(n · dims). That is the right trade-off up to tens of thousands of chunks; beyond
 * that an ANN index (HNSW, IVF) would replace this class behind the same `search` signature.
 */
export class VectorIndex {
  readonly embedder: Embedder;
  private readonly items: readonly IndexItem[];
  private readonly vectors: Float32Array[];
  private readonly byId: Map<string, number>;

  private constructor(items: readonly IndexItem[], vectors: Float32Array[], embedder: Embedder) {
    this.items = items;
    this.vectors = vectors;
    this.embedder = embedder;
    this.byId = new Map(items.map((item, i) => [item.id, i]));
  }

  static async build(items: readonly IndexItem[], embedder: Embedder): Promise<VectorIndex> {
    const vectors = await embedder.embed(items.map((item) => item.text));
    if (vectors.length !== items.length) {
      throw new Error(`Embedder returned ${vectors.length} vectors for ${items.length} items`);
    }
    // Normalize a copy so cosine similarity is a plain dot product.
    return new VectorIndex(
      items,
      vectors.map((v) => l2Normalize(Float32Array.from(v))),
      embedder,
    );
  }

  get size(): number {
    return this.items.length;
  }

  vectorOf(id: string): Float32Array | undefined {
    const i = this.byId.get(id);
    return i === undefined ? undefined : this.vectors[i];
  }

  async embedQuery(query: string): Promise<Float32Array> {
    const [vector] = await this.embedder.embed([query]);
    if (!vector) throw new Error("Embedder returned no vector for the query");
    return l2Normalize(Float32Array.from(vector));
  }

  searchVector(queryVector: Float32Array, k: number): Hit[] {
    const scored: Hit[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const score = dot(queryVector, this.vectors[i]!);
      if (score > 0) scored.push({ id: this.items[i]!.id, docId: this.items[i]!.docId, score });
    }
    return topK(scored, k, compareScored);
  }

  /**
   * Top `k` items by cosine similarity. Items with similarity <= 0 are dropped, so a query with no
   * usable features (only stopwords, say) returns nothing instead of an arbitrary ranking.
   */
  async search(query: string, k: number): Promise<Hit[]> {
    return this.searchVector(await this.embedQuery(query), k);
  }
}

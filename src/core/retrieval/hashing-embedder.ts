import { fnv1a32 } from "../hash";
import { charNgrams, wordNgrams } from "../text/ngrams";
import { STOPWORDS_ALL } from "../text/stopwords";
import { tokenize } from "../text/tokenize";
import { l2Normalize, type Embedder } from "./embedder";

export interface HashingEmbedderOptions {
  dims: number;
  bigramWeight: number;
  charWeight: number;
}

export const DEFAULT_HASHING: HashingEmbedderOptions = { dims: 1024, bigramWeight: 0.5, charWeight: 0.35 };

const SIGN_SEED = 0x9e3779b9;

/**
 * A deterministic, training-free embedder based on signed feature hashing (the "hashing trick").
 *
 * Features per text: normalized word unigrams (stopwords removed), word bigrams and character
 * trigrams of each word (with boundary markers). Each feature is hashed to one of `dims` buckets and
 * added with a pseudo-random sign from a second hash, which keeps collisions unbiased. The result is
 * L2-normalized, so cosine similarity is a dot product.
 *
 * What it is: a fast lexical/sub-word similarity that tolerates accents, typos and inflection, and
 * finds partial overlap between cognates ("autenticação" / "authentication"). What it is not: a
 * semantic model. It has no idea that "invoice" and "bill" mean the same thing.
 */
export class HashingEmbedder implements Embedder {
  readonly options: HashingEmbedderOptions;
  readonly id: string;

  constructor(options: Partial<HashingEmbedderOptions> = {}) {
    this.options = { ...DEFAULT_HASHING, ...options };
    const { dims, bigramWeight, charWeight } = this.options;
    if (!Number.isInteger(dims) || dims < 1) throw new RangeError(`dims must be a positive integer`);
    this.id = `hashing:${dims}:${bigramWeight}:${charWeight}`;
  }

  /** The weighted features of a text, before hashing. Exposed for tests and for the UI. */
  features(text: string): Map<string, number> {
    const { bigramWeight, charWeight } = this.options;
    const words = tokenize(text)
      .map((t) => t.norm)
      .filter((w) => !STOPWORDS_ALL.has(w));
    const features = new Map<string, number>();
    const add = (feature: string, weight: number) => {
      if (weight !== 0) features.set(feature, (features.get(feature) ?? 0) + weight);
    };
    for (const word of words) {
      add(`w:${word}`, 1);
      if (charWeight > 0) for (const gram of charNgrams(word, 3)) add(`c:${gram}`, charWeight);
    }
    if (bigramWeight > 0) for (const bigram of wordNgrams(words, 2)) add(`b:${bigram}`, bigramWeight);
    return features;
  }

  embedSync(text: string): Float32Array {
    const vector = new Float32Array(this.options.dims);
    for (const [feature, weight] of this.features(text)) {
      const bucket = fnv1a32(feature) % this.options.dims;
      const sign = fnv1a32(feature, SIGN_SEED) & 1 ? 1 : -1;
      vector[bucket]! += sign * weight;
    }
    return l2Normalize(vector);
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    return texts.map((text) => this.embedSync(text));
  }
}

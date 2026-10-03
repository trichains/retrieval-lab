import type { GridInput } from "@/src/core";
import defaultGrid from "@/datasets/grid.default.json";

export const PRESET_IDS = ["default", "rerankers", "sizes", "context"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Experiment grids offered in the UI. `default` is the same file the CLI and README use. */
export const PRESETS: Record<PresetId, GridInput> = {
  default: defaultGrid as GridInput,
  rerankers: {
    name: "rerankers",
    chunkers: [{ type: "recursive", size: 500, overlap: 100 }],
    retrievers: [{ type: "bm25" }, { type: "vector" }, { type: "hybrid" }],
    rerankers: [{ type: "none" }, { type: "mmr", lambda: 0.7 }, { type: "lexical", weight: 0.5 }],
  },
  sizes: {
    name: "sizes",
    chunkers: [200, 400, 800, 1600].map((size) => ({
      type: "recursive" as const,
      size,
      overlap: Math.round(size / 5),
    })),
    retrievers: [{ type: "bm25" }, { type: "hybrid" }],
  },
  context: {
    name: "context",
    chunkers: [
      { type: "markdown", maxChars: 800 },
      { type: "recursive", size: 500, overlap: 100 },
    ],
    retrievers: [{ type: "bm25" }, { type: "vector" }, { type: "hybrid" }],
    contextHeaders: [false, true],
  },
};

export function isPresetId(value: string | null): value is PresetId {
  return value !== null && (PRESET_IDS as readonly string[]).includes(value);
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DatasetSchema, type Dataset, type DatasetDocument } from "@/src/core";
import { NIMBUS } from "./nimbus";

/**
 * The corpus every view works on: the bundled Nimbus dataset, or one the user brought. A user
 * corpus lives in memory and in sessionStorage of this tab only (so switching language keeps it);
 * it is never sent anywhere.
 */
export type CorpusSource =
  | { kind: "nimbus"; name: string; docs: DatasetDocument[]; dataset: Dataset }
  | { kind: "custom"; name: string; docs: DatasetDocument[]; dataset: Dataset | null };

interface CorpusContextValue {
  source: CorpusSource;
  setCustom: (name: string, docs: DatasetDocument[], dataset?: Dataset | null) => void;
  reset: () => void;
}

const NIMBUS_SOURCE: CorpusSource = { kind: "nimbus", name: "Nimbus", docs: NIMBUS.documents, dataset: NIMBUS };
const STORAGE_KEY = "rlab:corpus:v1";
const MAX_STORED_CHARS = 4_000_000;

const CorpusContext = createContext<CorpusContextValue>({
  source: NIMBUS_SOURCE,
  setCustom: () => {},
  reset: () => {},
});

function readStored(): CorpusSource | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: unknown; docs?: unknown; dataset?: unknown };
    const docs = DatasetSchema.shape.documents.safeParse(parsed.docs);
    if (!docs.success || typeof parsed.name !== "string") return null;
    const dataset = parsed.dataset ? DatasetSchema.safeParse(parsed.dataset) : null;
    return { kind: "custom", name: parsed.name, docs: docs.data, dataset: dataset?.success ? dataset.data : null };
  } catch {
    return null;
  }
}

export function CorpusProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<CorpusSource>(NIMBUS_SOURCE);

  useEffect(() => {
    const stored = readStored();
    // Restoring a user corpus from this tab's storage after hydration (the server always renders Nimbus).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setSource(stored);
  }, []);

  const setCustom = useCallback((name: string, docs: DatasetDocument[], dataset: Dataset | null = null) => {
    const next: CorpusSource = { kind: "custom", name, docs, dataset };
    setSource(next);
    try {
      const serialized = JSON.stringify({ name, docs, dataset });
      if (serialized.length <= MAX_STORED_CHARS) window.sessionStorage.setItem(STORAGE_KEY, serialized);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or unavailable (private mode): the corpus still works for this page view.
    }
  }, []);

  const reset = useCallback(() => {
    setSource(NIMBUS_SOURCE);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ source, setCustom, reset }), [source, setCustom, reset]);
  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>;
}

export function useCorpus(): CorpusContextValue {
  return useContext(CorpusContext);
}

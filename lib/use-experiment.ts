"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runExperiment, type Dataset, type ExperimentResult, type GridInput } from "@/src/core";
import type { WorkerRequest, WorkerResponse } from "./experiment.worker";

export type ExperimentStatus = "idle" | "running" | "done" | "error";

export interface ExperimentState {
  status: ExperimentStatus;
  progress: { done: number; total: number; label: string } | null;
  result: ExperimentResult | null;
  error: string | null;
  ms: number | null;
}

const IDLE: ExperimentState = { status: "idle", progress: null, result: null, error: null, ms: null };

/**
 * Runs experiments in a Web Worker so the page stays responsive while a grid of configurations is
 * evaluated. Cancelling terminates the worker. Falls back to the main thread where workers are
 * unavailable.
 */
export function useExperiment() {
  const [state, setState] = useState<ExperimentState>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const runId = useRef(0);

  const dispose = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => dispose, [dispose]);

  const run = useCallback(
    (dataset: Dataset, grid: GridInput) => {
      const id = ++runId.current;
      dispose();
      setState((s) => ({ ...s, status: "running", progress: null, error: null }));

      const onMessage = (msg: WorkerResponse) => {
        if (msg.id !== runId.current) return;
        if (msg.type === "progress") {
          setState((s) => ({ ...s, progress: { done: msg.done, total: msg.total, label: msg.label } }));
        } else if (msg.type === "done") {
          setState({ status: "done", progress: null, result: msg.result, error: null, ms: msg.ms });
          dispose();
        } else {
          setState((s) => ({ ...s, status: "error", progress: null, error: msg.message }));
          dispose();
        }
      };

      if (typeof Worker === "undefined") {
        const started = performance.now();
        runExperiment(dataset, grid, {
          onProgress: (done, total, label) => onMessage({ type: "progress", id, done, total, label }),
        })
          .then((result) => onMessage({ type: "done", id, result, ms: performance.now() - started }))
          .catch((e: unknown) => onMessage({ type: "error", id, message: e instanceof Error ? e.message : String(e) }));
        return;
      }

      const worker = new Worker(new URL("./experiment.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => onMessage(event.data);
      worker.onerror = (event) => onMessage({ type: "error", id, message: event.message || "Worker error" });
      const request: WorkerRequest = { type: "run", id, dataset, grid };
      worker.postMessage(request);
    },
    [dispose],
  );

  const cancel = useCallback(() => {
    runId.current++;
    dispose();
    setState((s) => ({ ...s, status: s.result ? "done" : "idle", progress: null }));
  }, [dispose]);

  return { ...state, run, cancel };
}

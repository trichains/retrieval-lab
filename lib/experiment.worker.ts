import { runExperiment, type Dataset, type ExperimentResult, type GridInput } from "@/src/core";

/** Messages between the Experiments view and this worker. */
export type WorkerRequest = { type: "run"; id: number; dataset: Dataset; grid: GridInput };
export type WorkerResponse =
  | { type: "progress"; id: number; done: number; total: number; label: string }
  | { type: "done"; id: number; result: ExperimentResult; ms: number }
  | { type: "error"; id: number; message: string };

// Typed narrowly instead of pulling in the whole "webworker" lib, which conflicts with "dom".
const scope = globalThis as unknown as {
  postMessage(message: WorkerResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
};

scope.addEventListener("message", async (event) => {
  const request = event.data;
  if (request.type !== "run") return;
  const started = performance.now();
  try {
    const result = await runExperiment(request.dataset, request.grid, {
      onProgress: (done, total, label) => scope.postMessage({ type: "progress", id: request.id, done, total, label }),
    });
    scope.postMessage({ type: "done", id: request.id, result, ms: performance.now() - started });
  } catch (error) {
    scope.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

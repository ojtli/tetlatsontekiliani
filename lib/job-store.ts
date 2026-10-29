/**
 * Server-side in-memory job store.
 * A single job can run at a time; the SSE stream and the DELETE cancellation
 * handler both read/write this shared state.
 */

import { JobStatus } from "./types";

export type JobStore = {
  status: JobStatus;
  abortController: AbortController | null;
};

// Module-level singleton (survives hot-reload in dev via globalThis)
const g = globalThis as typeof globalThis & { __TetlatsontekilianiJobStore?: JobStore };

if (!g.__TetlatsontekilianiJobStore) {
  g.__TetlatsontekilianiJobStore = {
    status: {
      state: "idle",
      totalInputs: 0,
      completedInputs: 0,
      currentInput: null,
      startTime: null,
      elapsedMs: 0,
      savedFilename: null,
      selectedProviders: [],
      errors: [],
    },
    abortController: null,
  };
}

export const jobStore: JobStore = g.__TetlatsontekilianiJobStore!;

export function resetJobStore(selectedProviders: string[], totalInputs: number) {
  jobStore.abortController = new AbortController();
  jobStore.status = {
    state: "running",
    totalInputs,
    completedInputs: 0,
    currentInput: null,
    startTime: new Date().toISOString(),
    elapsedMs: 0,
    savedFilename: null,
    selectedProviders,
    errors: [],
  };
}

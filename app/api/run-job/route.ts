import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { getProvider } from "@/lib/providers";
import { calculateJobSummary } from "@/lib/geo";
import { filterRetryTasks, applyRetryResult, recalculateJobFileSummary } from "@/lib/retry";
import {AggregatorType, GeocodingInput, GeocodingResultEntry, JobResultFile} from "@/lib/types";
import { jobStore, resetJobStore } from "@/lib/job-store";
import { logger } from "@/lib/logger";

// ─── helpers ───────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function loadInputs(): GeocodingInput[] {
  const filePath = path.join(process.cwd(), "data", "inputs-correos.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GeocodingInput[];
}

function saveResults(file: JobResultFile): string {
  const dir = path.join(process.cwd(), "data", "results");
  fs.mkdirSync(dir, { recursive: true });
  const filename = file.filename;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(file, null, 2), "utf-8");
  return filename;
}

// ─── POST — start a new batch job (SSE stream) ─────────────────────────────

export async function POST(req: NextRequest) {
  // Reject if a job is already running
  if (jobStore.status.state === "running") {
    return new Response(
      JSON.stringify({ error: "A job is already running. Cancel it first." }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    providers?: string[];
    aggregator?: AggregatorType;
    models?: Record<string, string>;
    retryFile?: string;
  };
  const selectedProviders: string[] =
    Array.isArray(body.providers) && body.providers.length > 0
      ? body.providers
      : ["google-gemini"];

  const enqueue = (event: string, data: unknown, controller: ReadableStreamDefaultController) => {
    try {
      controller.enqueue(encoder.encode(sse(event, data)));
    } catch {
      // stream already closed or client disconnected
    }
  };

  // ─── RETRIAL MODE ────────────────────────────────────────────────────────
  if (body.retryFile) {
    const safeFilename = path.basename(decodeURIComponent(body.retryFile));
    if (!safeFilename.endsWith(".json")) {
      return new Response(JSON.stringify({ error: "Invalid retry filename" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const dir = path.join(process.cwd(), "data", "results");
    const filePath = path.join(dir, safeFilename);
    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: `File not found: ${safeFilename}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let existingFile: JobResultFile;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      existingFile = JSON.parse(raw) as JobResultFile;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `Failed to read ${safeFilename}: ${msg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Constrain retrial only to providers that were actually part of this run file
    const validRetryProviders = selectedProviders.filter((p) =>
      existingFile.providers.includes(p)
    );

    if (validRetryProviders.length === 0) {
      return new Response(
        JSON.stringify({
          error: `None of the selected providers (${selectedProviders.join(", ")}) exist in ${safeFilename}. Available providers in this run: ${existingFile.providers.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tasks = filterRetryTasks(existingFile.results, validRetryProviders, existingFile.providers);
    resetJobStore(validRetryProviders, tasks.length);

    const encoder = new TextEncoder();
    const abortController = jobStore.abortController!;

    logger.info(
      `Starting retrial for ${tasks.length} failed inputs in ${safeFilename} with providers: ${validRetryProviders.join(", ")}`
    );

    if (tasks.length === 0) {
      jobStore.status.state = "completed";
      const emptyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              sse("status", { ...jobStore.status }) +
              sse("done", {
                state: "completed",
                totalInputs: 0,
                completedInputs: 0,
                elapsedMs: 0,
                savedFilename: safeFilename,
                errors: [
                  `No failed inputs found to retry for provider(s): ${selectedProviders.join(", ")} in ${safeFilename}`,
                ],
              })
            )
          );
          try {
            controller.close();
          } catch {}
        },
      });

      return new Response(emptyStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const heartbeatInterval = setInterval(() => {
          enqueue("ping", { timestamp: Date.now() }, controller);
        }, 10000);

        enqueue("status", { ...jobStore.status }, controller);

        const startMs = Date.now();

        try {
          for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (abortController.signal.aborted) break;

            jobStore.status.currentInput = task.entry.input;
            logger.info(`[Retrial ${i + 1}/${tasks.length}] Retrying: "${task.entry.input.slice(0, 80)}"`);

            enqueue("progress", {
              currentInput: task.entry.input,
              completedInputs: jobStore.status.completedInputs,
              totalInputs: jobStore.status.totalInputs,
              elapsedMs: Date.now() - startMs,
            }, controller);

            await Promise.all(
              task.failedProviders.map(async (pid) => {
                if (abortController.signal.aborted) return;
                const adapter = getProvider(pid);
                if (!adapter) return;

                try {
                  const newPr = await adapter.geocode(task.entry.input, task.entry.expectedResult, {
                    aggregator: body.aggregator,
                    model: body.models?.[pid],
                  });

                  // Only if expectedResult is not null and result is not nullish.
                  // Each retry updates only its own provider data.
                  applyRetryResult(task.entry, newPr);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  logger.error(`Retrial geocoding error for ${pid}: ${msg}`);
                }
              })
            );

            jobStore.status.completedInputs += 1;
            jobStore.status.elapsedMs = Date.now() - startMs;

            enqueue("result", {
              entry: task.entry,
              completedInputs: jobStore.status.completedInputs,
              totalInputs: jobStore.status.totalInputs,
              elapsedMs: jobStore.status.elapsedMs,
            }, controller);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Error during retrial execution: ${msg}`);
          jobStore.status.errors.push(msg);
          jobStore.status.state = "error";
          enqueue("error", { error: msg }, controller);
        } finally {
          clearInterval(heartbeatInterval);
        }

        const wasCancelled = abortController.signal.aborted;
        const isError = jobStore.status.state === "error";

        jobStore.status.state = wasCancelled ? "cancelled" : isError ? "error" : "completed";
        jobStore.status.elapsedMs = Date.now() - startMs;
        jobStore.status.currentInput = null;

        // Recalculate summary values and persist changes back to the original file
        try {
          const updatedSummary = recalculateJobFileSummary(
            existingFile,
            jobStore.status.elapsedMs,
            body.models
          );
          existingFile.summary = updatedSummary;
          existingFile.completedAt = new Date().toISOString();
          if (body.models) {
            existingFile.providerModels = {
              ...(existingFile.providerModels || {}),
              ...body.models,
            };
          }
          fs.writeFileSync(filePath, JSON.stringify(existingFile, null, 2), "utf-8");
          logger.info(`Retrial completed and saved to ${safeFilename}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          jobStore.status.errors.push(`Failed to recalculate and save summary: ${msg}`);
        }

        enqueue("done", {
          state: jobStore.status.state,
          totalInputs: jobStore.status.totalInputs,
          completedInputs: jobStore.status.completedInputs,
          elapsedMs: jobStore.status.elapsedMs,
          savedFilename: safeFilename,
          errors: jobStore.status.errors,
        }, controller);

        try {
          controller.close();
        } catch {}
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  }

  // ─── STANDARD BATCH RUN ──────────────────────────────────────────────────
  let inputs: GeocodingInput[];
  try {
    inputs = loadInputs();
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new Error("Input file (data/inputs-correos.json) is empty or does not contain an array");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to load benchmark inputs: ${msg}`);
    return new Response(
      JSON.stringify({ error: `Failed to load benchmark inputs (data/inputs-correos.json): ${msg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  resetJobStore(selectedProviders, inputs.length);

  const encoder = new TextEncoder();
  const abortController = jobStore.abortController!;

  logger.info(`Starting batch job for ${inputs.length} inputs with providers: ${selectedProviders.join(", ")}`);

  const stream = new ReadableStream({
    async start(controller) {
      // Periodic SSE heartbeat (every 10s) to keep TCP and proxies alive during slow providers like LM Studio (60s+)
      const heartbeatInterval = setInterval(() => {
        enqueue("ping", { timestamp: Date.now() }, controller);
      }, 10000);

      enqueue("status", { ...jobStore.status }, controller);

      const allResults: GeocodingResultEntry[] = [];
      const startMs = Date.now();

      try {
        for (let i = 0; i < inputs.length; i++) {
          const entry = inputs[i];
          if (abortController.signal.aborted) break;

          jobStore.status.currentInput = entry.input;
          logger.info(`[Job Input ${i + 1}/${inputs.length}] Starting: "${entry.input.slice(0, 80)}"`);

          enqueue("progress", {
            currentInput: entry.input,
            completedInputs: jobStore.status.completedInputs,
            totalInputs: jobStore.status.totalInputs,
            elapsedMs: Date.now() - startMs,
          }, controller);

          const providerResults = await Promise.all(
          selectedProviders.map(async (pid) => {
            if (abortController.signal.aborted) {
              return {
                provider: pid,
                result: null,
                durationMs: 0,
                distanceMeters: null,
                error: "Cancelled",
              };
            }
            const adapter = getProvider(pid);
            if (!adapter) {
              return {
                provider: pid,
                result: null,
                durationMs: 0,
                distanceMeters: null,
                error: `Unknown provider: ${pid}`,
              };
            }
            try {
              return await adapter.geocode(entry.input, entry.expectedResult, {
                aggregator: body.aggregator,
                model: body.models?.[pid],
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                provider: pid,
                result: null,
                durationMs: 0,
                distanceMeters: null,
                error: msg,
              };
            }
          })
        );

        const resultEntry: GeocodingResultEntry = {
          input: entry.input,
          expectedResult: entry.expectedResult,
          providersResults: providerResults,
        };
        allResults.push(resultEntry);

        jobStore.status.completedInputs += 1;
        jobStore.status.elapsedMs = Date.now() - startMs;

        enqueue("result", {
          entry: resultEntry,
          completedInputs: jobStore.status.completedInputs,
          totalInputs: jobStore.status.totalInputs,
          elapsedMs: jobStore.status.elapsedMs,
        }, controller);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error during batch job execution: ${msg}`);
        jobStore.status.errors.push(msg);
        jobStore.status.state = "error";
        enqueue("error", { error: msg }, controller);
      } finally {
        clearInterval(heartbeatInterval);
      }

      const completedAt = new Date().toISOString();
      const wasCancelled = abortController.signal.aborted;
      const isError = jobStore.status.state === "error";

      jobStore.status.state = wasCancelled ? "cancelled" : isError ? "error" : "completed";
      jobStore.status.elapsedMs = Date.now() - startMs;
      jobStore.status.currentInput = null;

      // Collect active models per provider (if applicable)
      const providerModels: Record<string, string> = {};
      selectedProviders.forEach((pid) => {
        if (body.models?.[pid]) {
          providerModels[pid] = body.models[pid];
        } else {
          const adapter = getProvider(pid);
          if (adapter?.model) {
            providerModels[pid] = adapter.model;
          }
        }
      });

      // Precompute summary metrics right at the end of the server job
      const summary = calculateJobSummary(allResults, selectedProviders, jobStore.status.elapsedMs);
      if (summary) {
        Object.entries(providerModels).forEach(([pid, model]) => {
          if (summary.providers[pid]) {
            summary.providers[pid].model = model;
          }
        });
      }

      // Persist results file
      const filename = `results-${Date.now()}.json`;
      const resultFile: JobResultFile = {
        filename,
        startedAt: jobStore.status.startTime!,
        completedAt,
        providers: selectedProviders,
        providerModels: Object.keys(providerModels).length > 0 ? providerModels : undefined,
        results: allResults,
        summary,
      };

      let savedFilename: string | null = null;
      if (allResults.length > 0) {
        try {
          savedFilename = saveResults(resultFile);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          jobStore.status.errors.push(`Failed to save results: ${msg}`);
        }
      }

      logger.info(
        `Job completed in ${Math.round(jobStore.status.elapsedMs / 1000)}s with state '${jobStore.status.state}' (Saved: ${savedFilename})`
      );

      enqueue("done", {
        state: jobStore.status.state,
        totalInputs: jobStore.status.totalInputs,
        completedInputs: jobStore.status.completedInputs,
        elapsedMs: jobStore.status.elapsedMs,
        savedFilename,
        errors: jobStore.status.errors,
      }, controller);

      try {
        controller.close();
      } catch {
        // stream may already be closed
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

// ─── DELETE — cancel running job ────────────────────────────────────────────

export async function DELETE() {
  if (jobStore.status.state !== "running") {
    return Response.json({ message: "No job is currently running." }, { status: 200 });
  }
  jobStore.abortController?.abort();
  jobStore.status.state = "cancelled";
  return Response.json({ message: "Job cancelled." });
}

// ─── GET — current job status ───────────────────────────────────────────────

export async function GET() {
  return Response.json({ status: jobStore.status });
}

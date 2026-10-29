"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AggregatorType,
  DoneEvent,
  GeocodingResultEntry,
  JobResultFile,
  JobState,
  ProviderConfigStatus
} from "@/lib/types";
import { ResultFileInfo } from "@/app/api/results/route";
import { countFailedResultsByProvider, filterRetryTasks } from "@/lib/retry";
import { formatResultFileOptionLabel } from "@/lib/compare";
import { ModelDefinition } from "@/lib/models";
import {PROVIDER_COLORS} from "@/lib/constants.ts";

// ─── types ──────────────────────────────────────────────────────────────────

interface LiveProgress {
  currentInput: string;
  completedInputs: number;
  totalInputs: number;
  elapsedMs: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtDist(meters: number | null): string {
  if (meters === null) return "—";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

function accuracyLabel(meters: number | null) {
  if (meters === null) return null;
  if (meters <= 100)
    return { label: "Excellent", cls: "bg-success/20 text-success border-success/30" };
  if (meters <= 1000)
    return { label: "Moderate", cls: "bg-warning/20 text-warning border-warning/30" };
  return { label: "High Error", cls: "bg-danger/20 text-danger border-danger/30" };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function BatchJobRunner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retryParam = searchParams.get("retryFile");

  const [availableFiles, setAvailableFiles] = useState<ResultFileInfo[]>([]);
  const [activeRetryFilename, setActiveRetryFilename] = useState<string>(retryParam || "");
  const [mode, setMode] = useState<"standard" | "retrial">(retryParam ? "retrial" : "standard");

  const [retryFile, setRetryFile] = useState<JobResultFile | null>(null);
  const [retryFailedCounts, setRetryFailedCounts] = useState<Record<string, number>>({});

  const [providers, setProviders] = useState<ProviderConfigStatus[]>([]);
  const [models, setModels] = useState<Record<string, ModelDefinition[]>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [aggregator, setAggregator] = useState<AggregatorType>("direct");
  const [openRouterConfigured, setOpenRouterConfigured] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobState, setJobState] = useState<JobState>("idle");
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [results, setResults] = useState<GeocodingResultEntry[]>([]);
  const [doneInfo, setDoneInfo] = useState<DoneEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackingFilter, setTrackingFilter] = useState<"retried-only" | "all">("retried-only");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  // Retrial mode is active when mode is retrial AND a file is selected
  const isRetrialMode = mode === "retrial" && Boolean(activeRetryFilename);
  const isLoadingRetryFile = isRetrialMode && Boolean(activeRetryFilename) && (!retryFile || retryFile.filename !== activeRetryFilename);
  const effectiveRetryFile = isRetrialMode && !isLoadingRetryFile ? retryFile : null;
  const retriableTasks = effectiveRetryFile
    ? filterRetryTasks(effectiveRetryFile.results, Array.from(selectedIds), effectiveRetryFile.providers)
    : [];
  const totalFailedSelected = retriableTasks.length;

  // Load available result files list from server
  useEffect(() => {
    fetch(`/api/results?t=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.files)) {
          setAvailableFiles(data.files);
          if (!retryParam && data.files.length > 0 && !activeRetryFilename) {
            setActiveRetryFilename(data.files[0].filename);
          }
        }
      })
      .catch(console.error);
  }, [retryParam, activeRetryFilename]);

  // Load retry file content when in retrial mode and activeRetryFilename changes
  useEffect(() => {
    if (!isRetrialMode || !activeRetryFilename) {
      return;
    }

    let isCancelled = false;
    fetch(`/api/results/${encodeURIComponent(activeRetryFilename)}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: JobResultFile | null) => {
        if (isCancelled) return;
        if (data) {
          setRetryFile(data);
          const counts = countFailedResultsByProvider(data.results, data.providers, data.providers);
          setRetryFailedCounts(counts);

          // Pre-select providers that actually have failed results in this file
          const failedProviders = Object.keys(counts).filter((pid) => (counts[pid] || 0) > 0);
          setSelectedIds(new Set(failedProviders.length > 0 ? failedProviders : data.providers));

          if (data.providerModels) {
            setSelectedModels((prev) => ({
              ...prev,
              ...data.providerModels,
            }));
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load retry file:", err);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isRetrialMode, activeRetryFilename]);

  // Load provider list and models on mount
  useEffect(() => {
    fetch(`/api/test-provider?t=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
          // If not in retrial mode, pre-select all configured providers
          if (!retryParam) {
            const configured = (data.providers as ProviderConfigStatus[])
              .filter((p) => p.isConfigured)
              .map((p) => p.id);
            setSelectedIds(new Set(configured));
          }
        }
        if (data.models) {
          setModels(data.models);
          // Initialize selected models with default options
          const initialModels: Record<string, string> = {};
          Object.entries(data.models as Record<string, ModelDefinition[]>).forEach(([pid, mList]) => {
            const def = mList.find((m) => m.isDefault)?.id || mList[0]?.id;
            if (def) initialModels[pid] = def;
          });
          setSelectedModels((prev) => ({
            ...initialModels,
            ...prev,
          }));
        }
        if (typeof data.openRouterConfigured === "boolean") {
          setOpenRouterConfigured(data.openRouterConfigured);
        }
      })
      .catch(console.error);
  }, [retryParam]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const toggleProvider = (id: string) => {
    if (isRetrialMode && retryFile && !retryFile.providers.includes(id)) {
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (id === "nvidia") {
          setAggregator("openrouter");
        }
      }
      return next;
    });
  };

  const handleModelChange = (providerId: string, modelId: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [providerId]: modelId,
    }));
  };

  const startTimer = () => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 250);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSwitchMode = (newMode: "standard" | "retrial") => {
    if (isRunning) return;
    setMode(newMode);
    if (newMode === "standard") {
      router.replace("/run-job");
      setRetryFile(null);
      setRetryFailedCounts({});
      // Restore default configured providers
      const configured = providers.filter((p) => p.isConfigured).map((p) => p.id);
      setSelectedIds(new Set(configured));
    } else {
      let targetFile = activeRetryFilename;
      if (!targetFile && availableFiles.length > 0) {
        targetFile = availableFiles[0].filename;
        setActiveRetryFilename(targetFile);
      }
      if (targetFile) {
        router.replace(`/run-job?retryFile=${encodeURIComponent(targetFile)}`);
      }
    }
  };

  const handleSelectRetryFile = (filename: string) => {
    if (isRunning) return;
    setActiveRetryFilename(filename);
    setRetryFile(null);
    setRetryFailedCounts({});
    router.replace(`/run-job?retryFile=${encodeURIComponent(filename)}`);
  };

  const handleStart = async () => {
    if (selectedIds.size === 0) return;
    if (isRetrialMode && (isLoadingRetryFile || !retryFile || totalFailedSelected === 0)) return;

    // Reset state
    setJobState("running");
    setProgress(null);
    setResults([]);
    setDoneInfo(null);
    setErrorMessage(null);
    setElapsedMs(0);
    startTimer();

    try {
      // POST to start the job — the response IS the SSE stream
      // EventSource doesn't support POST, so we use fetch + ReadableStream
      const response = await fetch("/api/run-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retryFile: isRetrialMode && activeRetryFilename ? activeRetryFilename : undefined,
          providers: Array.from(selectedIds),
          aggregator,
          models: selectedModels,
        }),
      });

      if (!response.ok) {
        let errorMsg = `Server returned HTTP ${response.status}: ${response.statusText || "Failed to start batch job"}`;
        try {
          const errorJson = await response.json();
          if (errorJson && typeof errorJson.error === "string") {
            errorMsg = errorJson.error;
          } else if (errorJson && typeof errorJson.message === "string") {
            errorMsg = errorJson.message;
          }
        } catch {
          try {
            const text = await response.text();
            if (text && text.trim()) errorMsg = text.trim();
          } catch {
            // keep default errorMsg
          }
        }
        setErrorMessage(errorMsg);
        setJobState("error");
        stopTimer();
        return;
      }

      if (!response.body) {
        setErrorMessage("Server response stream body is empty or unavailable.");
        setJobState("error");
        stopTimer();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasReceivedDone = false;
      let hasReceivedError = false;

      const parseEvents = (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.trim()) continue;
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventName = eventMatch[1];
          let payload: unknown;
          try {
            payload = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }

          if (eventName === "progress") {
            setProgress(payload as LiveProgress);
          } else if (eventName === "result") {
            const p = payload as { entry: GeocodingResultEntry };
            setResults((prev) => [...prev, p.entry]);
            setProgress((prev) =>
              prev
                ? {
                    ...prev,
                    completedInputs: (payload as { completedInputs: number }).completedInputs,
                    elapsedMs: (payload as { elapsedMs: number }).elapsedMs,
                  }
                : null
            );
          } else if (eventName === "done") {
            hasReceivedDone = true;
            const done = payload as DoneEvent;
            setDoneInfo(done);
            if (done.state === "error") {
              setJobState("error");
              setErrorMessage(
                done.errors && done.errors.length > 0
                  ? done.errors.join("; ")
                  : "Batch job failed on the server."
              );
            } else {
              setJobState(done.state === "cancelled" ? "cancelled" : "completed");
            }
            stopTimer();
            setElapsedMs(done.elapsedMs);
          } else if (eventName === "error") {
            hasReceivedError = true;
            const errPayload = payload as { error?: string; message?: string };
            setErrorMessage(
              errPayload.error || errPayload.message || "An error occurred during batch job execution."
            );
            setJobState("error");
            stopTimer();
          }
        }
      };

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parseEvents(decoder.decode(value, { stream: true }));
      }

      // If stream ended without a done or error event (e.g. dropped connection)
      if (!hasReceivedDone && !hasReceivedError) {
        setJobState("error");
        setErrorMessage("Connection to benchmark server closed unexpectedly before the job finished.");
        stopTimer();
      }
    } catch (err: unknown) {
      console.error("Batch job execution error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Request failed: ${msg}`);
      setJobState("error");
      stopTimer();
    }
  };

  const handleCancel = async () => {
    try {
      await fetch("/api/run-job", { method: "DELETE" });
    } catch (err) {
      console.warn("Failed to send cancel signal:", err);
    }
    stopTimer();
    setJobState("cancelled");
  };

  const configuredCount = providers.filter((p) => p.isConfigured).length;
  const isRunning = jobState === "running";
  const progressPct =
    progress && progress.totalInputs > 0
      ? Math.round((progress.completedInputs / progress.totalInputs) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-xl space-y-5">
      {/* Run Mode Selector: Standard vs Retrial */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-surface-elevated/60 border border-border">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-border shrink-0">
          <button
            type="button"
            id="tab-mode-standard"
            onClick={() => handleSwitchMode("standard")}
            disabled={isRunning}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              !isRetrialMode
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:text-foreground"
            } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span>⚡</span>
            <span>Standard Batch Run</span>
          </button>
          <button
            type="button"
            id="tab-mode-retrial"
            onClick={() => handleSwitchMode("retrial")}
            disabled={isRunning}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              isRetrialMode
                ? "bg-amber-600 text-white shadow-sm"
                : "text-muted hover:text-foreground"
            } ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span>🔄</span>
            <span>Retrial Mode</span>
          </button>
        </div>

        {/* When in Retrial Mode, show file selector */}
        {isRetrialMode && (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="retrial-file-select" className="text-muted font-medium shrink-0">
              Target File:
            </label>
            <select
              id="retrial-file-select"
              value={activeRetryFilename}
              onChange={(e) => handleSelectRetryFile(e.target.value)}
              disabled={isRunning || availableFiles.length === 0}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 truncate max-w-[280px]"
            >
              {availableFiles.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {formatResultFileOptionLabel(f)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Retrial Mode Notice Banner */}
      {isRetrialMode && (
        <div
          id="retrial-mode-banner"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 animate-fadeIn"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🔄</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                    Retrial Mode Active
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-200 border border-amber-500/30 font-medium font-mono">
                    {isLoadingRetryFile
                      ? "Loading file…"
                      : `${totalFailedSelected} ${totalFailedSelected === 1 ? "failed item" : "failed items"} selected`}
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Retrying failed results from <span className="font-mono text-foreground font-medium">{activeRetryFilename}</span> (reading failed entries from previous results, not data/inputs.json)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchMode("standard")}
              disabled={isRunning}
              className="self-start sm:self-auto px-2.5 py-1 rounded-lg border border-border text-xs text-muted hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              Exit Retrial Mode ✕
            </button>
          </div>
          <div className="text-[11px] text-muted leading-relaxed bg-surface/60 p-2.5 rounded-lg border border-border/40">
            ℹ️ <strong>Retrial Conditions:</strong> Only failed results where expected coordinates exist (<code>expectedResult is not null</code>) are retried. When a retry produces coordinates (<code>result is not nullish</code>), only that provider&apos;s data will be updated. Summary metrics will be recalculated when the retrial finishes.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{isRetrialMode ? "🔄" : "🚀"}</span>
            <h2 className="text-lg font-semibold text-foreground">
              {isRetrialMode ? "Batch Job Runner (Retrial Mode)" : "Batch Job Runner"}
            </h2>
            <span
              className={`px-2 py-0.5 rounded-full font-medium text-xs ${
                isRetrialMode
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-accent-muted text-accent"
              }`}
            >
              {isRetrialMode ? "Retrial Active" : "Benchmark Runner"}
            </span>
          </div>
          <p className="text-muted mt-1 text-xs sm:text-sm">
            {isRetrialMode ? (
              <>
                Retrying failed benchmark results from <code className="text-foreground">{activeRetryFilename}</code> (reading failed entries from previous results, not data/inputs.json). Pick which provider(s) should be retried below.
              </>
            ) : (
              <>
                Run all {providers.length > 0 ? `${providers.length}` : ""} providers against every
                address in <code className="text-foreground">data/inputs-correos.json</code>. Results are saved
                to <code className="text-foreground">data/results/</code>.
              </>
            )}
          </p>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {jobState === "idle" && (
            <span className="px-2 py-1 rounded-full border border-border text-muted">
              Idle
            </span>
          )}
          {jobState === "running" && (
            <span className="px-2 py-1 rounded-full border border-accent/40 bg-accent/10 text-accent animate-pulse">
              Running — {fmtMs(elapsedMs)}
            </span>
          )}
          {jobState === "completed" && (
            <span className="px-2 py-1 rounded-full border border-success/40 bg-success/10 text-success">
              ✓ Completed in {fmtMs(doneInfo?.elapsedMs ?? elapsedMs)}
            </span>
          )}
          {jobState === "cancelled" && (
            <span className="px-2 py-1 rounded-full border border-warning/40 bg-warning/10 text-warning">
              ⚠ Cancelled
            </span>
          )}
          {jobState === "error" && (
            <span className="px-2 py-1 rounded-full border border-danger/40 bg-danger/10 text-danger">
              ✕ Error
            </span>
          )}
        </div>
      </div>

      {/* Provider selector */}
      <div>
        <label className="block font-semibold uppercase tracking-wider text-muted mb-2">
          {isRetrialMode ? "Pick Providers to Retry" : "Select Providers to Include"}
          <span className="ml-1.5 text-muted/60 font-normal normal-case">
            ({selectedIds.size} selected {isRetrialMode ? "for retrial" : `· ${configuredCount} configured`})
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {providers.map((p) => {
            const isSel = selectedIds.has(p.id);
            const provModels = models[p.id] || [];
            const hasModels = provModels.length > 0;
            const currentModel =
              selectedModels[p.id] ||
              provModels.find((m) => m.isDefault)?.id ||
              provModels[0]?.id ||
              "";
            const activeModelDef = provModels.find((m) => m.id === currentModel);
            const failedCount = retryFailedCounts[p.id] ?? 0;
            const isInRun = !isRetrialMode || (retryFile?.providers?.includes(p.id) ?? false);
            const isProvDisabled = isRunning || (isRetrialMode && !isInRun);

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => !isProvDisabled && toggleProvider(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (!isProvDisabled) toggleProvider(p.id);
                  }
                }}
                className={`flex flex-col justify-between p-3 rounded-xl border transition-all ${
                  isProvDisabled
                    ? "opacity-40 cursor-not-allowed bg-surface/40 border-border/40"
                    : isSel
                    ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30 cursor-pointer"
                    : "border-border hover:border-border-hover bg-surface-elevated/40 opacity-75 cursor-pointer"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={isSel && (!isRetrialMode || isInRun)}
                        onChange={() => !isProvDisabled && toggleProvider(p.id)}
                        disabled={isProvDisabled}
                        className="rounded border-border text-accent focus:ring-accent cursor-pointer disabled:cursor-not-allowed"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="font-semibold text-sm text-foreground truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!p.isConfigured && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30">
                          ⚠ Key
                        </span>
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PROVIDER_COLORS[p.id] ?? p.color }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted block uppercase tracking-wider pl-6">
                    {p.type.toUpperCase()} • {p.modelOrEndpoint || p.description}
                  </span>
                  {isRetrialMode && (
                    <div className="mt-1 pl-6 flex items-center gap-1.5 flex-wrap">
                      {!isInRun ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border/50 text-muted italic font-mono">
                          Not in this run
                        </span>
                      ) : failedCount > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold font-mono">
                          🔄 {failedCount} {failedCount === 1 ? "failed item" : "failed items"} to retry
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted font-mono">
                          ✓ 0 failed results
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {hasModels ? (
                  <div className="mt-2.5 pt-2 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-semibold text-muted">
                        Model
                      </label>
                      {isSel && (
                        <span className="text-[9px] text-muted font-mono truncate max-w-[120px]">
                          {aggregator === "openrouter" && p.type === "llm"
                            ? activeModelDef?.openRouterModelId || currentModel
                            : activeModelDef?.directModelId || currentModel}
                        </span>
                      )}
                    </div>
                    <select
                      value={currentModel}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleModelChange(p.id, e.target.value);
                      }}
                      disabled={isRunning}
                      className="w-full text-xs px-2 py-1.5 rounded-md bg-surface border border-border focus:border-accent focus:outline-none text-foreground font-medium"
                    >
                      {provModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-2.5 pt-2 border-t border-border/30">
                    <span className="text-[10px] text-muted italic">Standard API Geocoder</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Routing Mode for LLMs */}
      <div className="rounded-xl border border-border/80 bg-surface-elevated/40 p-4 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-muted text-[11px]">
              LLM Query Routing Mode
            </label>
            <p className="text-[12px] text-muted">
              Choose whether LLM providers query direct provider APIs or route via OpenRouter (Nvidia routes exclusively via OpenRouter).
            </p>
          </div>
          <span
            className={`text-[10px] px-2.5 py-1 rounded-full border shrink-0 ${
              aggregator === "openrouter"
                ? openRouterConfigured
                  ? "bg-success/10 border-success/30 text-success"
                  : "bg-warning/10 border-warning/30 text-warning"
                : "bg-surface border-border text-muted"
            }`}
          >
            {aggregator === "openrouter"
              ? openRouterConfigured
                ? "OpenRouter Ready"
                : "OPENROUTER_API_KEY Missing"
              : "Direct Provider APIs"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => !isRunning && setAggregator("direct")}
            disabled={isRunning}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
              aggregator === "direct"
                ? "border-accent bg-accent/15 text-foreground shadow-sm"
                : "border-border hover:border-border-hover bg-surface text-muted hover:text-foreground"
            } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span className="text-sm">🔌</span>
            <span>Direct Provider APIs</span>
          </button>
          <button
            type="button"
            onClick={() => !isRunning && setAggregator("openrouter")}
            disabled={isRunning}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
              aggregator === "openrouter"
                ? "border-accent bg-accent/15 text-foreground shadow-sm"
                : "border-border hover:border-border-hover bg-surface text-muted hover:text-foreground"
            } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span className="text-sm">🌐</span>
            <span>OpenRouter Aggregator</span>
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={
            isRunning ||
            selectedIds.size === 0 ||
            (isRetrialMode && (isLoadingRetryFile || !retryFile || totalFailedSelected === 0))
          }
          className={`cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${
            isRetrialMode
              ? "bg-amber-600 hover:bg-amber-500"
              : "bg-accent hover:bg-accent-hover"
          }`}
        >
          {isRunning ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>
                {isRetrialMode ? "Running Retrial…" : "Running…"} {progress ? `${progress.completedInputs}/${progress.totalInputs}` : "0/0"}
              </span>
            </>
          ) : isRetrialMode ? (
            isLoadingRetryFile ? (
              <span>Loading result file…</span>
            ) : totalFailedSelected === 0 ? (
              <span>No failed results to retry</span>
            ) : (
              <span>
                🔄 Start Retrial ({totalFailedSelected} {totalFailedSelected === 1 ? "item" : "items"})
              </span>
            )
          ) : (
            <span>⚡ Start Batch Job</span>
          )}
        </button>
        {isRunning && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-2.5 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/50 transition-colors"
          >
            ✕ Cancel
          </button>
        )}
      </div>

      {selectedIds.size === 0 && !isRunning && (
        <p className="text-warning flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Please select at least one provider to start the job.</span>
        </p>
      )}

      {isRetrialMode && selectedIds.size > 0 && totalFailedSelected === 0 && !isRunning && (
        <p className="text-amber-400 flex items-center gap-1.5 text-xs">
          <span>ℹ️</span>
          <span>None of the selected providers have failed results to retry in this run.</span>
        </p>
      )}

      {/* Error Banner */}
      {jobState === "error" && errorMessage && (
        <div
          id="batch-job-error-banner"
          className="rounded-xl border border-danger/40 bg-danger/10 p-4 space-y-3 animate-fadeIn"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">⚠️</span>
              <div>
                <h4 className="font-bold text-danger text-sm">
                  Benchmark Job Failed
                </h4>
                <p className="text-muted text-[13px] mt-0.5">
                  The server encountered an error while starting or running the job.
                </p>
                <div className="mt-2 p-3 rounded-lg bg-surface/90 border border-danger/30 font-mono text-[12px] text-danger break-words whitespace-pre-wrap select-text leading-relaxed">
                  {errorMessage}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setJobState("idle");
                setErrorMessage(null);
              }}
              className="px-2.5 py-1 rounded-lg border border-danger/30 text-danger hover:bg-danger/20 text-[12px] font-medium transition-colors shrink-0 cursor-pointer"
            >
              Dismiss ✕
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={handleStart}
              disabled={selectedIds.size === 0}
              className="px-3.5 py-1.5 rounded-lg bg-danger text-white text-[12px] font-semibold hover:bg-danger/90 transition-colors cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>Retry Batch Job</span>
            </button>
            <span className="text-[11px] text-muted">
              Verify that <code className="text-foreground">data/inputs-correos.json</code> contains valid JSON syntax and that the server is operational.
            </span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {isRunning && progress && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted">
            <span className="truncate max-w-[70%]">
              📍 <span className="text-foreground">{progress.currentInput}</span>
            </span>
            <span className="font-mono">{progressPct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Done summary */}
      {(jobState === "completed" || jobState === "cancelled") && doneInfo && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${jobState === "completed"
              ? "bg-success/10 border-success/30"
              : "bg-warning/10 border-warning/30"
            }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className={`font-semibold text-sm ${jobState === "completed" ? "text-success" : "text-warning"}`}>
                {jobState === "completed"
                  ? isRetrialMode
                    ? `✓ Retrial Complete — ${doneInfo.completedInputs} of ${doneInfo.totalInputs} failed items re-evaluated`
                    : `✓ Job Complete — ${doneInfo.completedInputs} of ${doneInfo.totalInputs} addresses processed`
                  : isRetrialMode
                    ? `⚠ Retrial Cancelled — ${doneInfo.completedInputs}/${doneInfo.totalInputs} re-evaluated`
                    : `⚠ Job Cancelled — ${doneInfo.completedInputs}/${doneInfo.totalInputs} processed`}
              </p>
              <p className="text-muted text-[11px] mt-0.5">
                Total runtime: <span className="font-mono text-foreground font-medium">{fmtMs(doneInfo.elapsedMs)}</span>
                {doneInfo.savedFilename && (
                  <>
                    {" "}• File: <code className="text-foreground">{doneInfo.savedFilename}</code>
                    {isRetrialMode && " (data updated & summary recalculated)"}
                  </>
                )}
              </p>
            </div>

            {doneInfo.savedFilename && (
              <Link
                href={`/results?file=${encodeURIComponent(doneInfo.savedFilename)}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition-colors shadow-sm self-start sm:self-auto shrink-0"
              >
                <span>View in Results Tab</span>
                <span>→</span>
              </Link>
            )}
          </div>

          {doneInfo.errors.length > 0 && (
            <p className="text-danger text-[11px]">⚠ {doneInfo.errors.length} error(s) during run</p>
          )}
        </div>
      )}

      {/* Live results table */}
      {results.length > 0 && (() => {
        const availableResultProviders = results[0]?.providersResults.map((pr) => pr.provider) ?? Array.from(selectedIds);
        const tableProviders =
          isRetrialMode && trackingFilter === "retried-only"
            ? availableResultProviders.filter((pid) => selectedIds.has(pid))
            : availableResultProviders;

        return (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table sub-header with retrial tracking filter */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-elevated/40">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Live Tracking ({results.length} {results.length === 1 ? "address" : "addresses"})
              </span>
              {isRetrialMode && availableResultProviders.length > selectedIds.size && (
                <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setTrackingFilter("retried-only")}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                      trackingFilter === "retried-only"
                        ? "bg-amber-500/20 text-amber-300 font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Retried Only ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackingFilter("all")}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                      trackingFilter === "all"
                        ? "bg-surface-elevated text-foreground font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    All File Providers ({availableResultProviders.length})
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/60">
                    <th className="text-left px-3 py-2 text-muted font-semibold uppercase tracking-wider">
                      Address
                    </th>
                    {tableProviders.map((provId) => {
                      const isRetried = selectedIds.has(provId);
                      return (
                        <th
                          key={provId}
                          className="text-center px-3 py-2 font-semibold uppercase tracking-wider"
                          style={{ color: PROVIDER_COLORS[provId] ?? "#888" }}
                        >
                          <div>{provId}</div>
                          {isRetrialMode && (
                            <span
                              className={`block text-[9px] font-normal font-mono ${
                                isRetried ? "text-amber-300" : "text-muted/60"
                              }`}
                            >
                              {isRetried ? "(retried)" : "(original)"}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {results.map((entry, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/40 hover:bg-surface-elevated/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-foreground max-w-[200px] truncate" title={entry.input}>
                        {entry.input}
                      </td>
                      {tableProviders.map((provId) => {
                        const pr = entry.providersResults.find((p) => p.provider === provId);
                        if (!pr) {
                          return (
                            <td key={provId} className="px-3 py-2.5 text-center text-muted">
                              —
                            </td>
                          );
                        }
                        const acc = accuracyLabel(pr.distanceMeters);
                        return (
                          <td key={pr.provider} className="px-3 py-2.5 text-center">
                            {pr.error ? (
                              <span className="text-danger text-[10px]" title={pr.error}>
                                ✕ Error
                              </span>
                            ) : pr.result ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="font-mono text-foreground">
                                  {fmtDist(pr.distanceMeters)}
                                </span>
                                {acc && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${acc.cls}`}
                                  >
                                    {acc.label}
                                  </span>
                                )}
                                <span className="text-muted text-[9px]">{pr.durationMs}ms</span>
                              </div>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* In-flight placeholder row */}
                  {isRunning && progress && progress.completedInputs < progress.totalInputs && (
                    <tr className="border-b border-border/40 animate-pulse">
                      <td className="px-3 py-2.5 text-muted italic truncate max-w-[200px]">
                        {progress.currentInput}
                      </td>
                      {tableProviders.map((provId) => {
                        const isRetried = selectedIds.has(provId);
                        return (
                          <td key={provId} className="px-3 py-2.5 text-center">
                            {isRetried ? (
                              <span className="inline-block w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                            ) : (
                              <span className="text-muted/40 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* curl hint */}
      <div className="pt-2 border-t border-border/60">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1">
          Terminal equivalent:
        </span>
        <div className="bg-background/80 p-2 rounded border border-border text-[10px] font-mono text-muted select-all overflow-x-auto">
          curl -X POST http://localhost:3200/api/run-job \<br />
          &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
          &nbsp;&nbsp;-d &apos;{JSON.stringify({
            ...(isRetrialMode && activeRetryFilename ? { retryFile: activeRetryFilename } : {}),
            providers: Array.from(selectedIds),
            aggregator,
            models: selectedModels,
          })}&apos;
        </div>
      </div>
    </div>
  );
}

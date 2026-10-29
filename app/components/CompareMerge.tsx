"use client";

import { useState, useEffect, useMemo } from "react";
import { ResultFileInfo } from "@/app/api/results/route";
import { JobResultFile } from "@/lib/types";
import { checkMergeCompatibility, MergeCompatibilityResult } from "@/lib/merge";
import { formatResultFileOptionLabel } from "@/lib/compare";
import {getProviderColor} from "@/lib/benchmark-stats.ts";

interface CompareMergeProps {
  files: ResultFileInfo[];
  initialFileA?: string;
  initialFileB?: string;
  onMergeSuccess: (targetFilename: string) => void;
}

export default function CompareMerge({
  files,
  initialFileA,
  initialFileB,
  onMergeSuccess,
}: CompareMergeProps) {
  const [fileAFilename, setFileAFilename] = useState<string>(initialFileA || (files[1]?.filename ?? ""));
  const [fileBFilename, setFileBFilename] = useState<string>(initialFileB || (files[0]?.filename ?? ""));

  const [fileAData, setFileAData] = useState<JobResultFile | null>(null);
  const [fileBData, setFileBData] = useState<JobResultFile | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  const [includeUnmatched, setIncludeUnmatched] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccessInfo, setMergeSuccessInfo] = useState<{
    targetFile: string;
    sourceFile: string;
    isOldFileDeleted: boolean;
    movedProviders: string[];
    mergedInputsCount: number;
    unmatchedInputsRetained: number;
  } | null>(null);

  // Sync initial filenames if changed externally
  useEffect(() => {
    if (initialFileA && !fileAFilename) setFileAFilename(initialFileA);
    if (initialFileB && !fileBFilename) setFileBFilename(initialFileB);
  }, [initialFileA, initialFileB, fileAFilename, fileBFilename]);

  // Load full details of both selected files
  useEffect(() => {
    if (!fileAFilename || !fileBFilename || fileAFilename === fileBFilename) {
      setFileAData(null);
      setFileBData(null);
      return;
    }

    setIsLoadingDetails(true);
    setMergeError(null);
    setMergeSuccessInfo(null);

    Promise.all([
      fetch(`/api/results/${encodeURIComponent(fileAFilename)}?t=${Date.now()}`).then((r) => r.json()),
      fetch(`/api/results/${encodeURIComponent(fileBFilename)}?t=${Date.now()}`).then((r) => r.json()),
    ])
      .then(([dataA, dataB]) => {
        setFileAData(dataA);
        setFileBData(dataB);
      })
      .catch((err) => {
        console.error("Failed to load result files for merge:", err);
        setMergeError("Failed to load result file contents.");
      })
      .finally(() => setIsLoadingDetails(false));
  }, [fileAFilename, fileBFilename]);

  // Evaluate merge compatibility
  const compatibility: MergeCompatibilityResult | null = useMemo(() => {
    if (!fileAData || !fileBData) return null;
    return checkMergeCompatibility(fileAData, fileBData);
  }, [fileAData, fileBData]);

  // Handle execute merge
  const handleExecuteMerge = async () => {
    if (!compatibility?.canMerge || !fileAFilename || !fileBFilename) return;

    setIsMerging(true);
    setMergeError(null);

    try {
      const res = await fetch("/api/results/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileA: fileAFilename,
          fileB: fileBFilename,
          includeUnmatchedFromOld: includeUnmatched,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to merge result files");
      }

      setMergeSuccessInfo(data);
      onMergeSuccess(data.targetFile);
    } catch (err) {
      console.error("Merge error:", err);
      setMergeError(err instanceof Error ? err.message : "Error executing merge");
    } finally {
      setIsMerging(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Unknown date";
    return new Date(dateStr).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-full space-y-4">
      {/* Introduction Card */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔀</span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Merge Benchmark Results</h3>
            <p className="text-muted leading-relaxed">
              Combine partial provider results from two runs. Data is always moved from the older run into the newer run.
              If all data is transferred, the older result file is safely removed.
            </p>
          </div>
        </div>
      </div>

      {/* Selectors Card */}
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <span>1. Select Result Files to Combine</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File A Selector */}
          <div className="p-3.5 rounded-lg border border-border/80 bg-surface-elevated/40 space-y-2">
            <label htmlFor="merge-file-a-select" className="block font-medium text-foreground">
              Run File A:
            </label>
            <select
              id="merge-file-a-select"
              value={fileAFilename}
              onChange={(e) => setFileAFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Select a file...</option>
              {files.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {formatResultFileOptionLabel(f)}
                </option>
              ))}
            </select>

            {fileAData && (
              <div className="pt-2 text-[13px] text-muted space-y-1 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span>Completed:</span>
                  <span className="font-medium text-foreground">{formatDate(fileAData.completedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Inputs:</span>
                  <span className="font-medium text-foreground">{fileAData.results?.length ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span>Providers:</span>
                  {fileAData.providers.map((p) => {
                    const model = fileAData.providerModels?.[p] || fileAData.summary?.providers?.[p]?.model;
                    return (
                      <span
                        key={p}
                        className="px-2 py-0.5 rounded font-mono font-medium border border-border bg-surface flex items-center gap-1"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getProviderColor(p) }} />
                        <span>{p}</span>
                        {model && <span className="text-muted text-[11px]">({model})</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* File B Selector */}
          <div className="p-3.5 rounded-lg border border-border/80 bg-surface-elevated/40 space-y-2">
            <label htmlFor="merge-file-b-select" className="block font-medium text-foreground">
              Run File B:
            </label>
            <select
              id="merge-file-b-select"
              value={fileBFilename}
              onChange={(e) => setFileBFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Select a file...</option>
              {files.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {formatResultFileOptionLabel(f)}
                </option>
              ))}
            </select>

            {fileBData && (
              <div className="pt-2 text-[13px] text-muted space-y-1 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span>Completed:</span>
                  <span className="font-medium text-foreground">{formatDate(fileBData.completedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Inputs:</span>
                  <span className="font-medium text-foreground">{fileBData.results?.length ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span>Providers:</span>
                  {fileBData.providers.map((p) => {
                    const model = fileBData.providerModels?.[p] || fileBData.summary?.providers?.[p]?.model;
                    return (
                      <span
                        key={p}
                        className="px-2 py-0.5 rounded font-mono font-medium border border-border bg-surface flex items-center gap-1"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getProviderColor(p) }} />
                        <span>{p}</span>
                        {model && <span className="text-muted text-[11px]">({model})</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingDetails && (
        <div className="p-8 rounded-xl border border-border bg-surface flex items-center justify-center gap-3 text-muted">
          <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Analyzing run compatibility…</span>
        </div>
      )}

      {/* Same File Warning */}
      {!isLoadingDetails && fileAFilename && fileBFilename && fileAFilename === fileBFilename && (
        <div className="p-4 rounded-xl border border-warning/40 bg-warning/10 text-warning flex items-center gap-2">
          <span>⚠️</span>
          <span>Please select two different result files to perform a merge.</span>
        </div>
      )}

      {/* Compatibility & Merge Plan Card */}
      {!isLoadingDetails && compatibility && fileAFilename !== fileBFilename && (
        <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <span>2. Compatibility &amp; Merge Plan</span>
          </h4>

          {/* Chronology Direction */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface-elevated/50">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold text-[11px] uppercase tracking-wider">
                Source (Old)
              </span>
              <span className="font-mono text-foreground">{compatibility.olderFile.filename}</span>
              <span className="text-muted text-[11px]">({formatDate(compatibility.olderFile.completedAt)})</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-accent font-bold">➔</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px] uppercase tracking-wider">
                Target (New)
              </span>
              <span className="font-mono text-foreground">{compatibility.newerFile.filename}</span>
              <span className="text-muted text-[11px]">({formatDate(compatibility.newerFile.completedAt)})</span>
            </div>
          </div>

          {/* Rule 1 Status Card */}
          {compatibility.canMerge ? (
            <div className="p-3.5 rounded-lg border border-success/40 bg-success/10 space-y-2">
              <div className="flex items-center gap-2 text-success font-semibold">
                <span>✅</span>
                <span>Rule 1 Passed: Providers and models are distinct</span>
              </div>
              <p className="text-foreground text-[13px] leading-relaxed">
                The provider results from the older run can be cleanly merged into the newer run.
              </p>
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-muted text-[12px]">Providers to transfer:</span>
                {compatibility.sourceProviders.map((sp) => (
                  <span
                    key={sp.key}
                    className="px-2 py-0.5 rounded border border-success/30 bg-surface font-mono font-medium text-foreground text-[12px] flex items-center gap-1"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getProviderColor(sp.provider) }} />
                    <span>{sp.provider}</span>
                    {sp.model && <span className="text-muted">({sp.model})</span>}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-danger/40 bg-danger/10 space-y-2">
              <div className="flex items-center gap-2 text-danger font-semibold">
                <span>✕</span>
                <span>Rule 1 Violation: Incompatible Providers</span>
              </div>
              <p className="text-danger leading-relaxed">
                {compatibility.reason}
              </p>
              <p className="text-muted text-[13px]">
                Both runs already have evaluation data for the same provider and model combination. Merging would cause data collisions.
              </p>
            </div>
          )}

          {/* Rule 2 & 3 Input Alignment */}
          {compatibility.canMerge && (
            <div className="p-3.5 rounded-lg border border-border/80 bg-surface-elevated/40 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-semibold text-foreground">Input Address Alignment:</span>
                <span className="text-[12px] text-muted">
                  {compatibility.matchingInputsCount} matching addresses between runs
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-muted block text-[11px] uppercase tracking-wider">Matching Inputs</span>
                  <span className="font-bold text-lg text-emerald-400">{compatibility.matchingInputsCount}</span>
                  <span className="text-muted block text-[11px]">Will combine provider columns</span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-muted block text-[11px] uppercase tracking-wider">Target Only (New)</span>
                  <span className="font-bold text-lg text-foreground">{compatibility.targetOnlyInputsCount}</span>
                  <span className="text-muted block text-[11px]">Already in new run</span>
                </div>
                <div className="p-2.5 rounded bg-surface border border-border">
                  <span className="text-muted block text-[11px] uppercase tracking-wider">Source Only (Old)</span>
                  <span className="font-bold text-lg text-amber-400">{compatibility.sourceOnlyInputsCount}</span>
                  <span className="text-muted block text-[11px]">
                    {compatibility.sourceOnlyInputsCount === 0 ? "None (full match)" : "Unmatched in new run"}
                  </span>
                </div>
              </div>

              {/* Unmatched addresses option if source has unique addresses */}
              {compatibility.sourceOnlyInputsCount > 0 ? (
                <div className="pt-2 border-t border-border/60 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeUnmatched}
                      onChange={(e) => setIncludeUnmatched(e.target.checked)}
                      className="mt-1 rounded border-border text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="font-semibold text-foreground">
                        Include unmatched addresses from older run into newer run
                      </span>
                      <p className="text-muted text-[12px] leading-relaxed">
                        If checked, all {compatibility.sourceOnlyInputsCount} unmatched addresses will be added to the newer run.
                        Because all data will be transferred, the older file will be deleted. If unchecked, the unmatched addresses
                        will remain in the older file and it will be preserved.
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-accent/10 border border-accent/20 text-accent text-[13px] flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    All {compatibility.matchingInputsCount} addresses from the older run exist in the newer run.
                    All data will be transferred, and the older run file will be automatically deleted.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Merge Execution Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              {compatibility.canMerge ? (
                <span className="text-[13px] text-muted">
                  Ready to merge into <code className="text-foreground font-mono">{compatibility.newerFile.filename}</code>
                </span>
              ) : (
                <span className="text-[13px] text-danger font-medium">
                  Resolve provider/model conflicts to enable merge
                </span>
              )}
            </div>

            <button
              id="btn-execute-merge"
              type="button"
              onClick={handleExecuteMerge}
              disabled={!compatibility.canMerge || isMerging}
              className="px-5 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-sm"
            >
              {isMerging ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Merging &amp; Recalculating Summary…</span>
                </>
              ) : (
                <>
                  <span>🔀</span>
                  <span>Execute Merge</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {mergeError && (
        <div className="p-4 rounded-xl border border-danger/40 bg-danger/10 text-danger flex items-start gap-2.5">
          <span className="text-xl">⚠️</span>
          <div className="space-y-1">
            <span className="font-semibold">Merge Failed</span>
            <p className="text-[13px]">{mergeError}</p>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {mergeSuccessInfo && (
        <div className="p-5 rounded-xl border border-success/40 bg-success/10 text-foreground space-y-3">
          <div className="flex items-center gap-2.5 text-success font-semibold text-base">
            <span className="text-xl">🎉</span>
            <span>Merge Completed Successfully!</span>
          </div>

          <div className="text-[13px] text-foreground space-y-1.5">
            <p>
              Merged providers into <code className="font-mono font-bold text-accent">{mergeSuccessInfo.targetFile}</code>.
            </p>
            <p className="text-muted">
              Combined {mergeSuccessInfo.mergedInputsCount} input addresses. Summary performance metrics and error distributions have been recalculated.
            </p>
            {mergeSuccessInfo.isOldFileDeleted ? (
              <p className="text-emerald-400 font-medium">
                ✓ All data was transferred from <code className="font-mono">{mergeSuccessInfo.sourceFile}</code>, so the older file was safely deleted.
              </p>
            ) : (
              <p className="text-amber-400 font-medium">
                ℹ️ {mergeSuccessInfo.unmatchedInputsRetained} unmatched addresses were retained in <code className="font-mono">{mergeSuccessInfo.sourceFile}</code> with updated summary.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

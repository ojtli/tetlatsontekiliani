"use client";

import {Suspense, useEffect, useState} from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { JobResultFile } from "@/lib/types";
import { ResultFileInfo } from "@/app/api/results/route";
import { formatResultFileOptionLabel } from "@/lib/compare";
import ResultsTable from "./ResultsTable";
import ResultsStats from "./ResultsStats";
import {LeafletLoader} from "@/app/components/map/LeafletLoader.tsx";

// Dynamically import ResultsMap with SSR disabled to prevent Leaflet window access crashes
const ResultsMap = dynamic(() => import("./ResultsMap"), {
  ssr: false,
  loading: () => (
      <LeafletLoader>Loading Leaflet Map Visualizer...</LeafletLoader>
  ),
});

function ResultsPanelContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileFromQuery = searchParams.get("file");
  const viewFromQuery = searchParams.get("view") as "table" | "map" | "split" | "stats" | null;

  const [files, setFiles] = useState<ResultFileInfo[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(fileFromQuery);
  const [activeFile, setActiveFile] = useState<JobResultFile | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // View mode: table, map, split, or stats
  const [viewMode, setViewMode] = useState<"table" | "map" | "split" | "stats">(
    viewFromQuery === "map" || viewFromQuery === "split" || viewFromQuery === "stats"
      ? viewFromQuery
      : "table"
  );
  const [selectedAddressIndex, setSelectedAddressIndex] = useState<number>(0);

  // Sync viewMode from URL query if changed
  useEffect(() => {
    if (
      viewFromQuery &&
      (viewFromQuery === "table" ||
        viewFromQuery === "map" ||
        viewFromQuery === "split" ||
        viewFromQuery === "stats")
    ) {
      setViewMode(viewFromQuery);
    }
  }, [viewFromQuery]);

  // Load available result files list
  const loadFiles = async (keepSelection?: string) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/results?t=${Date.now()}`);
      const data = await res.json();
      const list: ResultFileInfo[] = data.files || [];
      setFiles(list);

      if (keepSelection && list.some((f) => f.filename === keepSelection)) {
        setSelectedFilename(keepSelection);
      } else if (!fileFromQuery && list.length > 0) {
        setSelectedFilename(list[0].filename);
      }
    } catch (err) {
      console.error("Failed to load result files:", err);
    } finally {
      setIsLoadingList(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadFiles(fileFromQuery ?? undefined);
  }, [fileFromQuery]);

  // When query param changes, update selectedFilename
  useEffect(() => {
    if (fileFromQuery) {
      setSelectedFilename(fileFromQuery);
    }
  }, [fileFromQuery]);

  // Load active file details
  useEffect(() => {
    if (!selectedFilename) {
      setActiveFile(null);
      return;
    }
    setIsLoadingFile(true);
    fetch(`/api/results/${encodeURIComponent(selectedFilename)}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: JobResultFile | null) => {
        setActiveFile(data);
        setSelectedAddressIndex(0);
      })
      .catch((err) => {
        console.error("Failed to load result file:", err);
        setActiveFile(null);
      })
      .finally(() => setIsLoadingFile(false));
  }, [selectedFilename]);

  const handleSelectFile = (fn: string) => {
    setSelectedFilename(fn);
    router.replace(`/results?file=${encodeURIComponent(fn)}`);
  };

  const handleDownloadJson = () => {
    if (!activeFile) return;
    const blob = new Blob([JSON.stringify(activeFile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.filename || "geocoder-results.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`w-full ${viewMode === "map" ? "flex-1 min-h-0 flex flex-col space-y-2.5" : "space-y-3"}`}>
      {/* Header & Run Selector Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-border bg-surface shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h2 className="text-base font-semibold text-foreground">Benchmark Results</h2>
          </div>
          <p className="text-muted mt-0.5">
            Compare geocoding error distances in tabular view or on an interactive Leaflet map.
          </p>
        </div>

        {/* Controls: View Mode Switcher, Run Selector, Refresh, Download */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          {activeFile && (
            <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface-elevated">
              <button
                id="btn-view-mode-table"
                type="button"
                onClick={() => {
                  setViewMode("table");
                  router.replace(`/results?file=${encodeURIComponent(selectedFilename || "")}&view=table`);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${viewMode === "table"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-foreground"
                  }`}
              >
                <span>📊</span>
                <span>Table</span>
              </button>
              <button
                id="btn-view-mode-map"
                type="button"
                onClick={() => {
                  setViewMode("map");
                  router.replace(`/results?file=${encodeURIComponent(selectedFilename || "")}&view=map`);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${viewMode === "map"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-foreground"
                  }`}
              >
                <span>🗺️</span>
                <span>Map</span>
              </button>
              <button
                id="btn-view-mode-split"
                type="button"
                onClick={() => {
                  setViewMode("split");
                  router.replace(`/results?file=${encodeURIComponent(selectedFilename || "")}&view=split`);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${viewMode === "split"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-foreground"
                  }`}
              >
                <span>◫</span>
                <span>Split</span>
              </button>
              <button
                id="btn-view-mode-stats"
                type="button"
                onClick={() => {
                  setViewMode("stats");
                  router.replace(`/results?file=${encodeURIComponent(selectedFilename || "")}&view=stats`);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${viewMode === "stats"
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-foreground"
                  }`}
              >
                <span>📈</span>
                <span>Stats</span>
              </button>
            </div>
          )}

          {/* File selector dropdown */}
          {isLoadingList ? (
            <span className="text-muted animate-pulse">Loading files…</span>
          ) : files.length === 0 ? (
            <span className="text-muted">No files found</span>
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor="file-select" className="text-muted font-medium shrink-0">
                File:
              </label>
              <select
                id="file-select"
                value={selectedFilename ?? ""}
                onChange={(e) => handleSelectFile(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {files.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {formatResultFileOptionLabel(f)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reload available files list */}
          <button
            type="button"
            onClick={() => loadFiles(selectedFilename ?? undefined)}
            disabled={isRefreshing}
            title="Reload available files list"
            className="p-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span className={isRefreshing ? "inline-block animate-spin" : ""}>🔃</span>
          </button>

          {/* Download JSON button */}
          {activeFile && (
            <button
              type="button"
              onClick={handleDownloadJson}
              title="Download results JSON file"
              className="px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-elevated transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>💾</span>
              <span className="hidden sm:inline">Export</span>
            </button>
          )}

          {/* Retry LLM request on failed inputs */}
          {activeFile && (
            <button
              type="button"
              id="btn-retry-failed-inputs"
              onClick={() => router.push(`/run-job?retryFile=${encodeURIComponent(activeFile.filename)}`)}
              title="Retry LLM request on failed inputs in Run Job"
              className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-amber-500/20 hover:text-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer font-medium text-xs sm:text-sm shadow-sm"
            >
              <span>🔄</span>
              <span>Retry Failed</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected Run Content */}
      {isLoadingFile ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-xl border border-border bg-surface text-center space-y-3">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-foreground">Loading benchmark dataset…</p>
          <p className="text-muted">Reading results from server file</p>
        </div>
      ) : activeFile ? (
        <div className={viewMode === "map" ? "flex-1 min-h-0 flex flex-col" : "space-y-4"}>
          {/* Stats View */}
          {viewMode === "stats" && <ResultsStats file={activeFile} />}

          {/* Map View */}
          {(viewMode === "map" || viewMode === "split") && (
            <ResultsMap
              file={activeFile}
              selectedIndex={selectedAddressIndex}
              onSelectIndex={setSelectedAddressIndex}
              isStandalone={viewMode === "map"}
            />
          )}

          {/* Table View */}
          {(viewMode === "table" || viewMode === "split") && (
            <ResultsTable file={activeFile} />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-16 rounded-xl border border-dashed border-border text-center">
          <span className="text-4xl mb-3">📂</span>
          <p className="text-base font-semibold text-foreground">No benchmark results available</p>
          <p className="text-muted mt-1 max-w-sm mb-4">
            Execute a batch geocoding run to evaluate providers and produce benchmark data.
          </p>
          <button
            type="button"
            onClick={() => router.push("/run-job")}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition-colors shadow-sm"
          >
            Go to Run Job →
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResultsPanel() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-sm text-muted">
          Loading results...
        </div>
      }
    >
      <ResultsPanelContent />
    </Suspense>
  );
}

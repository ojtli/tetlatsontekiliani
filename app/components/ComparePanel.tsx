"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { JobResultFile } from "@/lib/types";
import { ResultFileInfo } from "@/app/api/results/route";
import {
  buildComparisonRows,
  buildOverallComparison,
  selectDefaultComparisonRuns,
  formatResultFileOptionLabel,
  AddressComparisonRow,
  ProviderOverallComparison,
} from "@/lib/compare";
import CompareTable from "./CompareTable";
import CompareMerge from "./CompareMerge";
import { formatDistance } from "@/lib/geo";
import {PROVIDER_COLORS} from "@/lib/constants.ts";
import {LeafletLoader} from "@/app/components/map/LeafletLoader.tsx";

// Dynamically import CompareMap with SSR disabled to prevent Leaflet window access crashes
const CompareMap = dynamic(() => import("./CompareMap"), {
  ssr: false,
  loading: () => <LeafletLoader>Loading Leaflet Temporal Comparison Map...</LeafletLoader>,
});

type ViewMode = "table" | "map" | "split" | "merge";

function ComparePanelContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [files, setFiles] = useState<ResultFileInfo[]>([]);
  const [_isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);

  // Selected runs filenames: Run A, Run B, Run C (optional)
  const [runAFilename, setRunAFilename] = useState<string>("");
  const [runBFilename, setRunBFilename] = useState<string>("");
  const [runCFilename, setRunCFilename] = useState<string>("");

  // Loaded Run objects
  const [runAFiles, setRunAFiles] = useState<JobResultFile | null>(null);
  const [runBFiles, setRunBFiles] = useState<JobResultFile | null>(null);
  const [runCFiles, setRunCFiles] = useState<JobResultFile | null>(null);

  const viewFromQuery = searchParams.get("view") as ViewMode | null;
  const [viewMode, setViewMode] = useState<ViewMode>(
    viewFromQuery === "map" || viewFromQuery === "split" || viewFromQuery === "merge"
      ? viewFromQuery
      : "table"
  );
  const [selectedAddressIndex, setSelectedAddressIndex] = useState(0);

  // Sync viewMode from URL query if changed
  useEffect(() => {
    if (
      viewFromQuery &&
      (viewFromQuery === "table" ||
        viewFromQuery === "map" ||
        viewFromQuery === "split" ||
        viewFromQuery === "merge")
    ) {
      setViewMode(viewFromQuery);
    }
  }, [viewFromQuery]);

  const loadFilesList = () => {
    setIsLoadingList(true);
    return fetch(`/api/results?t=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => {
        const list: ResultFileInfo[] = data.files || [];
        setFiles(list);
        return list;
      })
      .catch((err) => {
        console.error("Failed to load result files:", err);
        return [];
      })
      .finally(() => setIsLoadingList(false));
  };

  // Load available result files list
  useEffect(() => {
    loadFilesList().then((list) => {
      // Pre-select defaults: Always default to the latest three results
      const defaults = selectDefaultComparisonRuns(list);
      setRunAFilename(defaults.runA);
      setRunBFilename(defaults.runB);
      setRunCFilename(defaults.runC);
    });
  }, []);

  const handleMergeSuccess = (targetFilename: string) => {
    loadFilesList().then(() => {
      setRunAFilename(targetFilename);
    });
  };

  // Fetch full details of selected runs
  useEffect(() => {
    if (!runAFilename) {
      setRunAFiles(null);
      return;
    }

    setIsLoadingRuns(true);

    const fetches: Promise<JobResultFile | null>[] = [
      fetch(`/api/results/${encodeURIComponent(runAFilename)}?t=${Date.now()}`).then((r) =>
        r.ok ? r.json() : null
      ),
    ];

    if (runBFilename && runBFilename !== runAFilename) {
      fetches.push(
        fetch(`/api/results/${encodeURIComponent(runBFilename)}?t=${Date.now()}`).then((r) =>
          r.ok ? r.json() : null
        )
      );
    } else {
      fetches.push(Promise.resolve(null));
    }

    if (runCFilename && runCFilename !== runAFilename && runCFilename !== runBFilename) {
      fetches.push(
        fetch(`/api/results/${encodeURIComponent(runCFilename)}?t=${Date.now()}`).then((r) =>
          r.ok ? r.json() : null
        )
      );
    } else {
      fetches.push(Promise.resolve(null));
    }

    Promise.all(fetches)
      .then(([a, b, c]) => {
        setRunAFiles(a);
        setRunBFiles(b);
        setRunCFiles(c);
        setSelectedAddressIndex(0);
      })
      .catch((err) => console.error("Failed to load compare runs:", err))
      .finally(() => setIsLoadingRuns(false));
  }, [runAFilename, runBFilename, runCFilename]);

  // Active runs array
  const activeRuns: JobResultFile[] = useMemo(() => {
    const list: JobResultFile[] = [];
    if (runAFiles) list.push(runAFiles);
    if (runBFiles) list.push(runBFiles);
    if (runCFiles) list.push(runCFiles);
    return list;
  }, [runAFiles, runBFiles, runCFiles]);

  // Combined providers across active runs
  const combinedProviders: string[] = useMemo(() => {
    return Array.from(new Set(activeRuns.flatMap((r) => r.providers)));
  }, [activeRuns]);

  // Comparison rows
  const comparisonRows: AddressComparisonRow[] = useMemo(() => {
    return buildComparisonRows(activeRuns);
  }, [activeRuns]);

  // Overall provider comparison statistics (Run A vs Run B)
  const overallStats: ProviderOverallComparison[] = useMemo(() => {
    if (activeRuns.length < 2) return [];
    return buildOverallComparison(
      comparisonRows,
      combinedProviders,
      activeRuns[0],
      activeRuns[1]
    );
  }, [comparisonRows, combinedProviders, activeRuns]);

  return (
    <div
      className={`w-full ${viewMode === "map" ? "flex-1 min-h-0 flex flex-col space-y-2.5" : "space-y-3"
        }`}
    >
      {/* Top Header & Multi-Run Selectors */}
      <div className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-xl border border-border bg-surface shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚖️</span>
              <h2 className="text-base font-semibold text-foreground">Cross-Date Comparison</h2>
            </div>
            <p className="text-muted mt-0.5">
              Compare accuracy improvements and regressions between benchmark runs over time.
            </p>
          </div>

          {/* View Mode Switcher */}
          {files.length >= 2 && (
            <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface-elevated">
              <button
                id="btn-compare-view-table"
                type="button"
                onClick={() => {
                  setViewMode("table");
                  router.replace(`/compare?view=table`);
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
                id="btn-compare-view-map"
                type="button"
                onClick={() => {
                  setViewMode("map");
                  router.replace(`/compare?view=map`);
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
                id="btn-compare-view-split"
                type="button"
                onClick={() => {
                  setViewMode("split");
                  router.replace(`/compare?view=split`);
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
                id="btn-compare-view-merge"
                type="button"
                onClick={() => {
                  setViewMode("merge");
                  router.replace(`/compare?view=merge`);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${viewMode === "merge"
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                  }`}
              >
                <span>🔀</span>
                <span>Merge</span>
              </button>
            </div>
          )}
        </div>

        {/* Run Selectors Bar (Only shown in Table, Map, or Split views) */}
        {viewMode !== "merge" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
            {/* Run A (Baseline) */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <label htmlFor="run-a-select" className="font-semibold text-foreground shrink-0">
                Run A (Baseline):
              </label>
              <select
                id="run-a-select"
                value={runAFilename}
                onChange={(e) => setRunAFilename(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent max-w-[280px] truncate"
              >
                {files.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {formatResultFileOptionLabel(f)}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-muted font-bold">vs</span>

            {/* Run B (Comparison) */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
              <label htmlFor="run-b-select" className="font-semibold text-foreground shrink-0">
                Run B (Comparison):
              </label>
              <select
                id="run-b-select"
                value={runBFilename}
                onChange={(e) => setRunBFilename(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent max-w-[280px] truncate"
              >
                {files.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {formatResultFileOptionLabel(f)}
                  </option>
                ))}
              </select>
            </div>

            {/* Run C (Optional Comparison 2) */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0" />
              <label htmlFor="run-c-select" className="font-semibold text-muted shrink-0">
                Run C (Optional):
              </label>
              <select
                id="run-c-select"
                value={runCFilename}
                onChange={(e) => setRunCFilename(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-elevated font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent max-w-[280px] truncate"
              >
                <option value="">None (Compare 2 runs)</option>
                {files
                  .filter((f) => f.filename !== runAFilename && f.filename !== runBFilename)
                  .map((f) => (
                    <option key={f.filename} value={f.filename}>
                      {formatResultFileOptionLabel(f)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === "merge" ? (
        <CompareMerge
          files={files}
          initialFileA={runAFilename}
          initialFileB={runBFilename}
          onMergeSuccess={handleMergeSuccess}
        />
      ) : isLoadingRuns ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-xl border border-border bg-surface text-center space-y-3">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-foreground">Aligning and comparing benchmark runs…</p>
          <p className="text-muted">Calculating geodesic distance deltas and percentage changes</p>
        </div>
      ) : activeRuns.length < 2 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-xl border border-dashed border-border text-center">
          <span className="text-4xl mb-3">⚖️</span>
          <p className="text-base font-semibold text-foreground">Select at least two benchmark runs</p>
          <p className="text-muted mt-1 max-w-sm mb-4">
            Pick Run A as your baseline and Run B to compare distance improvements or regressions.
          </p>
        </div>
      ) : (
        <div className={viewMode === "map" ? "flex-1 min-h-0 flex flex-col" : "space-y-4"}>
          {/* Summary Delta Cards (Only shown in table or split view) */}
          {viewMode !== "map" && overallStats.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              {overallStats.map((stat) => {
                const color = PROVIDER_COLORS[stat.provider] ?? PROVIDER_COLORS[stat.provider.split(" ")[0]] ?? "#888";
                const effectiveDiff = stat.medianDistanceDiff ?? stat.avgDistanceDiff ?? 0;
                const isImproved = effectiveDiff < 0;
                const isRegressed = effectiveDiff > 0;
                const percentChange = stat.medianPercentChange ?? stat.avgPercentChange;
                const baseDist = stat.baseMedianDistance ?? stat.baseAvgDistance;
                const compDist = stat.compMedianDistance ?? stat.compAvgDistance;

                return (
                  <div
                    key={stat.provider}
                    className="p-3 rounded-xl border border-border bg-surface hover:border-border-hover transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-bold uppercase text-foreground">
                            {stat.provider}
                          </span>
                        </div>
                        {percentChange !== null && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${isImproved
                                ? "bg-success/15 text-success"
                                : isRegressed
                                  ? "bg-danger/15 text-danger"
                                  : "text-muted bg-surface-elevated"
                              }`}
                          >
                            {isImproved
                              ? `▲ -${Math.abs(Math.round(percentChange))}%`
                              : isRegressed
                                ? `▼ +${Math.round(percentChange)}%`
                                : "0%"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between mt-2 font-mono text-[11px]">
                        <div className="flex flex-col">
                          <span className="text-muted" title={stat.baseAvgDistance !== null ? `Mean: ${formatDistance(stat.baseAvgDistance)}` : undefined}>
                            Base: {formatDistance(baseDist)} <span className="text-[9px] opacity-70">med</span>
                          </span>
                          {stat.baseModel && (
                            <span className="text-[10px] text-muted/80 truncate max-w-[90px]" title={stat.baseModel}>
                              ({stat.baseModel})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="font-bold text-foreground" title={stat.compAvgDistance !== null ? `Mean: ${formatDistance(stat.compAvgDistance)}` : undefined}>
                            New: {formatDistance(compDist)} <span className="text-[9px] font-normal opacity-70">med</span>
                          </span>
                          {stat.compModel && (
                            <span className="text-[10px] text-accent font-medium truncate max-w-[90px]" title={stat.compModel}>
                              ({stat.compModel})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted">
                      <span className="text-success font-medium">
                        ▲ {stat.improvedCount} better
                      </span>
                      <span className="text-danger font-medium">
                        ▼ {stat.regressedCount} worse
                      </span>
                      <span>{stat.neutralCount} same</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Map View */}
          {(viewMode === "map" || viewMode === "split") && (
            <CompareMap
              runs={activeRuns}
              selectedIndex={selectedAddressIndex}
              onSelectIndex={setSelectedAddressIndex}
              isStandalone={viewMode === "map"}
            />
          )}

          {/* Table View */}
          {(viewMode === "table" || viewMode === "split") && (
            <CompareTable
              rows={comparisonRows}
              runs={activeRuns}
              providers={combinedProviders}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ComparePanel() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-sm text-muted">
          Loading comparison data...
        </div>
      }
    >
      <ComparePanelContent />
    </Suspense>
  );
}

"use client";

import { useMemo, useState } from "react";
import { JobResultFile } from "@/lib/types";
import { calculateJobSummary, formatDistance, getAccuracyCategory, isDistanceOutlier } from "@/lib/geo";
import DistancePill from "./DistancePill";
import {PROVIDER_COLORS} from "@/lib/constants.ts";

interface ResultsTableProps {
  file: JobResultFile;
}

type SortKey = "index" | "address" | string;
type AccuracyFilter = "all" | "excellent" | "moderate" | "poor" | "outliers";

export default function ResultsTable({ file }: ResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>("all");

  // Summary Metrics precomputed by the server job (with fallback if missing)
  const summary = useMemo(() => {
    if (file.summary && file.summary.providers) {
      return file.summary;
    }
    return calculateJobSummary(file.results, file.providers);
  }, [file]);

  const providerStats = summary.providers;
  const topProvider = summary.topProvider;

  // Handle header sort click
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Filter and sort entries
  const filteredAndSortedEntries = useMemo(() => {
    const indexed = file.results.map((entry, idx) => ({ entry, originalIndex: idx }));

    // Diacritic / accent-insensitive search normalization
    const norm = (str: string) =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const searched = indexed.filter(({ entry }) => {
      if (!searchQuery.trim()) return true;
      const q = norm(searchQuery);
      return norm(entry.input).includes(q);
    });

    // Accuracy filter
    const filtered = searched.filter(({ entry }) => {
      if (accuracyFilter === "all") return true;

      if (accuracyFilter === "outliers") {
        return entry.providersResults.some(
          (pr) => pr.isOutlier || (pr.distanceMeters !== null && isDistanceOutlier(pr.distanceMeters))
        );
      }

      return entry.providersResults.some((pr) => {
        const cat = getAccuracyCategory(pr.distanceMeters);
        return cat === accuracyFilter;
      });
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortKey === "index") {
        return sortDir === "asc"
          ? a.originalIndex - b.originalIndex
          : b.originalIndex - a.originalIndex;
      }

      if (sortKey === "address") {
        const comp = a.entry.input.localeCompare(b.entry.input);
        return sortDir === "asc" ? comp : -comp;
      }

      // Sort by provider distance
      const prA = a.entry.providersResults.find((pr) => pr.provider === sortKey);
      const prB = b.entry.providersResults.find((pr) => pr.provider === sortKey);

      const distA = prA?.distanceMeters ?? null;
      const distB = prB?.distanceMeters ?? null;

      if (distA === null && distB === null) return 0;
      if (distA === null) return 1;
      if (distB === null) return -1;

      return sortDir === "asc" ? distA - distB : distB - distA;
    });

    return filtered;
  }, [file.results, searchQuery, accuracyFilter, sortKey, sortDir]);

  // Accuracy counts for filter badges
  const accuracyTierCounts = useMemo(() => {
    let excellent = 0;
    let moderate = 0;
    let poor = 0;
    let outliers = 0;

    for (const entry of file.results) {
      let hasExc = false;
      let hasMod = false;
      let hasPoor = false;
      let hasOutlier = false;

      for (const pr of entry.providersResults) {
        if (pr.isOutlier || (pr.distanceMeters !== null && isDistanceOutlier(pr.distanceMeters))) {
          hasOutlier = true;
        }
        const cat = getAccuracyCategory(pr.distanceMeters);
        if (cat === "excellent") hasExc = true;
        if (cat === "moderate") hasMod = true;
        if (cat === "poor" || cat === "error") hasPoor = true;
      }

      if (hasExc) excellent++;
      if (hasMod) moderate++;
      if (hasPoor) poor++;
      if (hasOutlier) outliers++;
    }

    return { excellent, moderate, poor, outliers };
  }, [file.results]);

  return (
    <div className="w-full space-y-3">
      {/* Filter and Search Bar with embedded Legend (replaces bottom explanatory row) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border bg-surface shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by address keyword..."
            className="w-full px-3 py-1.5 pl-8 rounded-lg border border-border bg-surface-elevated text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="absolute left-2.5 top-2 text-muted pointer-events-none">
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1.5 text-muted hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* Accuracy Filter Pills & Embedded Legend */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted mr-1 font-medium hidden lg:inline">
            Accuracy:
          </span>
          <button
            onClick={() => setAccuracyFilter("all")}
            className={`px-2 py-1 rounded-md border transition-colors ${accuracyFilter === "all"
              ? "border-accent bg-accent/20 text-accent font-semibold"
              : "border-border text-muted hover:text-foreground bg-surface-elevated"
              }`}
          >
            All ({file.results.length})
          </button>
          <button
            onClick={() => setAccuracyFilter("excellent")}
            className={`px-2 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${accuracyFilter === "excellent"
              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400 font-semibold"
              : "border-border text-muted hover:text-foreground bg-surface-elevated"
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>&lt; 100m ({accuracyTierCounts.excellent})</span>
          </button>
          <button
            onClick={() => setAccuracyFilter("moderate")}
            className={`px-2 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${accuracyFilter === "moderate"
              ? "border-amber-500/50 bg-amber-500/20 text-amber-400 font-semibold"
              : "border-border text-muted hover:text-foreground bg-surface-elevated"
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>100m–1km ({accuracyTierCounts.moderate})</span>
          </button>
          <button
            onClick={() => setAccuracyFilter("poor")}
            className={`px-2 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${accuracyFilter === "poor"
              ? "border-rose-500/50 bg-rose-500/20 text-rose-400 font-semibold"
              : "border-border text-muted hover:text-foreground bg-surface-elevated"
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>&gt; 1km ({accuracyTierCounts.poor})</span>
          </button>
          {accuracyTierCounts.outliers > 0 && (
            <button
              onClick={() => setAccuracyFilter("outliers")}
              className={`px-2 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${accuracyFilter === "outliers"
                ? "border-purple-500/50 bg-purple-500/20 text-purple-300 font-semibold"
                : "border-border text-muted hover:text-foreground bg-surface-elevated"
                }`}
              title="Filter to results with coordinates > 460km (exceeding Costa Rica span)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>⚠ Outliers ({accuracyTierCounts.outliers})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container: Full width, visible grid lines, zebra pattern, fixed sticky Address and sticky header & footer */}
      <div className="w-full overflow-auto max-h-[calc(100vh-230px)] min-h-[380px] rounded-xl border border-border/90 bg-surface shadow-sm">
        <table className="w-full text-left border-collapse">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-30 bg-surface-elevated border-b-2 border-border shadow-sm">
            <tr>
              {/* Column 1: # (Fixed Sticky top & left) */}
              <th
                onClick={() => handleSort("index")}
                className="w-12 min-w-[48px] max-w-[48px] px-3 py-2.5 font-semibold uppercase tracking-wider text-muted cursor-pointer hover:text-foreground select-none border-r border-border/80 sticky top-0 left-0 z-50 bg-surface-elevated border-b-2 border-border"
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  {sortKey === "index" && (
                    <span className="text-accent">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </div>
              </th>

              {/* Column 2: Address (Fixed Sticky top & left with shadow separator) */}
              <th
                onClick={() => handleSort("address")}
                className="min-w-[320px] max-w-[440px] px-3.5 py-2.5 font-semibold uppercase tracking-wider text-muted cursor-pointer hover:text-foreground select-none border-r-2 border-border/90 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)] sticky top-0 left-[48px] z-50 bg-surface-elevated border-b-2 border-border"
              >
                <div className="flex items-center gap-1">
                  <span>Input Address</span>
                  {sortKey === "address" && (
                    <span className="text-accent">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </div>
              </th>

              {/* Provider Columns (Horizontally scrollable, sticky top) */}
              {file.providers.map((prov) => {
                const isSorted = sortKey === prov;
                const isTop = prov === topProvider;

                return (
                  <th
                    key={prov}
                    onClick={() => handleSort(prov)}
                    className="min-w-[160px] px-3 py-2 text-center font-semibold uppercase tracking-wider cursor-pointer hover:bg-surface select-none transition-colors border-r border-border/70 last:border-r-0 sticky top-0 z-30 bg-surface-elevated border-b-2 border-border"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: PROVIDER_COLORS[prov] ?? "#888" }}
                        />
                        <span style={{ color: PROVIDER_COLORS[prov] ?? "inherit" }}>
                          {prov}
                        </span>
                        {isTop && <span title="Top Performer">👑</span>}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-normal text-muted lowercase">
                        <span>distance</span>
                        <span className={isSorted ? "text-accent font-bold" : "opacity-40"}>
                          {isSorted ? (sortDir === "asc" ? "▲ asc" : "▼ desc") : "↕"}
                        </span>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body: Zebra striping, visible lines, fixed sticky Address */}
          <tbody className="divide-y divide-border/70">
            {filteredAndSortedEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + file.providers.length}
                  className="px-6 py-12 text-center text-muted text-sm bg-surface"
                >
                  <span className="text-2xl block mb-2">🔍</span>
                  No addresses match your filter or search query.
                </td>
              </tr>
            ) : (
              filteredAndSortedEntries.map(({ entry, originalIndex }) => {
                const isEven = originalIndex % 2 === 0;
                // Solid backgrounds for sticky columns to prevent scroll bleed-through
                const stickyBgClass = isEven ? "bg-surface" : "bg-[#161c28]";
                const scrollingBgClass = isEven ? "bg-surface/50" : "bg-surface-elevated/40";

                return (
                  <tr
                    key={originalIndex}
                    className="group border-b border-border/70 hover:bg-accent/10 transition-colors"
                  >
                    {/* Column 1: # (Fixed Sticky) */}
                    <td
                      className={`w-12 min-w-[48px] max-w-[48px] px-3 py-2.5 align-middle font-mono text-[11px] text-muted border-r border-border/80 sticky left-0 z-20 ${stickyBgClass} group-hover:bg-[#1a2334] transition-colors`}
                    >
                      {originalIndex + 1}
                    </td>

                    {/* Column 2: Address (Fixed Sticky with shadow separator) */}
                    <td
                      className={`min-w-[320px] max-w-[440px] px-3.5 py-2.5 align-middle border-r-2 border-border/90 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)] sticky left-[48px] z-20 ${stickyBgClass} group-hover:bg-[#1a2334] transition-colors`}
                    >
                      <div className="flex items-start gap-1.5">
                        <p className="font-medium text-foreground leading-snug flex-1">
                          {entry.input}
                        </p>
                        {entry.expectedResult === null && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold"
                            title="Expected result is null (testing rejection of non-address / out-of-boundary input)"
                          >
                            NULL
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Provider Result Cells (Scrollable) */}
                    {file.providers.map((prov) => {
                      const pr = entry.providersResults.find((p) => p.provider === prov);
                      if (!pr) {
                        return (
                          <td
                            key={prov}
                            className={`px-3 py-2.5 align-middle text-center text-muted border-r border-border/60 last:border-r-0 ${scrollingBgClass} group-hover:bg-[#1a2334]/70 transition-colors`}
                          >
                            —
                          </td>
                        );
                      }

                      if (pr.error) {
                        return (
                          <td
                            key={prov}
                            className={`px-3 py-2.5 align-middle text-center border-r border-border/60 last:border-r-0 ${scrollingBgClass} group-hover:bg-[#1a2334]/70 transition-colors`}
                          >
                            <DistancePill providerResult={pr} />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={prov}
                          className={`px-3 py-2.5 align-middle text-center border-r border-border/60 last:border-r-0 ${scrollingBgClass} group-hover:bg-[#1a2334]/70 transition-colors`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            {/* Distance Badge */}
                            <DistancePill
                              providerResult={pr}
                              expectedResult={entry.expectedResult}
                            />

                            {/* Response Duration & Aggregator */}
                            <div className="flex items-center gap-1 font-mono text-[10px] text-muted">
                              <span>{pr.durationMs} ms</span>
                              {pr.aggregator && (
                                <span
                                  className="text-[9px] px-1 py-0 rounded bg-accent/10 border border-accent/20 text-accent font-mono"
                                  title={`Routed via ${pr.aggregator}`}
                                >
                                  {pr.aggregator === "openrouter" ? "OR" : pr.aggregator}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Sticky Table Footer Summary Row (Precomputed Server Metrics) */}
          <tfoot className="sticky bottom-0 z-30 bg-surface-elevated border-t-2 border-border shadow-lg">
            <tr>
              {/* Fixed Left Summary Label (Sticky bottom & left) */}
              <td
                colSpan={2}
                className="px-3.5 py-2.5 text-left font-semibold text-foreground uppercase tracking-wider border-r-2 border-border/90 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)] sticky bottom-0 left-0 z-50 bg-surface-elevated border-t-2 border-border"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📈</span>
                    <span>Summary Medians ({file.results.length} inputs)</span>
                  </div>
                  <span className="text-[10px] text-muted normal-case font-normal hidden sm:inline">
                    Precomputed at job finish
                  </span>
                </div>
              </td>

              {/* Provider Summary Columns (Sticky bottom) */}
              {file.providers.map((prov) => {
                const s = providerStats[prov];
                const avgDist = s ? s.avgDistanceMeters : null;
                const medianDist = s?.medianDistanceMeters ?? null;
                const effectiveDist = medianDist ?? avgDist;
                const avgMs = s ? s.avgDurationMs : 0;
                const successRate = s ? s.successRate : 0;
                const isTop = prov === topProvider;

                const cat = getAccuracyCategory(effectiveDist);
                let badgeCls = "text-rose-400";
                if (cat === "excellent") badgeCls = "text-emerald-400";
                else if (cat === "moderate") badgeCls = "text-amber-400";

                return (
                  <td
                    key={prov}
                    className="px-3 py-2 text-center border-r border-border/70 last:border-r-0 bg-surface-elevated sticky bottom-0 z-30 border-t-2 border-border"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {/* Highlighted Median Distance */}
                      <span className={`font-mono font-bold ${badgeCls}`}>
                        {formatDistance(effectiveDist)} med
                      </span>

                      {/* Average Distance */}
                      {avgDist !== null && (
                        <span
                          className="font-mono text-muted text-[11px]"
                          title="Average error distance (in-bounds)"
                        >
                          avg {formatDistance(avgDist)}
                        </span>
                      )}

                      {/* Outlier Warning Pill (if any) */}
                      {s?.outliers ? (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-mono font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30"
                          title={`${s.outliers} wild result(s) >460km excluded from average error`}
                        >
                          ⚠ {s.outliers} outlier{s.outliers > 1 ? "s" : ""}
                        </span>
                      ) : null}

                      {/* Average Latency */}
                      <span className="font-mono text-muted">
                        {avgMs} ms avg
                      </span>

                      {/* Success Rate */}
                      <span
                        className={`font-medium ${successRate === 100 ? "text-success" : "text-warning"
                          }`}
                      >
                        {successRate}% success
                      </span>

                      {isTop && (
                        <span className="text-[9px] text-accent font-semibold">
                          👑 Best
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  AddressComparisonRow,
  ProviderRunComparison,
  getDeltaSortScore,
} from "@/lib/compare";
import { JobResultFile } from "@/lib/types";
import DistancePill from "./DistancePill";

interface CompareTableProps {
  rows: AddressComparisonRow[];
  runs: JobResultFile[];
  providers: string[];
}

export default function CompareTable({ rows, runs, providers }: CompareTableProps) {
  const [filterKeyword, setFilterKeyword] = useState("");
  const [trendFilter, setTrendFilter] = useState<"all" | "improved" | "regressed">("all");
  const [sortKey, setSortKey] = useState<string>("index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // Reset to default index order
        setSortKey("index");
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterKeyword.trim()) {
      const q = filterKeyword.toLowerCase();
      result = result.filter((r) => r.input.toLowerCase().includes(q));
    }

    if (trendFilter === "improved") {
      result = result.filter((r) =>
        providers.some((prov) => {
          const comp = r.providers[prov]?.[1]?.deltaToBaseline;
          return comp?.type === "improvement" || comp?.type === "fixed";
        })
      );
    } else if (trendFilter === "regressed") {
      result = result.filter((r) =>
        providers.some((prov) => {
          const comp = r.providers[prov]?.[1]?.deltaToBaseline;
          return comp?.type === "regression" || comp?.type === "failed";
        })
      );
    }

    // Apply sorting
    if (sortKey === "index") {
      result = [...result].sort((a, b) =>
        sortDir === "asc" ? a.index - b.index : b.index - a.index
      );
    } else if (sortKey === "address") {
      result = [...result].sort((a, b) =>
        sortDir === "asc"
          ? a.input.localeCompare(b.input)
          : b.input.localeCompare(a.input)
      );
    } else {
      // Result column sorting: key format is `${prov}:${runIdx}`
      let prov = sortKey;
      let runIdx = runs.length > 1 ? 1 : 0;
      if (sortKey.includes(":")) {
        const parts = sortKey.split(":");
        prov = parts[0];
        runIdx = parseInt(parts[1], 10);
      }

      result = [...result].sort((a, b) => {
        const cellA = a.providers[prov]?.[runIdx];
        const cellB = b.providers[prov]?.[runIdx];

        const scoreA = getDeltaSortScore(cellA, runIdx);
        const scoreB = getDeltaSortScore(cellB, runIdx);

        if (scoreA === null && scoreB === null) return a.index - b.index;
        if (scoreA === null) return 1;
        if (scoreB === null) return -1;

        if (scoreA !== scoreB) {
          return sortDir === "asc" ? scoreA - scoreB : scoreB - scoreA;
        }
        return a.index - b.index;
      });
    }

    return result;
  }, [rows, filterKeyword, trendFilter, providers, sortKey, sortDir, runs.length]);

  const renderSortIndicator = (key: string) => {
    const isActive = sortKey === key;
    if (!isActive) {
      return (
        <span className="opacity-0 group-hover:opacity-60 transition-opacity ml-1 text-[10px]">
          ↕
        </span>
      );
    }
    return (
      <span className="ml-1 text-accent font-bold text-[11px]">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  return (
    <div className="w-full space-y-3">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
            🔍
          </span>
          <input
            type="text"
            placeholder="Filter by address keyword..."
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Trend Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-muted text-[11px] font-medium mr-1">Trend:</span>
          <button
            type="button"
            onClick={() => setTrendFilter("all")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              trendFilter === "all"
                ? "bg-accent text-white"
                : "border border-border bg-surface-elevated text-muted hover:text-foreground"
            }`}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setTrendFilter("improved")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              trendFilter === "improved"
                ? "bg-success text-white"
                : "border border-border bg-surface-elevated text-success hover:bg-success/10"
            }`}
          >
            <span>▲ Improved</span>
          </button>
          <button
            type="button"
            onClick={() => setTrendFilter("regressed")}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              trendFilter === "regressed"
                ? "bg-danger text-white"
                : "border border-border bg-surface-elevated text-danger hover:bg-danger/10"
            }`}
          >
            <span>▼ Regressed</span>
          </button>
        </div>
      </div>

      {/* Full-Width Grid Table */}
      <div className="w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left border-collapse table-auto text-sm">
          <thead>
            {/* Top Header Row: Provider group titles */}
            <tr className="border-b border-border bg-surface-elevated text-muted font-semibold">
              <th
                rowSpan={2}
                onClick={() => handleSort("index")}
                className="sticky left-0 z-20 bg-surface-elevated px-3 py-2 text-center w-12 border-r border-border cursor-pointer hover:bg-surface transition-colors select-none group"
                title="Sort by index"
              >
                <div className="flex items-center justify-center">
                  <span>#</span>
                  {renderSortIndicator("index")}
                </div>
              </th>
              <th
                rowSpan={2}
                onClick={() => handleSort("address")}
                className="sticky left-12 z-20 bg-surface-elevated px-4 py-2 min-w-[280px] max-w-sm border-r border-border cursor-pointer hover:bg-surface transition-colors select-none group"
                title="Sort by address"
              >
                <div className="flex items-center justify-between">
                  <span>INPUT ADDRESS</span>
                  {renderSortIndicator("address")}
                </div>
              </th>
              {providers.map((prov) => {
                const targetSortKey = runs.length > 1 ? `${prov}:1` : `${prov}:0`;
                return (
                  <th
                    key={prov}
                    colSpan={runs.length}
                    onClick={() => handleSort(targetSortKey)}
                    className="px-3 py-1.5 text-center uppercase tracking-wider font-bold border-r border-border last:border-r-0 cursor-pointer hover:bg-surface transition-colors select-none group"
                    title={`Click to sort by ${prov} delta`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-foreground">{prov}</span>
                      {renderSortIndicator(targetSortKey)}
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Sub-Header Row: Run A / Run B / Run C labels and model */}
            <tr className="border-b border-border bg-surface-elevated/70 text-[10px] text-muted">
              {providers.map((prov) =>
                runs.map((r, rIdx) => {
                  const runDateStr = r.completedAt
                    ? new Date(r.completedAt).toLocaleDateString(undefined, {
                        month: "numeric",
                        day: "numeric",
                      })
                    : `Run ${String.fromCharCode(65 + rIdx)}`;

                  const model =
                    r.providerModels?.[prov] ||
                    r.summary?.providers?.[prov]?.model ||
                    r.results?.[0]?.providersResults?.find((p) => p.provider === prov)?.model;

                  const sortColKey = `${prov}:${rIdx}`;
                  const isDeltaColumn = rIdx > 0;
                  const titleText = isDeltaColumn
                    ? `Click to sort by Run ${String.fromCharCode(65 + rIdx)} delta`
                    : "Click to sort by Run A baseline distance";

                  return (
                    <th
                      key={`${prov}-${rIdx}`}
                      onClick={() => handleSort(sortColKey)}
                      className="px-2.5 py-1 text-center font-mono border-r border-border last:border-r-0 min-w-[110px] cursor-pointer hover:bg-surface transition-colors select-none group"
                      title={titleText}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-0.5">
                          {rIdx === 0 ? (
                            <span className="text-muted font-bold">
                              Run A (Base: {runDateStr})
                            </span>
                          ) : (
                            <span className="text-accent font-bold">
                              Run {String.fromCharCode(65 + rIdx)} ({runDateStr})
                            </span>
                          )}
                          {renderSortIndicator(sortColKey)}
                        </div>
                        {model && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-surface border border-border text-foreground font-normal max-w-[110px] truncate"
                            title={`Model: ${model}`}
                          >
                            {model}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border font-sans">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + providers.length * runs.length}
                  className="px-4 py-12 text-center text-muted"
                >
                  No addresses match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => {
                const isEven = rIdx % 2 === 0;
                const rowBg = isEven ? "bg-surface" : "bg-surface-elevated/35";
                const stickyBg = isEven ? "bg-surface" : "bg-[#182030]";

                return (
                  <tr
                    key={row.index}
                    className={`${rowBg} hover:bg-surface-elevated/70 transition-colors`}
                  >
                    {/* Fixed Index Column */}
                    <td
                      className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 text-center font-mono text-[11px] text-muted border-r border-border font-medium`}
                    >
                      {row.index + 1}
                    </td>

                    {/* Fixed Address Column (Opaque background and subtle shadow separator to prevent bleed-through) */}
                    <td
                      className={`sticky left-12 z-10 ${stickyBg} px-4 py-2 text-foreground font-medium border-r-2 border-border shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)] min-w-[280px] max-w-sm truncate`}
                      title={row.input}
                    >
                      {row.input}
                    </td>

                    {/* Provider Sub-Columns for each run */}
                    {providers.map((prov) => {
                      const runList = row.providers[prov] || [];

                      return runs.map((_, runIdx) => {
                        const cellData: ProviderRunComparison | undefined = runList[runIdx];

                        return (
                          <td
                            key={`${prov}-${runIdx}`}
                            className="px-2 py-2 text-center border-r border-border last:border-r-0 align-middle"
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              {/* Standardized Distance Badge */}
                              <DistancePill
                                providerResult={cellData?.result}
                                expectedResult={row.expectedResult}
                              />

                              {/* Delta badge (only for comparison runs > 0 when formattedDelta is non-empty) */}
                              {runIdx > 0 && cellData?.deltaToBaseline?.formattedDelta ? (
                                <span
                                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                                    cellData.deltaToBaseline.type === "improvement"
                                      ? "text-success bg-success/10"
                                      : cellData.deltaToBaseline.type === "regression" ||
                                        cellData.deltaToBaseline.type === "failed"
                                      ? "text-danger bg-danger/10"
                                      : "text-muted"
                                  }`}
                                >
                                  {cellData.deltaToBaseline.formattedDelta}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      });
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

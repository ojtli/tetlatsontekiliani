import { JobResultFile, LatLng, ProviderResult } from "./types";

export interface DeltaResult {
  diffMeters: number | null;
  percentChange: number | null;
  type: "improvement" | "regression" | "neutral" | "fixed" | "failed" | "error";
  formattedDelta: string;
}

export function calculateDelta(
  baseMeters: number | null | undefined,
  compMeters: number | null | undefined
): DeltaResult {
  // If baseline had error, and comparison succeeded -> drop "Fixed" label
  if (
    (baseMeters === null || baseMeters === undefined) &&
    compMeters !== null &&
    compMeters !== undefined
  ) {
    return {
      diffMeters: null,
      percentChange: null,
      type: "fixed",
      formattedDelta: "",
    };
  }

  // If baseline succeeded, and comparison failed -> Failed
  if (
    baseMeters !== null &&
    baseMeters !== undefined &&
    (compMeters === null || compMeters === undefined)
  ) {
    return {
      diffMeters: null,
      percentChange: null,
      type: "failed",
      formattedDelta: "Failed 🔴",
    };
  }

  // Both failed or unavailable
  if (
    baseMeters === null ||
    baseMeters === undefined ||
    compMeters === null ||
    compMeters === undefined
  ) {
    return {
      diffMeters: null,
      percentChange: null,
      type: "error",
      formattedDelta: "N/A",
    };
  }

  const diff = compMeters - baseMeters;

  // If change is negligible (within 2 meters)
  if (Math.abs(diff) <= 2) {
    return {
      diffMeters: 0,
      percentChange: 0,
      type: "neutral",
      formattedDelta: "0%",
    };
  }

  const pct = baseMeters > 0 ? (diff / baseMeters) * 100 : 0;

  // Negative diff means error decreased -> Improvement!
  if (diff < 0) {
    return {
      diffMeters: diff,
      percentChange: pct,
      type: "improvement",
      formattedDelta: `▲ -${Math.abs(Math.round(pct))}%`,
    };
  } else {
    // Positive diff means error increased -> Regression!
    return {
      diffMeters: diff,
      percentChange: pct,
      type: "regression",
      formattedDelta: `▼ +${Math.round(pct)}%`,
    };
  }
}

export interface ProviderRunComparison {
  runIndex: number;
  runDate?: string;
  runLabel?: string;
  model?: string;
  result: ProviderResult | null;
  deltaToBaseline?: DeltaResult;
}

export interface AddressComparisonRow {
  index: number;
  input: string;
  expectedResult: LatLng | null;
  providers: Record<string, ProviderRunComparison[]>;
}

export interface ProviderOverallComparison {
  provider: string;
  baseModel?: string;
  compModel?: string;
  baseAvgDistance: number | null;
  compAvgDistance: number | null;
  baseMedianDistance?: number | null;
  compMedianDistance?: number | null;
  avgDistanceDiff: number | null;
  avgPercentChange: number | null;
  medianDistanceDiff?: number | null;
  medianPercentChange?: number | null;
  improvedCount: number;
  regressedCount: number;
  neutralCount: number;
  fixedCount: number;
  failedCount: number;
  baseSuccessRate: number;
  compSuccessRate: number;
}

/**
 * Align multiple runs by address and compute per-address deltas.
 */
export function buildComparisonRows(runs: JobResultFile[]): AddressComparisonRow[] {
  if (runs.length === 0) return [];
  const baseRun = runs[0];

  return baseRun.results.map((baseEntry, idx) => {
    const row: AddressComparisonRow = {
      index: idx,
      input: baseEntry.input,
      expectedResult: baseEntry.expectedResult,
      providers: {},
    };

    // Find all providers present across all runs
    const allProviders = Array.from(
      new Set(runs.flatMap((r) => r.providers))
    );

    for (const prov of allProviders) {
      row.providers[prov] = [];

      runs.forEach((run, rIdx) => {
        // Find matching entry in this run by address text or index
        const matchEntry =
          run.results.find((e) => e.input === baseEntry.input) || run.results[idx];
        const provRes = matchEntry?.providersResults.find((p) => p.provider === prov) || null;

        const runDate = run.completedAt || run.startedAt;
        const runLabel = `Run ${String.fromCharCode(65 + rIdx)}`;
        const model = provRes?.model || run.providerModels?.[prov] || run.summary?.providers?.[prov]?.model;

        let delta: DeltaResult | undefined = undefined;
        if (rIdx > 0) {
          const baseProvRes = row.providers[prov][0]?.result;
          delta = calculateDelta(baseProvRes?.distanceMeters, provRes?.distanceMeters);
        }

        row.providers[prov].push({
          runIndex: rIdx,
          runDate,
          runLabel,
          model,
          result: provRes,
          deltaToBaseline: delta,
        });
      });
    }

    return row;
  });
}

/**
 * Calculate aggregate comparison metrics for each provider between Run A and Run B.
 */
export function buildOverallComparison(
  rows: AddressComparisonRow[],
  providers: string[],
  baseRun: JobResultFile,
  compRun: JobResultFile
): ProviderOverallComparison[] {
  return providers.map((prov) => {
    let improvedCount = 0;
    let regressedCount = 0;
    let neutralCount = 0;
    let fixedCount = 0;
    let failedCount = 0;

    rows.forEach((row) => {
      const compData = row.providers[prov];
      if (!compData || compData.length < 2) return;
      const delta = compData[1]?.deltaToBaseline;
      if (!delta) return;

      if (delta.type === "improvement") improvedCount++;
      else if (delta.type === "regression") regressedCount++;
      else if (delta.type === "neutral") neutralCount++;
      else if (delta.type === "fixed") fixedCount++;
      else if (delta.type === "failed") failedCount++;
    });

    const baseSummary = baseRun.summary?.providers[prov];
    const compSummary = compRun.summary?.providers[prov];

    const baseModel =
      baseRun.providerModels?.[prov] ||
      baseSummary?.model ||
      rows[0]?.providers[prov]?.[0]?.result?.model;

    const compModel =
      compRun.providerModels?.[prov] ||
      compSummary?.model ||
      rows[0]?.providers[prov]?.[1]?.result?.model;

    const baseAvg = baseSummary?.avgDistanceMeters ?? null;
    const compAvg = compSummary?.avgDistanceMeters ?? null;
    const baseMedian = baseSummary?.medianDistanceMeters ?? baseAvg;
    const compMedian = compSummary?.medianDistanceMeters ?? compAvg;

    let avgDiff: number | null = null;
    let avgPct: number | null = null;

    if (baseAvg !== null && compAvg !== null) {
      avgDiff = compAvg - baseAvg;
      avgPct = baseAvg > 0 ? (avgDiff / baseAvg) * 100 : 0;
    }

    let medianDiff: number | null = null;
    let medianPct: number | null = null;

    if (baseMedian !== null && compMedian !== null) {
      medianDiff = compMedian - baseMedian;
      medianPct = baseMedian > 0 ? (medianDiff / baseMedian) * 100 : 0;
    }

    return {
      provider: prov,
      baseModel,
      compModel,
      baseAvgDistance: baseAvg,
      compAvgDistance: compAvg,
      baseMedianDistance: baseMedian,
      compMedianDistance: compMedian,
      avgDistanceDiff: avgDiff,
      avgPercentChange: avgPct,
      medianDistanceDiff: medianDiff,
      medianPercentChange: medianPct,
      improvedCount: improvedCount + fixedCount,
      regressedCount: regressedCount + failedCount,
      neutralCount,
      fixedCount,
      failedCount,
      baseSuccessRate: baseSummary?.successRate ?? 100,
      compSuccessRate: compSummary?.successRate ?? 100,
    };
  });
}

export interface DefaultComparisonRuns {
  runA: string;
  runB: string;
  runC: string;
}

export function selectDefaultComparisonRuns(
  fileList: Array<{ filename: string; completedAt?: string | null; startedAt?: string | null }>
): DefaultComparisonRuns {
  if (!fileList || fileList.length === 0) {
    return { runA: "", runB: "", runC: "" };
  }

  if (fileList.length === 1) {
    return { runA: fileList[0].filename, runB: "", runC: "" };
  }

  // Sort files newest-first based on completedAt or startedAt
  const sortedNewestFirst = [...fileList].sort(
    (a, b) =>
      new Date(b.completedAt || b.startedAt || 0).getTime() -
      new Date(a.completedAt || a.startedAt || 0).getTime()
  );

  // Run A: second most recent file (sortedNewestFirst[1])
  // Run B: latest file (sortedNewestFirst[0])
  // Run C: "None" ("") by default
  return {
    runA: sortedNewestFirst[1].filename,
    runB: sortedNewestFirst[0].filename,
    runC: "",
  };
}

export interface ResultFileSummaryInfo {
  filename: string;
  completedAt?: string | null;
  startedAt?: string | null;
  providers?: string[];
  totalResults?: number;
}

/**
 * Unifies the label used across all dropdowns that select result files.
 * Format: "Oct 18, 04:12 PM (3 prov, 10 addr)" matching the Results page.
 */
export function formatResultFileOptionLabel(
  file: ResultFileSummaryInfo,
  options?: { locale?: string }
): string {
  let dateStr = file.filename;
  if (file.completedAt) {
    try {
      const d = new Date(file.completedAt);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleString(options?.locale, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      dateStr = file.filename;
    }
  }

  const provCount = file.providers ? file.providers.length : 0;
  const addrCount = file.totalResults ?? 0;

  return `${dateStr} (${provCount} prov, ${addrCount} addr)`;
}

/**
 * Calculates a comparable numeric score for sorting:
 * - Negative values = improvements (e.g. -500m error reduction)
 * - 0 = neutral
 * - Positive values = regressions (e.g. +300m error increase)
 * - Extreme negative (-1e9) = fixed error (baseline failed, comp succeeded)
 * - Extreme positive (+1e9) = failed (baseline succeeded, comp failed)
 * - Null = missing/error on both or unresolvable (placed at end)
 */
export function getDeltaSortScore(
  cell: ProviderRunComparison | undefined,
  runIdx: number
): number | null {
  if (!cell || !cell.result) return null;

  // Run A (baseline): sort by distance in meters, errors at end
  if (runIdx === 0) {
    if (cell.result.error) return 1e9;
    return cell.result.distanceMeters ?? null;
  }

  const delta = cell.deltaToBaseline;
  if (!delta) return null;

  if (delta.type === "failed") {
    // Regression into error: worst regression
    return 1e9;
  }

  if (delta.diffMeters !== null && delta.diffMeters !== undefined) {
    return delta.diffMeters;
  }

  if (delta.type === "improvement" || delta.type === "fixed") {
    // Baseline errored and comp succeeded: best improvement
    return -1e9;
  }

  return null;
}


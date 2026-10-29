import { quantileSorted } from "d3-array";
import { JobResultFile, LatLng } from "./types";
import { isDistanceOutlier } from "./geo";
import {PROVIDER_COLORS} from "@/lib/constants.ts";

export interface PercentileStats {
  min: number;
  p10: number;
  p25: number;
  p50: number; // Median
  p75: number;
  p90: number;
  max: number;
  iqr: number; // p75 - p25
}

export interface EcdfPoint {
  threshold: number;
  percentage: number;
  count: number;
}

export interface ScoreWeights {
  accuracy: number;
  speed: number;
  reliability: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  accuracy: 0.6,
  speed: 0.3,
  reliability: 0.1,
};

export const ECDF_THRESHOLDS = [0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500];

export const PROVIDER_TYPES: Record<string, { label: string; icon: string }> = {
  "google-gemini": { label: "LLM (Flash)", icon: "✨" },
  openai: { label: "LLM (ChatGPT)", icon: "🤖" },
  anthropic: { label: "LLM (Claude)", icon: "🧠" },
  "lm-studio": { label: "Local LLM", icon: "💻" },
  nvidia: { label: "LLM (Nemotron)", icon: "🟢" },
};

export function getProviderColor(provider: string): string {
  if (PROVIDER_COLORS[provider]) return PROVIDER_COLORS[provider];
  const base = provider.split(" ")[0];
  if (PROVIDER_COLORS[base]) return PROVIDER_COLORS[base];
  const hash = provider.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palette = ["#6366f1", "#22c55e", "#06b6d4", "#ec4899", "#f59e0b", "#8b5cf6", "#14b8a6"];
  return palette[hash % palette.length];
}

export function getProviderTypeInfo(provider: string): { label: string; icon: string } {
  if (PROVIDER_TYPES[provider]) return PROVIDER_TYPES[provider];
  const base = provider.split(" ")[0];
  return PROVIDER_TYPES[base] ?? { label: "Provider", icon: "🌐" };
}

export interface ProcessedProviderStats {
  provider: string;
  name: string;
  model?: string;
  color: string;
  typeInfo: { label: string; icon: string };
  totalInputs: number;
  resolvedCount: number;
  errorCount: number;
  hallucinationCount: number; // coordinates returned when expectedResult is null
  trueNegativeCount: number; // correctly returned null when expectedResult is null
  outlierCount: number; // distance > 460km
  successRate: number; // 0 - 100
  distanceStats: PercentileStats;
  durationStats: PercentileStats;
  avgDistanceMeters: number | null;
  rawAvgDistanceMeters: number | null;
  avgDurationMs: number;
  accuracyTiers: {
    excellent: number; // <= 100m
    moderate: number; // 100m - 1000m
    poor: number; // > 1000m
  };
  pinpointPct: number; // % <= 100m
  ecdfPoints: EcdfPoint[];
  isParetoOptimal: boolean;
  accuracyScore: number; // 0 - 100
  speedScore: number; // 0 - 100
  reliabilityScore: number; // 0 - 100
  overallScore: number; // 0 - 100
  rank: number;
  // Relative to baseline provider
  isBaseline: boolean;
  distanceDeltaMeters: number | null;
  distanceDeltaRatio: number | null;
  latencyDeltaMs: number;
  latencySpeedupRatio: number; // vs fastest latency
}

export interface ParetoFrontierPoint {
  provider: string;
  avgDistanceMeters: number;
  avgDurationMs: number;
  distanceMeters?: number;
  durationMs?: number;
}

export interface AddressJitterPoint {
  addressIndex: number;
  input: string;
  expectedResult: LatLng | null;
  providerValues: Record<
    string,
    {
      distanceMeters: number | null;
      durationMs: number;
      isOutlier: boolean;
      error?: string;
    }
  >;
}

export interface WinnerAwards {
  bestAccuracy: {
    provider: ProcessedProviderStats;
    runnerUp?: ProcessedProviderStats;
    deltaMeters: number;
    deltaPct: number;
  } | null;
  fastestLatency: {
    provider: ProcessedProviderStats;
    runnerUp?: ProcessedProviderStats;
    deltaMs: number;
    speedupVsLlmMin: number;
    speedupVsLlmMax: number;
  } | null;
  topReliability: {
    isTie: boolean;
    tieCount: number;
    providers: ProcessedProviderStats[];
    selected: ProcessedProviderStats;
  } | null;
  overallLeader: {
    provider: ProcessedProviderStats;
    score: number;
    accuracyContribution: number;
    speedContribution: number;
    reliabilityContribution: number;
  } | null;
}

export interface BenchmarkStatsResult {
  providers: ProcessedProviderStats[];
  paretoFrontier: ParetoFrontierPoint[];
  winnerAwards: WinnerAwards;
  addressJitterData: AddressJitterPoint[];
  baselineProvider: string;
  weights: ScoreWeights;
}

/**
 * Computes min, percentiles (p10, p25, p50, p75, p90), max, and iqr for a sorted array.
 */
export function computePercentiles(sortedValues: number[]): PercentileStats {
  if (sortedValues.length === 0) {
    return { min: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, max: 0, iqr: 0 };
  }

  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  const p10 = quantileSorted(sortedValues, 0.1) ?? min;
  const p25 = quantileSorted(sortedValues, 0.25) ?? min;
  const p50 = quantileSorted(sortedValues, 0.5) ?? min;
  const p75 = quantileSorted(sortedValues, 0.75) ?? max;
  const p90 = quantileSorted(sortedValues, 0.9) ?? max;
  const iqr = Math.max(0, p75 - p25);

  return {
    min: Math.round(min),
    p10: Math.round(p10),
    p25: Math.round(p25),
    p50: Math.round(p50),
    p75: Math.round(p75),
    p90: Math.round(p90),
    max: Math.round(max),
    iqr: Math.round(iqr),
  };
}

/**
 * Computes ECDF curve points for specified distance thresholds.
 */
export function computeEcdf(sortedDistances: number[], totalValidInputs: number): EcdfPoint[] {
  const total = Math.max(1, totalValidInputs);
  return ECDF_THRESHOLDS.map((threshold) => {
    // Count items <= threshold
    let count = 0;
    for (const d of sortedDistances) {
      if (d <= threshold) count++;
      else break;
    }
    const percentage = Math.round((count / total) * 100);
    return { threshold, percentage, count };
  });
}

/**
 * Computes Pareto frontier for providers.
 * Provider A dominates B if A.avgDistance <= B.avgDistance AND A.avgDuration <= B.avgDuration
 * with at least one strict inequality.
 */
export function computeParetoOptimalProviders(
  providers: Array<{ provider: string; avgDistanceMeters: number | null; avgDurationMs: number }>
): Set<string> {
  const optimal = new Set<string>();

  const valid = providers.filter(
    (p) => p.avgDistanceMeters !== null && !isNaN(p.avgDistanceMeters) && p.avgDurationMs > 0
  );

  for (const a of valid) {
    let isDominated = false;
    for (const b of valid) {
      if (a.provider === b.provider) continue;

      const aDist = a.avgDistanceMeters!;
      const bDist = b.avgDistanceMeters!;
      const aTime = a.avgDurationMs;
      const bTime = b.avgDurationMs;

      // b dominates a if b is at least as good in both, and strictly better in at least one
      if (bDist <= aDist && bTime <= aTime && (bDist < aDist || bTime < aTime)) {
        isDominated = true;
        break;
      }
    }
    if (!isDominated) {
      optimal.add(a.provider);
    }
  }

  return optimal;
}

/**
 * Calculates dynamic composite score based on customizable weights.
 */
export function calculateCompositeScore(
  accuracyScore: number,
  speedScore: number,
  reliabilityScore: number,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
): {
  overallScore: number;
  accuracyContribution: number;
  speedContribution: number;
  reliabilityContribution: number;
} {
  const totalWeight = weights.accuracy + weights.speed + weights.reliability || 1;
  const normAcc = weights.accuracy / totalWeight;
  const normSpd = weights.speed / totalWeight;
  const normRel = weights.reliability / totalWeight;

  const accuracyContribution = Math.round(accuracyScore * normAcc);
  const speedContribution = Math.round(speedScore * normSpd);
  const reliabilityContribution = Math.round(reliabilityScore * normRel);
  const overallScore = Math.min(100, accuracyContribution + speedContribution + reliabilityContribution);

  return {
    overallScore,
    accuracyContribution,
    speedContribution,
    reliabilityContribution,
  };
}

/**
 * Main processor: Transforms a JobResultFile into rich distributional benchmark stats.
 */
export function processBenchmarkStats(
  file: JobResultFile,
  options?: {
    weights?: ScoreWeights;
    baselineProvider?: string;
  }
): BenchmarkStatsResult {
  const weights = options?.weights ?? DEFAULT_SCORE_WEIGHTS;
  const rawProviders = file.providers || [];

  // Group addresses and check negative inputs
  const addressJitterData: AddressJitterPoint[] = [];

  // Intermediate accumulator per provider
  interface ProviderAccumulator {
    inBoundDistances: number[];
    rawDistances: number[];
    durations: number[];
    resolvedCount: number;
    errorCount: number;
    hallucinationCount: number;
    trueNegativeCount: number;
    outlierCount: number;
    validInputsCount: number;
  }

  const accumulators: Record<string, ProviderAccumulator> = {};
  for (const prov of rawProviders) {
    accumulators[prov] = {
      inBoundDistances: [],
      rawDistances: [],
      durations: [],
      resolvedCount: 0,
      errorCount: 0,
      hallucinationCount: 0,
      trueNegativeCount: 0,
      outlierCount: 0,
      validInputsCount: 0,
    };
  }

  // Iterate results
  file.results.forEach((entry, addressIndex) => {
    const isNegativeInput = entry.expectedResult === null;
    const providerValues: AddressJitterPoint["providerValues"] = {};

    for (const pr of entry.providersResults) {
      const acc = accumulators[pr.provider];
      if (!acc) continue;

      const hasCoords = pr.result !== null && typeof pr.result.lat === "number" && typeof pr.result.lng === "number";
      const duration = typeof pr.durationMs === "number" ? pr.durationMs : 0;
      if (duration > 0) acc.durations.push(duration);

      let isOutlier = false;
      let dist: number | null = null;

      if (isNegativeInput) {
        // Rule 1: Expected null
        if (hasCoords) {
          // False Positive (Hallucination)
          acc.hallucinationCount++;
          acc.errorCount++;
        } else {
          // True Negative (Success)
          acc.trueNegativeCount++;
        }
      } else {
        // Expected coordinates exist
        acc.validInputsCount++;

        if (hasCoords) {
          acc.resolvedCount++;
          dist = typeof pr.distanceMeters === "number" ? pr.distanceMeters : null;

          if (dist !== null && !isNaN(dist)) {
            acc.rawDistances.push(dist);

            if (isDistanceOutlier(dist)) {
              isOutlier = true;
              acc.outlierCount++;
            } else {
              acc.inBoundDistances.push(dist);
            }
          }
        } else {
          acc.errorCount++;
        }
      }

      providerValues[pr.provider] = {
        distanceMeters: dist,
        durationMs: duration,
        isOutlier: isOutlier || (dist !== null && isDistanceOutlier(dist)),
        error: pr.error,
      };
    }

    addressJitterData.push({
      addressIndex,
      input: entry.input,
      expectedResult: entry.expectedResult,
      providerValues,
    });
  });

  // Calculate Base Stats
  const baseStats = rawProviders.map((prov) => {
    const acc = accumulators[prov];
    const s = file.summary?.providers?.[prov];

    // Sort arrays for quantile calculations
    acc.inBoundDistances.sort((a, b) => a - b);
    acc.rawDistances.sort((a, b) => a - b);
    acc.durations.sort((a, b) => a - b);

    const distanceStats = computePercentiles(acc.inBoundDistances);
    const durationStats = computePercentiles(acc.durations);

    // Mean error: prioritize server summary if available, else derive from in-bound distances
    let avgDist: number | null = null;
    if (s && typeof s.avgDistanceMeters === "number") {
      avgDist = s.avgDistanceMeters;
    } else if (acc.inBoundDistances.length > 0) {
      avgDist = Math.round(acc.inBoundDistances.reduce((a, b) => a + b, 0) / acc.inBoundDistances.length);
    }

    let rawAvgDist: number | null = null;
    if (s && typeof s.rawAvgDistanceMeters === "number") {
      rawAvgDist = s.rawAvgDistanceMeters;
    } else if (acc.rawDistances.length > 0) {
      rawAvgDist = Math.round(acc.rawDistances.reduce((a, b) => a + b, 0) / acc.rawDistances.length);
    }

    const avgDuration =
      s && typeof s.avgDurationMs === "number"
        ? s.avgDurationMs
        : acc.durations.length > 0
        ? Math.round(acc.durations.reduce((a, b) => a + b, 0) / acc.durations.length)
        : 0;

    const totalInputs = file.results.length;
    const resolvedCount = acc.resolvedCount + acc.trueNegativeCount;
    const errorCount = acc.errorCount;
    const successRate = totalInputs > 0 ? Math.round((resolvedCount / totalInputs) * 100) : 0;

    const accuracyTiers = s?.accuracyTiers ?? {
      excellent: acc.inBoundDistances.filter((d) => d <= 100).length,
      moderate: acc.inBoundDistances.filter((d) => d > 100 && d <= 1000).length,
      poor: acc.rawDistances.filter((d) => d > 1000).length,
    };

    const validCount = acc.validInputsCount || acc.inBoundDistances.length || 1;
    const pinpointPct = Math.round((accuracyTiers.excellent / validCount) * 100);

    const ecdfPoints = computeEcdf(acc.inBoundDistances, validCount);

    // Scores
    // Accuracy Score: Exponential decay from 0 error (100 pts) down to 10km (0 pts)
    // Uses Median error distance (distanceStats.p50), which is robust against extreme spatial outliers
    const medianDist = distanceStats.p50;
    const effectiveDist =
      medianDist !== null && medianDist !== undefined ? medianDist : (avgDist ?? 10000);
    const accuracyScore = Math.max(0, Math.min(100, Math.round(100 / (1 + effectiveDist / 250))));

    // Speed Score: Instant (<200ms = 100), decaying as duration grows
    const speedScore = Math.max(0, Math.min(100, Math.round(100 / (1 + avgDuration / 800))));

    // Reliability Score: successRate with penalty for hallucinations
    const reliabilityScore = Math.max(
      0,
      Math.min(100, successRate - (acc.hallucinationCount > 0 ? acc.hallucinationCount * 10 : 0))
    );

    const { overallScore } = calculateCompositeScore(accuracyScore, speedScore, reliabilityScore, weights);

    const model = file.providerModels?.[prov] || s?.model;

    return {
      provider: prov,
      name: prov,
      model,
      color: getProviderColor(prov),
      typeInfo: getProviderTypeInfo(prov),
      totalInputs,
      resolvedCount,
      errorCount,
      hallucinationCount: acc.hallucinationCount,
      trueNegativeCount: acc.trueNegativeCount,
      outlierCount: acc.outlierCount,
      successRate,
      distanceStats,
      durationStats,
      avgDistanceMeters: avgDist,
      rawAvgDistanceMeters: rawAvgDist,
      avgDurationMs: avgDuration,
      accuracyTiers,
      pinpointPct,
      ecdfPoints,
      accuracyScore,
      speedScore,
      reliabilityScore,
      overallScore,
    };
  });

  // Calculate Pareto Frontier using Median Distance & Median Duration
  const paretoSet = computeParetoOptimalProviders(
    baseStats.map((p) => ({
      provider: p.provider,
      avgDistanceMeters: p.distanceStats.p50,
      avgDurationMs: p.durationStats.p50,
    }))
  );

  // Sort by overallScore descending to assign preliminary ranks
  const sortedByScore = [...baseStats].sort((a, b) => b.overallScore - a.overallScore);

  // Default baseline provider: top ranked overall, or user specified
  const effectiveBaseline =
    options?.baselineProvider && sortedByScore.some((p) => p.provider === options.baselineProvider)
      ? options.baselineProvider
      : sortedByScore[0]?.provider || rawProviders[0];

  const baselineStats = sortedByScore.find((p) => p.provider === effectiveBaseline) || sortedByScore[0];

  const fastestMedianLatencyMs =
    Math.min(...baseStats.map((p) => p.durationStats.p50).filter((ms) => ms > 0)) || 1;

  // Enriched provider stats with relative deltas & ranks
  const enrichedProviders: ProcessedProviderStats[] = sortedByScore.map((prov, index) => {
    const isBaseline = prov.provider === effectiveBaseline;
    const isParetoOptimal = paretoSet.has(prov.provider);

    let distanceDeltaMeters: number | null = null;
    let distanceDeltaRatio: number | null = null;
    if (
      prov.distanceStats?.p50 !== null &&
      prov.distanceStats?.p50 !== undefined &&
      baselineStats?.distanceStats?.p50 !== null &&
      baselineStats?.distanceStats?.p50 !== undefined &&
      baselineStats
    ) {
      distanceDeltaMeters = prov.distanceStats.p50 - baselineStats.distanceStats.p50;
      distanceDeltaRatio = Number(
        (prov.distanceStats.p50 / (baselineStats.distanceStats.p50 || 1)).toFixed(2)
      );
    }

    const latencyDeltaMs =
      prov.durationStats.p50 - (baselineStats?.durationStats.p50 ?? prov.durationStats.p50);
    const latencySpeedupRatio = Number((prov.durationStats.p50 / fastestMedianLatencyMs).toFixed(1));

    return {
      ...prov,
      rank: index + 1,
      isBaseline,
      isParetoOptimal,
      distanceDeltaMeters,
      distanceDeltaRatio,
      latencyDeltaMs,
      latencySpeedupRatio,
    };
  });

  // Build Pareto Frontier Points sorted by median latency ascending
  const paretoFrontier: ParetoFrontierPoint[] = enrichedProviders
    .filter((p) => p.isParetoOptimal && p.distanceStats.p50 !== null)
    .sort((a, b) => a.durationStats.p50 - b.durationStats.p50)
    .map((p) => ({
      provider: p.provider,
      avgDistanceMeters: p.distanceStats.p50,
      avgDurationMs: p.durationStats.p50,
      distanceMeters: p.distanceStats.p50,
      durationMs: p.durationStats.p50,
    }));

  // Build Winner Awards
  // Use Median error distance (distanceStats.p50) as the primary accuracy marker
  const validAcc = enrichedProviders.filter(
    (p) => p.distanceStats.p50 !== null && p.distanceStats.p50 !== undefined
  );
  const sortedByAccuracy = [...validAcc].sort(
    (a, b) => a.distanceStats.p50 - b.distanceStats.p50
  );
  const bestAcc = sortedByAccuracy[0];
  const runnerUpAcc = sortedByAccuracy[1];

  let bestAccuracyAward = null;
  if (bestAcc) {
    const deltaMeters = runnerUpAcc ? runnerUpAcc.distanceStats.p50 - bestAcc.distanceStats.p50 : 0;
    const deltaPct =
      runnerUpAcc && runnerUpAcc.distanceStats.p50 > 0
        ? Math.round((deltaMeters / runnerUpAcc.distanceStats.p50) * 100)
        : 0;
    bestAccuracyAward = {
      provider: bestAcc,
      runnerUp: runnerUpAcc,
      deltaMeters,
      deltaPct,
    };
  }

  // Use Median latency (durationStats.p50) as the primary speed marker
  const sortedByLatency = [...enrichedProviders].sort(
    (a, b) => a.durationStats.p50 - b.durationStats.p50
  );
  const fastest = sortedByLatency[0];
  const runnerUpLatency = sortedByLatency[1];

  let fastestLatencyAward = null;
  if (fastest) {
    const deltaMs = runnerUpLatency
      ? runnerUpLatency.durationStats.p50 - fastest.durationStats.p50
      : 0;
    const llmProviders = enrichedProviders.filter(
      (p) => p.typeInfo.label.toLowerCase().includes("llm") && p.durationStats.p50 > 0
    );
    const llmRatios = llmProviders.map(
      (p) => p.durationStats.p50 / (fastest.durationStats.p50 || 1)
    );
    const speedupVsLlmMin = llmRatios.length > 0 ? Number(Math.min(...llmRatios).toFixed(1)) : 1;
    const speedupVsLlmMax = llmRatios.length > 0 ? Number(Math.max(...llmRatios).toFixed(1)) : 1;

    fastestLatencyAward = {
      provider: fastest,
      runnerUp: runnerUpLatency,
      deltaMs,
      speedupVsLlmMin,
      speedupVsLlmMax,
    };
  }

  // Top Reliability Award
  // If multiple tie at 100%, track the tie and pick the one with 0 outliers + lowest P90 tail error
  const maxSuccess = Math.max(...enrichedProviders.map((p) => p.successRate));
  const topReliableTied = enrichedProviders.filter((p) => p.successRate === maxSuccess);
  const sortedTied = [...topReliableTied].sort((a, b) => {
    if (a.outlierCount !== b.outlierCount) return a.outlierCount - b.outlierCount;
    return a.distanceStats.p90 - b.distanceStats.p90;
  });
  const selectedReliable = sortedTied[0] || enrichedProviders[0];

  const topReliabilityAward = selectedReliable
    ? {
        isTie: topReliableTied.length > 1,
        tieCount: topReliableTied.length,
        providers: topReliableTied,
        selected: selectedReliable,
      }
    : null;

  // Overall Leader Award
  const overallLeaderProv = enrichedProviders[0];
  let overallLeaderAward = null;
  if (overallLeaderProv) {
    const comp = calculateCompositeScore(
      overallLeaderProv.accuracyScore,
      overallLeaderProv.speedScore,
      overallLeaderProv.reliabilityScore,
      weights
    );
    overallLeaderAward = {
      provider: overallLeaderProv,
      score: comp.overallScore,
      accuracyContribution: comp.accuracyContribution,
      speedContribution: comp.speedContribution,
      reliabilityContribution: comp.reliabilityContribution,
    };
  }

  return {
    providers: enrichedProviders,
    paretoFrontier,
    winnerAwards: {
      bestAccuracy: bestAccuracyAward,
      fastestLatency: fastestLatencyAward,
      topReliability: topReliabilityAward,
      overallLeader: overallLeaderAward,
    },
    addressJitterData,
    baselineProvider: effectiveBaseline,
    weights,
  };
}

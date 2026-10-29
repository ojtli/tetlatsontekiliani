import { getDistance, getPreciseDistance } from "geolib";
import { LatLng } from "./types.ts";

/**
 * Calculate geodesic distance between two points in meters using geolib.
 * Uses high-precision ellipsoidal distance calculation.
 */
export function calculateDistanceMeters(
  point1: LatLng,
  point2: LatLng,
  precise: boolean = true
): number {
  if (
    !point1 ||
    !point2 ||
    typeof point1.lat !== "number" ||
    typeof point1.lng !== "number" ||
    typeof point2.lat !== "number" ||
    typeof point2.lng !== "number"
  ) {
    throw new Error("Invalid coordinates provided to calculateDistanceMeters");
  }

  const from = { latitude: point1.lat, longitude: point1.lng };
  const to = { latitude: point2.lat, longitude: point2.lng };

  return precise ? getPreciseDistance(from, to) : getDistance(from, to);
}

/**
 * Format a distance in meters to a human-readable string (e.g. "45 m", "1.24 km").
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || isNaN(meters)) {
    return "N/A";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
}

/**
 * Get visual accuracy category based on error distance in meters.
 * - green: < 100m
 * - yellow: 100m - 1000m
 * - red: > 1000m
 */
export function getAccuracyCategory(
  meters: number | null | undefined
): "excellent" | "moderate" | "poor" | "error" {
  if (meters === null || meters === undefined || isNaN(meters)) {
    return "error";
  }
  if (meters <= 100) return "excellent";
  if (meters <= 1000) return "moderate";
  return "poor";
}

import { GeocodingResultEntry, JobSummary, ProviderSummaryMetrics } from "./types.ts";

/**
 * Maximum geographic span of Costa Rica territory (Salinas Bay to Punta Burica) is ~460 km.
 * Any geocoded response yielding an error distance greater than 460,000 meters
 * is treated as an outlier (e.g. coordinates in other countries/continents).
 */
export const COSTA_RICA_MAX_SPAN_METERS = 460_000;

export function isDistanceOutlier(distanceMeters: number | null | undefined): boolean {
  return typeof distanceMeters === "number" && distanceMeters > COSTA_RICA_MAX_SPAN_METERS;
}

/**
 * Calculates the statistical median of an array of numbers.
 */
export function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

/**
 * Calculate comprehensive summary metrics across all geocoding results for a job run.
 * Used on the server right at the end of a job run to persist precomputed metrics.
 * Excludes geographic outliers (>460km) from avg/median distance to prevent wild
 * coordinates in other countries from skewing provider accuracy representation.
 */
export function calculateJobSummary(
  results: GeocodingResultEntry[],
  providers: string[],
  elapsedMs: number = 0
): JobSummary {
  const providersMap: Record<string, ProviderSummaryMetrics> = {};
  const inBoundsDistancesMap: Record<string, number[]> = {};
  const allDistancesMap: Record<string, number[]> = {};

  for (const prov of providers) {
    inBoundsDistancesMap[prov] = [];
    allDistancesMap[prov] = [];
    providersMap[prov] = {
      provider: prov,
      total: results.length,
      success: 0,
      errors: 0,
      outliers: 0,
      successRate: 0,
      totalMs: 0,
      avgDurationMs: 0,
      totalDistanceMeters: 0,
      avgDistanceMeters: null,
      medianDistanceMeters: null,
      rawAvgDistanceMeters: null,
      minDistanceMeters: null,
      maxDistanceMeters: null,
      accuracyTiers: {
        excellent: 0,
        moderate: 0,
        poor: 0,
      },
    };
  }

  for (const entry of results) {
    const isExpectedNull = entry.expectedResult === null;

    for (const pr of entry.providersResults) {
      const s = providersMap[pr.provider];
      if (!s) continue;

      if (pr.error) {
        s.errors += 1;
        s.accuracyTiers.poor += 1;
      } else if (isExpectedNull) {
        // Expected is null (non-address or invalid input)
        if (pr.result === null) {
          // Provider correctly identified and rejected invalid/non-address input!
          s.success += 1;
          s.totalMs += pr.durationMs || 0;
          s.accuracyTiers.excellent += 1;
        } else {
          // Provider hallucinated coordinates when null was expected (False Positive)
          s.errors += 1;
          s.accuracyTiers.poor += 1;
        }
      } else {
        // Expected is a valid coordinate
        if (!pr.result) {
          s.errors += 1;
          s.accuracyTiers.poor += 1;
        } else {
          s.success += 1;
          s.totalMs += pr.durationMs || 0;

          if (pr.distanceMeters !== null && pr.distanceMeters !== undefined) {
            allDistancesMap[pr.provider].push(pr.distanceMeters);

            // Check if this response is an outlier (> 460km)
            if (isDistanceOutlier(pr.distanceMeters)) {
              s.outliers += 1;
              s.accuracyTiers.poor += 1;
            } else {
              // In-bounds prediction: included in typical distance metrics
              inBoundsDistancesMap[pr.provider].push(pr.distanceMeters);
              s.totalDistanceMeters += pr.distanceMeters;

              if (s.minDistanceMeters === null || pr.distanceMeters < s.minDistanceMeters) {
                s.minDistanceMeters = pr.distanceMeters;
              }
              if (s.maxDistanceMeters === null || pr.distanceMeters > s.maxDistanceMeters) {
                s.maxDistanceMeters = pr.distanceMeters;
              }

              const cat = getAccuracyCategory(pr.distanceMeters);
              if (cat === "excellent") s.accuracyTiers.excellent += 1;
              else if (cat === "moderate") s.accuracyTiers.moderate += 1;
              else s.accuracyTiers.poor += 1;
            }
          }
        }
      }
    }
  }

  let topProvider: string | null = null;
  let lowestMedian = Infinity;

  for (const [prov, s] of Object.entries(providersMap)) {
    if (s.total > 0) {
      s.successRate = Math.round((s.success / s.total) * 100);
    }
    if (s.success > 0) {
      s.avgDurationMs = Math.round(s.totalMs / s.success);
    }

    const inBounds = inBoundsDistancesMap[prov] || [];
    const all = allDistancesMap[prov] || [];

    // Outlier-excluded representative metrics
    if (inBounds.length > 0) {
      s.avgDistanceMeters = Math.round(s.totalDistanceMeters / inBounds.length);
      s.medianDistanceMeters = calculateMedian(inBounds);

      const effectiveScoreMetric = s.medianDistanceMeters ?? s.avgDistanceMeters;
      if (effectiveScoreMetric !== null && effectiveScoreMetric < lowestMedian) {
        lowestMedian = effectiveScoreMetric;
        topProvider = prov;
      }
    }

    // Raw arithmetic mean across all results including outliers (for transparency)
    if (all.length > 0) {
      const sumAll = all.reduce((acc, d) => acc + d, 0);
      s.rawAvgDistanceMeters = Math.round(sumAll / all.length);
    }
  }

  return {
    totalInputs: results.length,
    completedInputs: results.length,
    elapsedMs,
    topProvider,
    providers: providersMap,
  };
}

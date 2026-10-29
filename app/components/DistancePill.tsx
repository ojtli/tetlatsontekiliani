import React from "react";
import { formatDistance, getAccuracyCategory, isDistanceOutlier } from "@/lib/geo";
import { LatLng, ProviderResult } from "@/lib/types";

export interface DistancePillProps {
  /** Optional full ProviderResult object */
  providerResult?: ProviderResult | null;
  /** Explicit distance in meters (overrides providerResult.distanceMeters) */
  distanceMeters?: number | null;
  /** Explicit result coordinates (overrides providerResult.result) */
  resultCoords?: LatLng | null;
  /** Expected target coordinates from benchmark input */
  expectedResult?: LatLng | null;
  /** Explicit outlier override */
  isOutlier?: boolean;
  /** Model name */
  model?: string;
  /** Aggregator name (e.g. openrouter) */
  aggregator?: string;
  /** Error message if request failed */
  error?: string;
  /** Additional custom classes */
  className?: string;
}

/**
 * Shared DistancePill component used in both ResultsTable and CompareTable.
 * Displays geocoding accuracy tier (excellent <100m, moderate 100m-1km, poor >1km,
 * outlier >460km, or null rejection validation) with standardized visual styling.
 */
export default function DistancePill({
  providerResult,
  distanceMeters,
  resultCoords,
  expectedResult,
  isOutlier: isOutlierProp,
  model: modelProp,
  aggregator: aggregatorProp,
  error: errorProp,
  className = "",
}: DistancePillProps) {
  // Resolve values from props or providerResult
  const error = errorProp ?? providerResult?.error;
  const dist = distanceMeters !== undefined ? distanceMeters : providerResult?.distanceMeters;
  const coords = resultCoords !== undefined ? resultCoords : providerResult?.result;
  const isOutlier =
    isOutlierProp !== undefined
      ? isOutlierProp
      : providerResult?.isOutlier || (dist !== null && dist !== undefined && isDistanceOutlier(dist));
  const model = modelProp ?? providerResult?.model;
  const aggregator = aggregatorProp ?? providerResult?.aggregator;

  // 1. Error state
  if (error) {
    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/25 ${className}`}
        title={`Error: ${error}`}
      >
        ✕ Error
      </span>
    );
  }

  // 2. Missing / N/A state
  if (dist === null || dist === undefined) {
    // Check if null was explicitly expected (ground truth is null)
    if (expectedResult === null) {
      if (coords === null) {
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ${className}`}
            title="Correctly rejected non-address / unresolvable input"
          >
            ✓ Null
          </span>
        );
      } else if (coords) {
        return (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold bg-rose-500/15 text-rose-400 border-rose-500/30 ${className}`}
            title={`Hallucinated coordinates (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) when null was expected`}
          >
            False Pos
          </span>
        );
      }
    }

    return <span className={`text-[10px] text-muted italic ${className}`}>N/A</span>;
  }

  // 3. Expected null ground truth evaluation
  if (expectedResult === null) {
    if (coords === null) {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border-emerald-500/30 ${className}`}
          title="Correctly rejected non-address / unresolvable input"
        >
          ✓ Null
        </span>
      );
    } else {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold bg-rose-500/15 text-rose-400 border-rose-500/30 ${className}`}
          title={
            coords
              ? `Hallucinated coordinates (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) when null was expected`
              : "Coordinates returned when null was expected"
          }
        >
          False Pos
        </span>
      );
    }
  }

  // 4. Normal or Outlier distance evaluation
  const cat = getAccuracyCategory(dist);
  let badgeColorCls = "bg-rose-500/15 text-rose-400 border-rose-500/30";
  let badgeText = formatDistance(dist);
  let tooltip = `${dist} meters from expected`;

  if (isOutlier) {
    badgeColorCls = "bg-purple-950/70 text-purple-300 border-purple-500/60 shadow-sm";
    badgeText = `⚠ ${formatDistance(dist)}`;
    tooltip = `Outlier (${formatDistance(dist)}): Position exceeded Costa Rica's 460km max span. Excluded from provider average accuracy.`;
  } else if (cat === "excellent") {
    badgeColorCls = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    tooltip = `Excellent: ${dist} meters from expected`;
  } else if (cat === "moderate") {
    badgeColorCls = "bg-amber-500/15 text-amber-400 border-amber-500/30";
    tooltip = `Moderate: ${dist} meters from expected`;
  }

  if (model) tooltip += ` • Model: ${model}`;
  if (aggregator) tooltip += ` • Aggregator: ${aggregator}`;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-semibold ${badgeColorCls} ${className}`}
      title={tooltip}
    >
      {badgeText}
    </span>
  );
}

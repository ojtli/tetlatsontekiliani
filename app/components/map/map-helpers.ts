import { formatDistance } from "@/lib/geo";
import { DeltaResult } from "@/lib/compare";
import { PROVIDER_COLORS, PROVIDER_INITIALS } from "@/lib/constants";

/**
 * Immutably toggles membership of an item in a Set.
 * Returns a new Set with the item added if absent, or removed if present.
 */
export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

/**
 * Creates HTML snippet for outlier notification badge.
 */
export function createOutlierNoticeHtml(isOutlier: boolean, distMeters: number): string {
  if (!isOutlier) return "";
  return `<div style="background: #581c87; color: #f3e8ff; padding: 4px 6px; border-radius: 4px; font-size: 10px; margin-bottom: 6px; font-weight: 600;">
    ⚠ Outlier (${formatDistance(distMeters)}) - Exceeds Costa Rica's 460km span
  </div>`;
}

/**
 * HTML for the target DivIcon pill badge (🎯 #1).
 */
export function createTargetDivIconHtml(entryIdx: number, isSelected = false): string {
  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 2px 7px;
      border-radius: 9999px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
      font-size: 11px;
      font-weight: 700;
      border: 2px solid white;
      box-shadow: ${
        isSelected
          ? "0 0 18px rgba(245, 158, 11, 1), 0 0 0 2px #f59e0b"
          : "0 0 14px rgba(245, 158, 11, 0.7)"
      };
      cursor: pointer;
      white-space: nowrap;
      ${isSelected ? "transform: scale(1.15); z-index: 999;" : ""}
    ">
      <span>🎯</span>
      <span>#${entryIdx + 1}</span>
    </div>
  `;
}

/**
 * HTML for a provider's circular initial badge marker pin.
 */
export function createProviderDivIconHtml(provider: string, color: string): string {
  const initial = PROVIDER_INITIALS[provider] ?? provider.charAt(0).toUpperCase();
  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background-color: ${color};
      color: white;
      font-size: 10px;
      font-weight: 700;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      cursor: pointer;
    ">
      ${initial}
    </div>
  `;
}

/**
 * HTML popup for the ground truth target pin in single focus view.
 */
export function createTargetMarkerPopupHtml(
  entryIdx: number,
  input: string,
  lat: number,
  lng: number
): string {
  return `
    <div style="font-family: inherit; font-size: 12px; color: #e2e8f0; max-width: 260px; padding: 2px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span style="font-size: 15px;">🎯</span>
        <span style="font-weight: 700; color: #f59e0b;">Ground Truth Target #${entryIdx + 1}</span>
      </div>
      <p style="margin: 0 0 4px 0; font-weight: 600; line-height: 1.35; color: #f8fafc;">${input}</p>
      <p style="font-family: monospace; font-size: 10px; color: #94a3b8; margin: 0;">
        ${lat.toFixed(6)}, ${lng.toFixed(6)}
      </p>
    </div>
  `;
}

/**
 * HTML popup for overview target pin (when zoomed out, with "Zoom In & View Circles" button).
 */
export function createOverviewTargetPopupHtml(
  entryIdx: number,
  input: string,
  lat: number,
  lng: number,
  buttonId: string
): string {
  return `
    <div style="font-family: inherit; font-size: 12px; color: #e2e8f0; max-width: 240px; padding: 2px;">
      <p style="font-weight: 700; margin: 0 0 4px 0; color: #f59e0b;">🎯 Target #${entryIdx + 1}</p>
      <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.35; color: #f1f5f9;">${input}</p>
      <p style="font-family: monospace; font-size: 10px; color: #94a3b8; margin: 0 0 8px 0;">
        ${lat.toFixed(6)}, ${lng.toFixed(6)}
      </p>
      <button
        id="${buttonId}"
        style="
          width: 100%;
          padding: 5px 8px;
          border-radius: 6px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          border: none;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
        "
      >
        Zoom In &amp; View Circles →
      </button>
    </div>
  `;
}

export interface ProviderCirclePopupOptions {
  provider: string;
  color?: string;
  entryIdx: number;
  distMeters: number;
  durationMs: number;
  lat: number;
  lng: number;
  isOutlier: boolean;
  runLabel?: string;
  delta?: DeltaResult | null;
}

/**
 * HTML popup for a provider's geodesic error circle.
 */
export function createProviderCirclePopupHtml({
  provider,
  color,
  entryIdx,
  distMeters,
  durationMs,
  lat,
  lng,
  isOutlier,
  runLabel,
  delta,
}: ProviderCirclePopupOptions): string {
  const provColor = color ?? PROVIDER_COLORS[provider] ?? "#888";
  const outlierNotice = createOutlierNoticeHtml(isOutlier, distMeters);
  const runBadge = runLabel
    ? `<span style="font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #334155; color: #f8fafc;">${runLabel}</span>`
    : "";

  const deltaRow = delta
    ? `
    <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
      <span style="color: #94a3b8;">vs Baseline (Run A):</span>
      <span style="font-weight: 700; font-family: monospace; color: ${
        delta.type === "improvement"
          ? "#22c55e"
          : delta.type === "regression"
          ? "#ef4444"
          : "#94a3b8"
      };">
        ${delta.formattedDelta}
      </span>
    </div>
    `
    : "";

  return `
    <div style="font-family: inherit; font-size: 12px; color: #e2e8f0; min-width: 190px; padding: 2px;">
      ${outlierNotice}
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 10px; height: 10px; border-radius: 9999px; background-color: ${provColor}; display: inline-block;"></span>
          <span style="font-weight: 700; text-transform: uppercase; color: #f8fafc;">${provider}</span>
          ${!runLabel ? `<span style="font-size: 10px; color: #94a3b8;">(#${entryIdx + 1})</span>` : ""}
        </div>
        ${runBadge}
      </div>
      <div style="background: #1e293b; padding: 6px 8px; border-radius: 6px; margin-bottom: 6px; border: 1px solid #334155;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
          <span style="color: #94a3b8;">Error Distance:</span>
          <span style="font-weight: 700; font-family: monospace; color: ${provColor};">${formatDistance(distMeters)}</span>
        </div>
        ${deltaRow}
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span style="color: #94a3b8;">Latency:</span>
          <span style="font-family: monospace; color: #e2e8f0;">${durationMs} ms</span>
        </div>
      </div>
      <p style="font-family: monospace; font-size: 10px; color: #94a3b8; margin: 0;">
        Returned: ${lat.toFixed(6)}, ${lng.toFixed(6)}
      </p>
    </div>
  `;
}

export interface ProviderPinPopupOptions {
  provider: string;
  color?: string;
  entryIdx: number;
  distMeters: number;
  lat: number;
  lng: number;
  delta?: DeltaResult | null;
}

/**
 * HTML popup for a provider's pin marker at the returned coordinates.
 */
export function createProviderPinPopupHtml({
  provider,
  color,
  entryIdx,
  distMeters,
  lat,
  lng,
  delta,
}: ProviderPinPopupOptions): string {
  const provColor = color ?? PROVIDER_COLORS[provider] ?? "#888";
  const deltaHtml = delta
    ? `
    <p style="margin: 0 0 2px 0; font-size: 11px; font-weight: 600; color: ${
      delta.type === "improvement"
        ? "#22c55e"
        : delta.type === "regression"
        ? "#ef4444"
        : "#94a3b8"
    };">
      Delta: ${delta.formattedDelta}
    </p>
  `
    : "";

  return `
    <div style="font-family: inherit; font-size: 12px; color: #e2e8f0; min-width: 190px; padding: 2px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 9999px; background-color: ${provColor}; display: inline-block;"></span>
        <span style="font-weight: 700; color: #f8fafc;">${provider}</span>
        <span style="font-size: 10px; color: #94a3b8;">(#${entryIdx + 1})</span>
      </div>
      <p style="margin: 0 0 2px 0; font-weight: 600; color: ${provColor};">Distance: ${formatDistance(distMeters)}</p>
      ${deltaHtml}
      <p style="font-family: monospace; font-size: 10px; color: #94a3b8; margin: 0;">${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
    </div>
  `;
}

"use client";

import { AUTO_CIRCLES_ZOOM_THRESHOLD } from "@/lib/constants";

export interface MapToolbarProps {
  currentIndex: number;
  results: Array<{ input: string }>;
  onSelectAddress: (index: number) => void;
  showAllInputs: boolean;
  onToggleShowAll: () => void;
  isDarkMap: boolean;
  onToggleDarkMap: () => void;
  currentZoom: number;
  onFitBounds: () => void;
  showAllButtonId?: string;
  fitBoundsButtonId?: string;
}

export default function MapToolbar({
  currentIndex,
  results,
  onSelectAddress,
  showAllInputs,
  onToggleShowAll,
  isDarkMap,
  onToggleDarkMap,
  currentZoom,
  onFitBounds,
  showAllButtonId = "btn-show-all-pins",
  fitBoundsButtonId = "btn-fit-bounds",
}: MapToolbarProps) {
  const isAutoCirclesActive = showAllInputs && currentZoom >= AUTO_CIRCLES_ZOOM_THRESHOLD;
  const total = results.length;

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-surface-elevated/70 border-b border-border shrink-0">
      {/* Address Stepper Navigation */}
      <div className="flex items-center gap-2 flex-1 max-w-2xl">
        <button
          type="button"
          onClick={() => onSelectAddress(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 font-medium"
          title="Previous address"
        >
          ← Prev
        </button>

        {/* Address Dropdown */}
        <select
          value={currentIndex}
          onChange={(e) => onSelectAddress(Number(e.target.value))}
          className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-surface font-medium text-foreground truncate focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {results.map((entry, idx) => (
            <option key={idx} value={idx}>
              #{idx + 1} - {entry.input}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onSelectAddress(Math.min(total - 1, currentIndex + 1))}
          disabled={currentIndex >= total - 1}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 font-medium"
          title="Next address"
        >
          Next →
        </button>
      </div>

      {/* Mode Toggles & Provider Layer Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Zoom hint when Show All is active */}
        {showAllInputs && (
          <span
            className={`text-[11px] px-2.5 py-1 rounded-md border font-medium transition-colors ${
              isAutoCirclesActive
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-surface text-muted"
            }`}
          >
            {isAutoCirclesActive
              ? "🎯 Circles Auto-Visible"
              : `🔍 Zoom in to reveal circles (${currentZoom}/${AUTO_CIRCLES_ZOOM_THRESHOLD})`}
          </span>
        )}

        {/* Tile Theme Toggle */}
        <button
          type="button"
          onClick={onToggleDarkMap}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer flex items-center gap-1"
          title="Toggle between dark mode map tiles and standard OpenStreetMap tiles"
        >
          <span>{isDarkMap ? "🌙 Dark" : "☀️ Standard"}</span>
        </button>

        {/* Show All Toggle */}
        <button
          id={showAllButtonId}
          type="button"
          onClick={onToggleShowAll}
          className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            showAllInputs
              ? "border-accent bg-accent text-white shadow-sm"
              : "border-border bg-surface text-muted hover:text-foreground"
          }`}
        >
          <span>{showAllInputs ? "🎯 Focus Active" : "🗺️ Show All Target Pins"}</span>
        </button>

        {/* Fit Bounds Button */}
        <button
          id={fitBoundsButtonId}
          type="button"
          onClick={onFitBounds}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer"
          title="Reset map view to fit bounds"
        >
          Fit View ⛶
        </button>
      </div>
    </div>
  );
}

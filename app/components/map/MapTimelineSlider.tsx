"use client";

import { JobResultFile } from "@/lib/types";

export interface MapTimelineSliderProps {
  runs: JobResultFile[];
  activeRunIndex: number;
  onSelectRunIndex: (index: number) => void;
}

export default function MapTimelineSlider({
  runs,
  activeRunIndex,
  onSelectRunIndex,
}: MapTimelineSliderProps) {
  const dotColors = ["bg-amber-400", "bg-emerald-400", "bg-cyan-400", "bg-purple-400"];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-surface-elevated border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-base">⏳</span>
        <div>
          <span className="font-semibold text-foreground">Timeline Slider:</span>
          <span className="text-muted ml-1.5 text-[11px]">
            Drag slider to watch geocoding circles evolve across benchmark runs
          </span>
        </div>
      </div>

      {/* Step Slider & Buttons */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {runs.map((r, rIdx) => {
            const isSelected = activeRunIndex === rIdx;
            const dateStr = r.completedAt
              ? new Date(r.completedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : `Run ${String.fromCharCode(65 + rIdx)}`;

            return (
              <button
                key={rIdx}
                type="button"
                onClick={() => onSelectRunIndex(rIdx)}
                className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-accent text-white shadow-md font-semibold ring-1 ring-accent-hover"
                    : "bg-surface text-muted hover:text-foreground border border-border"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    dotColors[rIdx % dotColors.length]
                  }`}
                />
                <span>
                  Run {String.fromCharCode(65 + rIdx)} ({dateStr})
                </span>
              </button>
            );
          })}
        </div>

        {/* Stepper slider range */}
        <input
          type="range"
          min={0}
          max={runs.length - 1}
          step={1}
          value={activeRunIndex}
          onChange={(e) => onSelectRunIndex(Number(e.target.value))}
          className="w-24 sm:w-32 accent-accent cursor-pointer"
        />
      </div>
    </div>
  );
}

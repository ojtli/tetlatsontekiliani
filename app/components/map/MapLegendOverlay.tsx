"use client";

import { PROVIDER_COLORS } from "@/lib/constants";
import { formatDistance } from "@/lib/geo";

export interface MapLegendOverlayProps {
  providers: string[];
  visibleProviders: Set<string>;
  onToggleProvider: (prov: string) => void;
  activeEntry?: {
    providersResults: Array<{
      provider: string;
      error?: string | null;
      distanceMeters?: number | null;
    }>;
  } | null;
  badgeLabel?: string;
  title?: string;
}

export default function MapLegendOverlay({
  providers,
  visibleProviders,
  onToggleProvider,
  activeEntry,
  badgeLabel,
  title,
}: MapLegendOverlayProps) {
  const displayTitle = title ?? (badgeLabel ? "Toggle Circles:" : "Toggle Error Circles:");

  return (
    <div className="absolute top-3 right-3 z-10 p-2.5 rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md shadow-xl space-y-1.5 max-w-[210px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-semibold text-muted block tracking-wider">
          {displayTitle}
        </span>
        {badgeLabel && (
          <span className="text-[10px] font-bold text-accent font-mono">{badgeLabel}</span>
        )}
      </div>

      <div className="space-y-1">
        {providers.map((prov) => {
          const isChecked = visibleProviders.has(prov);
          const color = PROVIDER_COLORS[prov] ?? "#888";
          const pr = activeEntry?.providersResults.find((p) => p.provider === prov);

          return (
            <label
              key={prov}
              className="flex items-center justify-between gap-2 p-1 rounded hover:bg-surface-elevated/60 cursor-pointer select-none"
            >
              <div className="flex items-center gap-1.5 truncate">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleProvider(prov)}
                  className="rounded border-border text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-foreground text-[11px] font-medium">{prov}</span>
              </div>
              {pr && (
                <span className="font-mono text-[10px] text-muted shrink-0">
                  {pr.error ? "err" : formatDistance(pr.distanceMeters)}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

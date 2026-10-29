"use client";

export interface MapAddressOverlayProps {
  currentIndex: number;
  input?: string;
  expectedResult?: { lat: number; lng: number } | null;
  badgeText?: string;
  badgeClassName?: string;
}

export default function MapAddressOverlay({
  currentIndex,
  input,
  expectedResult,
  badgeText,
  badgeClassName,
}: MapAddressOverlayProps) {
  if (!input) return null;

  const defaultBadgeClass =
    "text-[10px] px-2 py-0.5 rounded bg-surface-elevated text-accent font-medium ml-auto";

  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-lg p-3 rounded-xl border border-border/80 bg-surface/90 backdrop-blur-md shadow-xl pointer-events-auto">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-400 font-bold">🎯 Target #{currentIndex + 1}</span>
        <span className="text-muted font-mono text-[10px]">
          {expectedResult
            ? `${expectedResult.lat.toFixed(6)}, ${expectedResult.lng.toFixed(6)}`
            : "Expected: NULL"}
        </span>
        {badgeText && (
          <span className={badgeClassName ?? defaultBadgeClass}>
            {badgeText}
          </span>
        )}
      </div>
      <p className="font-medium text-foreground leading-snug line-clamp-2">
        {input}
      </p>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { ProcessedProviderStats } from "@/lib/benchmark-stats";
import { formatDistance } from "@/lib/geo";
import { Target, Zap, CheckCircle2 } from "lucide-react";

interface StatsExecutiveComparisonProps {
  providers: ProcessedProviderStats[];
  selectedProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}

export default function StatsExecutiveComparison({
  providers,
  selectedProvider,
  onSelectProvider,
}: StatsExecutiveComparisonProps) {
  // 1. Sort providers for Card A: Accuracy (lowest avg error is #1)
  // 1. Sort providers for Card A: Accuracy (lowest median error distance is #1)
  const accuracyRanked = useMemo(() => {
    return [...providers].sort((a, b) => {
      const distA = a.distanceStats?.p50 ?? a.avgDistanceMeters ?? 999999;
      const distB = b.distanceStats?.p50 ?? b.avgDistanceMeters ?? 999999;
      return distA - distB;
    });
  }, [providers]);

  // 2. Sort providers for Card B: Speed (fastest median duration is #1)
  const speedRanked = useMemo(() => {
    return [...providers].sort((a, b) => a.durationStats.p50 - b.durationStats.p50);
  }, [providers]);

  // Global scale bounds
  const bestMedianDistance = accuracyRanked[0]?.distanceStats?.p50 ?? 1;
  const maxMedianDistance = Math.max(
    ...accuracyRanked.map((p) => p.distanceStats?.p50 ?? 0),
    100
  );

  const fastestDuration = speedRanked[0]?.durationStats?.p50 ?? 1;
  const maxDuration = Math.max(
    ...speedRanked.map((p) => p.durationStats?.p90 ?? p.durationStats?.p50),
    2800
  );

  // 500ms Real-Time UX threshold percentage on the speed scale
  const realTimeThresholdPct = Math.min(100, Math.max(0, (500 / maxDuration) * 100));

  return (
    <section className="space-y-3" aria-labelledby="executive-overview-heading">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-b border-border/70 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h2
            id="executive-overview-heading"
            className="text-base sm:text-lg font-bold text-foreground tracking-tight"
          >
            Head-to-Head Provider Comparison
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-muted">
          Direct comparison of accuracy, pinpoint consistency, and response speed across all evaluated providers
        </p>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ───────────────────────────────────────────────────────────────────
            1A. LEFT CARD: ACCURACY & PINPOINT CONSISTENCY
        ─────────────────────────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-border bg-surface shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            {/* Card Header & Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
                    Accuracy &amp; Pinpoint Consistency
                  </h3>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Lower median error is superior. Evaluated across all test addresses.
                </p>
              </div>

              {/* Tier Legend */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted self-start sm:self-auto bg-surface-elevated/70 px-2 py-1 rounded-md border border-border/60">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>&le;100m</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>100m–1km</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>&gt;1km</span>
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted border-l border-border/80 pl-1.5">
                  <span className="font-bold text-foreground">|</span>
                  <span>Mean</span>
                </span>
              </div>
            </div>

            {/* Provider List: Ranked #1 to #N */}
            <div className="space-y-3.5 mt-3.5">
              {accuracyRanked.map((prov, idx) => {
                const rank = idx + 1;
                const isSelected = selectedProvider === prov.provider;
                const isDimmed = selectedProvider && !isSelected;

                const avgDist = prov.avgDistanceMeters ?? 0;
                const medianDist = prov.distanceStats?.p50 ?? 0;

                // Relative delta vs #1 based on median
                const deltaMeters = medianDist - bestMedianDistance;
                const errorRatio = bestMedianDistance > 0 ? medianDist / bestMedianDistance : 1;

                // Layer 1 width percentage (relative to worst median error)
                const errorBarPct = Math.min(100, Math.max(4, (medianDist / maxMedianDistance) * 100));
                // Mean tick position inside Layer 1
                const meanTickPct = Math.min(100, Math.max(0, (avgDist / maxMedianDistance) * 100));

                // Layer 2: 3-tier pinpoint breakdown
                const total = prov.totalInputs || 1;
                const pinpointCount = prov.accuracyTiers?.excellent ?? 0;
                const moderateCount = prov.accuracyTiers?.moderate ?? 0;
                const poorCount = prov.accuracyTiers?.poor ?? 0;

                const pinpointPct = (pinpointCount / total) * 100;
                const moderatePct = (moderateCount / total) * 100;
                const poorPct = (poorCount / total) * 100;

                return (
                  <div
                    key={`accuracy-rank-${prov.provider}`}
                    onClick={() => onSelectProvider(isSelected ? null : prov.provider)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-surface-elevated border-emerald-500/70 shadow-md ring-1 ring-emerald-500/30"
                        : "border-border/60 bg-surface-elevated/40 hover:bg-surface-elevated/80 hover:border-border"
                    } ${isDimmed ? "opacity-40" : "opacity-100"}`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                            rank === 1
                              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                              : "bg-surface border border-border text-muted"
                          }`}
                        >
                          #{rank}
                        </span>

                        {/* Color dot & Provider Name */}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: prov.color }}
                        />
                        <span className="font-bold text-foreground text-sm truncate">
                          {prov.name}
                        </span>
                        {prov.model && (
                          <span
                            className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border/80 text-muted truncate max-w-[120px]"
                            title={prov.model}
                          >
                            {prov.model}
                          </span>
                        )}
                      </div>

                      {/* Primary Metrics & Relative Pill */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="font-mono font-extrabold text-sm text-foreground">
                            {formatDistance(medianDist)} <span className="text-[11px] font-normal text-muted">median</span>
                          </div>
                          <div className="font-mono text-[11px] text-muted -mt-0.5">
                            {formatDistance(avgDist)} avg
                          </div>
                        </div>

                        {/* Relative Callout Pill */}
                        {rank === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            🏆 Best Accuracy
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                              errorRatio >= 3
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                            title={`+${Math.round(deltaMeters)}m median error vs #${1}`}
                          >
                            {errorRatio.toFixed(1)}x error (+{formatDistance(deltaMeters)})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dual-Layer Intuitive Visual Bar */}
                    <div className="space-y-1.5 pt-1">
                      {/* Layer 1: Error Distance Bar scaled to maxMedianDistance */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                          <span>Median Error Distance</span>
                          <span>{formatDistance(medianDist)}</span>
                        </div>
                        <div className="relative h-2.5 w-full bg-slate-900/80 rounded-full border border-slate-800 overflow-visible">
                          {/* Colored Median Bar */}
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${errorBarPct}%`,
                              backgroundColor: prov.color,
                            }}
                          />
                          {/* Vertical Mean Tick Mark */}
                          <div
                            className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-white shadow-sm z-10"
                            style={{ left: `${Math.min(99, meanTickPct)}%` }}
                            title={`Mean: ${formatDistance(avgDist)}`}
                          />
                        </div>
                      </div>

                      {/* Layer 2: 3-Tier Pinpoint Breakdown Strip */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-muted">Resolution Tiers</span>
                          <span className="font-bold text-emerald-400">
                            {pinpointPct.toFixed(0)}% Pinpoint ({pinpointCount}/{total})
                          </span>
                        </div>

                        {/* Segmented 10px Bar */}
                        <div
                          className="h-[10px] w-full rounded-md overflow-hidden flex bg-slate-900/90 border border-border/60"
                          title={`Pinpoint: ${pinpointCount} (${pinpointPct.toFixed(1)}%), Moderate: ${moderateCount} (${moderatePct.toFixed(1)}%), Poor: ${poorCount} (${poorPct.toFixed(1)}%)`}
                        >
                          {pinpointPct > 0 && (
                            <div
                              style={{ width: `${pinpointPct}%` }}
                              className="h-full bg-emerald-500 hover:brightness-110 transition-all cursor-help"
                            />
                          )}
                          {moderatePct > 0 && (
                            <div
                              style={{ width: `${moderatePct}%` }}
                              className="h-full bg-amber-500 hover:brightness-110 transition-all cursor-help"
                            />
                          )}
                          {poorPct > 0 && (
                            <div
                              style={{ width: `${poorPct}%` }}
                              className="h-full bg-rose-500 hover:brightness-110 transition-all cursor-help"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────────────
            1B. RIGHT CARD: RESPONSE SPEED & REAL-TIME VIABILITY
        ─────────────────────────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-border bg-surface shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            {/* Card Header & UX Limit Marker */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
                    Response Speed &amp; Real-Time Viability
                  </h3>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Faster response time is superior. Sub-500ms is required for interactive typing UX.
                </p>
              </div>

              {/* Sub-500ms Zone Indicator */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 self-start sm:self-auto bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/25">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>&le; 500ms Interactive UX</span>
              </div>
            </div>

            {/* Provider List: Ranked #1 to #N by Speed */}
            <div className="space-y-3.5 mt-3.5 relative">
              {speedRanked.map((prov, idx) => {
                const rank = idx + 1;
                const isSelected = selectedProvider === prov.provider;
                const isDimmed = selectedProvider && !isSelected;

                const avgMs = prov.avgDurationMs;
                const medianMs = prov.durationStats?.p50 ?? avgMs;
                const p10Ms = prov.durationStats?.p10 ?? avgMs * 0.8;
                const p90Ms = prov.durationStats?.p90 ?? avgMs * 1.2;

                const deltaMs = medianMs - fastestDuration;
                const speedMultiplier = fastestDuration > 0 ? medianMs / fastestDuration : 1;

                // Position percentages on the scale (median-anchored)
                const barWidthPct = Math.min(100, Math.max(3, (medianMs / maxDuration) * 100));
                const p10Pct = Math.min(100, Math.max(0, (p10Ms / maxDuration) * 100));
                const p90Pct = Math.min(100, Math.max(0, (p90Ms / maxDuration) * 100));

                const isRealTime = medianMs <= 500;

                return (
                  <div
                    key={`speed-rank-${prov.provider}`}
                    onClick={() => onSelectProvider(isSelected ? null : prov.provider)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-surface-elevated border-amber-500/70 shadow-md ring-1 ring-amber-500/30"
                        : "border-border/60 bg-surface-elevated/40 hover:bg-surface-elevated/80 hover:border-border"
                    } ${isDimmed ? "opacity-40" : "opacity-100"}`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                            rank === 1
                              ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/40"
                              : "bg-surface border border-border text-muted"
                          }`}
                        >
                          #{rank}
                        </span>

                        {/* Color dot & Provider Name */}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: prov.color }}
                        />
                        <span className="font-bold text-foreground text-sm truncate">
                          {prov.name}
                        </span>
                        {isRealTime ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Real-Time ⚡
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono text-muted bg-surface border border-border/80">
                            Batch / Async
                          </span>
                        )}
                      </div>

                      {/* Primary Metrics & Speed Multiplier Pill */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="font-mono font-extrabold text-sm text-foreground">
                            {Math.round(medianMs)}ms <span className="text-[11px] font-normal text-muted">median</span>
                          </div>
                          <div className="font-mono text-[11px] text-muted -mt-0.5">
                            {Math.round(avgMs)}ms avg
                          </div>
                        </div>

                        {/* Multiplier Badge */}
                        {rank === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ⚡ 1.0x Fastest
                          </span>
                        ) : speedMultiplier <= 1.2 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {speedMultiplier.toFixed(1)}x (+{Math.round(deltaMs)}ms)
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                              speedMultiplier >= 8
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {speedMultiplier.toFixed(1)}x slower
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Latency Bar with P10–P90 Spread & Real-Time Threshold */}
                    <div className="space-y-1 pt-1">
                      <div className="relative h-4 w-full bg-slate-900/80 rounded-md border border-slate-800 overflow-hidden">
                        {/* Sub-500ms Real-Time Safe Zone Background Tint */}
                        <div
                          className="absolute top-0 bottom-0 left-0 bg-emerald-500/10 border-r border-emerald-500/30"
                          style={{ width: `${realTimeThresholdPct}%` }}
                        />

                        {/* Subtle P10–P90 Range Bar */}
                        <div
                          className="absolute top-1 bottom-1 rounded bg-white/10"
                          style={{
                            left: `${p10Pct}%`,
                            width: `${Math.max(2, p90Pct - p10Pct)}%`,
                          }}
                          title={`P10–P90 Latency Spread: ${Math.round(p10Ms)}ms – ${Math.round(p90Ms)}ms`}
                        />

                        {/* Primary Median Duration Bar */}
                        <div
                          className="h-full rounded-l-md transition-all duration-300 relative"
                          style={{
                            width: `${barWidthPct}%`,
                            backgroundColor: prov.color,
                            opacity: isRealTime ? 0.95 : 0.85,
                          }}
                        />

                        {/* 500ms UX Limit Dashed Line */}
                        <div
                          className="absolute top-0 bottom-0 border-r-2 border-dashed border-emerald-400 pointer-events-none z-10"
                          style={{ left: `${realTimeThresholdPct}%` }}
                        />
                      </div>

                      {/* Bar Footer Metrics */}
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted px-0.5">
                        <span>P10: {Math.round(p10Ms)}ms</span>
                        <span className="text-emerald-400 font-semibold">
                          500ms UX Limit
                        </span>
                        <span>P90: {Math.round(p90Ms)}ms</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

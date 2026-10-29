"use client";

import { Target, Zap, ShieldCheck, Trophy } from "lucide-react";
import { WinnerAwards, ProcessedProviderStats } from "@/lib/benchmark-stats";
import { formatDistance } from "@/lib/geo";

interface StatsWinnerCardsProps {
  awards: WinnerAwards;
  selectedProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}

export default function StatsWinnerCards({
  awards,
  selectedProvider,
  onSelectProvider,
}: StatsWinnerCardsProps) {
  const { bestAccuracy, fastestLatency, topReliability, overallLeader } = awards;

  const handleCardClick = (prov: ProcessedProviderStats | undefined) => {
    if (!prov) return;
    onSelectProvider(selectedProvider === prov.provider ? null : prov.provider);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* ───────────────────────────────────────────────────────────────────────
          CARD 1: BEST ACCURACY
      ─────────────────────────────────────────────────────────────────────── */}
      {bestAccuracy && (
        <div
          id="award-best-accuracy"
          onClick={() => handleCardClick(bestAccuracy.provider)}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none bg-surface/90 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between ${
            selectedProvider === bestAccuracy.provider.provider
              ? "border-emerald-500 shadow-lg ring-1 ring-emerald-500/30"
              : "border-border hover:border-emerald-500/50 shadow-sm"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>Best Accuracy</span>
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: bestAccuracy.provider.color }}
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-foreground capitalize truncate">
                {bestAccuracy.provider.name}
              </h3>
              <div className="text-right">
                <span className="font-mono text-base font-extrabold text-emerald-400">
                  {formatDistance(bestAccuracy.provider.distanceStats.p50)}
                </span>
                <span className="text-[11px] font-normal text-muted ml-1">median</span>
              </div>
            </div>

            <p className="text-[12px] text-muted mt-0.5">
              Avg: <strong className="text-foreground">{formatDistance(bestAccuracy.provider.avgDistanceMeters)}</strong> •{" "}
              <strong className="text-foreground">{bestAccuracy.provider.pinpointPct}%</strong> &le;100m
            </p>
          </div>

          <div className="mt-3 space-y-1.5">
            {/* Runner-up Delta Pill */}
            {bestAccuracy.runnerUp && (
              <div className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300 font-medium flex items-center gap-1 truncate">
                <span>▼</span>
                <span className="font-bold">{bestAccuracy.deltaPct}% lower error</span>
                <span>(-{formatDistance(bestAccuracy.deltaMeters)})</span>
                <span className="text-emerald-400/80 truncate">vs #2 {bestAccuracy.runnerUp.name}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono">
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                P90: {formatDistance(bestAccuracy.provider.distanceStats.p90)}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                {bestAccuracy.provider.typeInfo.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          CARD 2: FASTEST LATENCY
      ─────────────────────────────────────────────────────────────────────── */}
      {fastestLatency && (
        <div
          id="award-fastest-latency"
          onClick={() => handleCardClick(fastestLatency.provider)}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none bg-surface/90 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between ${
            selectedProvider === fastestLatency.provider.provider
              ? "border-cyan-500 shadow-lg ring-1 ring-cyan-500/30"
              : "border-border hover:border-cyan-500/50 shadow-sm"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Fastest Latency</span>
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: fastestLatency.provider.color }}
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-foreground capitalize truncate">
                {fastestLatency.provider.name}
              </h3>
              <div className="text-right">
                <span className="font-mono text-base font-extrabold text-cyan-400">
                  {fastestLatency.provider.durationStats.p50} ms
                </span>
                <span className="text-[11px] font-normal text-muted ml-1">median</span>
              </div>
            </div>

            <p className="text-[12px] text-muted mt-0.5">
              Avg: <strong className="text-foreground">{fastestLatency.provider.avgDurationMs} ms</strong> •{" "}
              Fastest (1.0x baseline)
            </p>
          </div>

          <div className="mt-3 space-y-1.5">
            {/* Speed Separation Pill */}
            <div className="px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-[11px] text-cyan-300 font-medium flex items-center gap-1 truncate">
              <span>⚡</span>
              {fastestLatency.runnerUp ? (
                <span>
                  <strong className="font-bold">{fastestLatency.deltaMs}ms faster</strong> vs #2 {fastestLatency.runnerUp.name}
                </span>
              ) : (
                <span>Unrivaled speed</span>
              )}
              {fastestLatency.speedupVsLlmMin > 1 && (
                <span className="text-cyan-400/80 hidden sm:inline">
                  • {fastestLatency.speedupVsLlmMin}x–{fastestLatency.speedupVsLlmMax}x vs LLMs
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono">
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                Range: {fastestLatency.provider.durationStats.min}–{fastestLatency.provider.durationStats.max} ms
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                {fastestLatency.provider.typeInfo.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          CARD 3: TOP RELIABILITY (WITH TIE-BREAKING CONTEXT)
      ─────────────────────────────────────────────────────────────────────── */}
      {topReliability && (
        <div
          id="award-top-reliability"
          onClick={() => handleCardClick(topReliability.selected)}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none bg-surface/90 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between ${
            selectedProvider === topReliability.selected.provider
              ? "border-amber-500 shadow-lg ring-1 ring-amber-500/30"
              : "border-border hover:border-amber-500/50 shadow-sm"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Top Reliability</span>
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: topReliability.selected.color }}
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-foreground capitalize truncate">
                {topReliability.isTie ? (
                  <span>{topReliability.selected.name}</span>
                ) : (
                  <span>{topReliability.selected.name}</span>
                )}
              </h3>
              <span className="font-mono text-base font-extrabold text-amber-400">
                {topReliability.selected.successRate}%
              </span>
            </div>

            <p className="text-[12px] text-muted mt-0.5">
              {topReliability.isTie ? (
                <span>
                  <strong className="text-amber-300 font-semibold">{topReliability.tieCount}-Way 100% Tie</strong> • 0 dropouts
                </span>
              ) : (
                <span>
                  <strong className="text-foreground">{topReliability.selected.resolvedCount}/{topReliability.selected.totalInputs}</strong> resolved • 0 dropouts
                </span>
              )}
            </p>
          </div>

          <div className="mt-3 space-y-1.5">
            {/* Tie Context or Zero Error Pill */}
            <div className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 font-medium flex items-center gap-1 truncate">
              <span>🛡️</span>
              {topReliability.isTie ? (
                <span>Tied at 100% • Lowest P90 tail: {formatDistance(topReliability.selected.distanceStats.p90)}</span>
              ) : (
                <span>Zero geocoding dropouts or timeouts</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono">
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                Outliers: {topReliability.selected.outlierCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                {topReliability.selected.typeInfo.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          CARD 4: OVERALL LEADER (WITH WEIGHTED POINT CONTRIBUTION PROGRESS BAR)
      ─────────────────────────────────────────────────────────────────────── */}
      {overallLeader && (
        <div
          id="award-overall-leader"
          onClick={() => handleCardClick(overallLeader.provider)}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none bg-accent/5 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between ${
            selectedProvider === overallLeader.provider.provider
              ? "border-accent shadow-lg ring-1 ring-accent/40"
              : "border-accent/40 hover:border-accent shadow-sm"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-accent" />
                <span>Overall Leader</span>
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: overallLeader.provider.color }}
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-base font-bold text-foreground capitalize truncate">
                {overallLeader.provider.name}
              </h3>
              <span className="font-mono text-base font-extrabold text-accent">
                {overallLeader.score} / 100
              </span>
            </div>

            <p className="text-[12px] text-muted mt-0.5">
              Rank #1 composite across accuracy, speed &amp; reliability
            </p>
          </div>

          <div className="mt-3 space-y-1.5">
            {/* 3-Segment Mini Progress Bar */}
            <div className="space-y-1">
              <div className="flex h-2.5 w-full rounded-full bg-surface-elevated overflow-hidden p-0.5 border border-border/60">
                <div
                  title={`Accuracy pts: ${overallLeader.accuracyContribution}`}
                  style={{ width: `${overallLeader.accuracyContribution}%` }}
                  className="bg-emerald-400 rounded-l-full transition-all duration-300"
                />
                <div
                  title={`Speed pts: ${overallLeader.speedContribution}`}
                  style={{ width: `${overallLeader.speedContribution}%` }}
                  className="bg-cyan-400 transition-all duration-300"
                />
                <div
                  title={`Reliability pts: ${overallLeader.reliabilityContribution}`}
                  style={{ width: `${overallLeader.reliabilityContribution}%` }}
                  className="bg-purple-400 rounded-r-full transition-all duration-300"
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                <span className="text-emerald-400 font-semibold">{overallLeader.accuracyContribution} Acc</span>
                <span className="text-cyan-400 font-semibold">{overallLeader.speedContribution} Spd</span>
                <span className="text-purple-400 font-semibold">{overallLeader.reliabilityContribution} Rel</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono pt-0.5">
              <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                Rank #1
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-elevated">
                {overallLeader.provider.typeInfo.label}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

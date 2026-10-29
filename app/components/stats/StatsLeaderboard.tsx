"use client";

import { useState } from "react";
import { SlidersHorizontal, Target, Zap, ShieldCheck } from "lucide-react";
import {
  ProcessedProviderStats,
  ScoreWeights,
} from "@/lib/benchmark-stats";
import { ScenarioPreset, SCENARIO_PRESETS } from "@/lib/useBenchmarkStats";
import { formatDistance } from "@/lib/geo";

interface StatsLeaderboardProps {
  providers: ProcessedProviderStats[];
  weights: ScoreWeights;
  onUpdateWeights: (weights: ScoreWeights) => void;
  activePreset: ScenarioPreset | "custom";
  onApplyPreset: (preset: ScenarioPreset) => void;
  baselineProvider: string;
  onSelectBaseline: (provider: string) => void;
  selectedProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}

export default function StatsLeaderboard({
  providers,
  weights,
  onUpdateWeights,
  activePreset,
  onApplyPreset,
  onSelectBaseline,
  selectedProvider,
  onSelectProvider,
}: StatsLeaderboardProps) {
  const [showWeightSliders, setShowWeightSliders] = useState(false);

  const handleSliderChange = (key: keyof ScoreWeights, value: number) => {
    const rawVal = value / 100;
    onUpdateWeights({
      ...weights,
      [key]: rawVal,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden space-y-0">
      {/* ───────────────────────────────────────────────────────────────────────
          HEADER & SCENARIO CONTROLS
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="p-4 border-b border-border bg-surface-elevated/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🏆</span>
            <h3 className="font-semibold text-foreground uppercase tracking-wider text-[13px]">
              Comprehensive Performance Leaderboard
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium border border-accent/25">
              Interactive Scoring &amp; Baseline Delta Mode
            </span>
          </div>
          <p className="text-[12px] text-muted mt-0.5">
            Ranked by composite score. Click any row to set as{" "}
            <span className="text-amber-400 font-semibold">Baseline Reference (REF)</span> to compare relative deltas.
          </p>
        </div>

        {/* Preset Buttons & Slider Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface text-[12px]">
            {(Object.keys(SCENARIO_PRESETS) as ScenarioPreset[]).map((presetKey) => {
              const preset = SCENARIO_PRESETS[presetKey];
              const isActive = activePreset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => onApplyPreset(presetKey)}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors flex items-center gap-1 ${
                    isActive
                      ? "bg-accent text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span className="hidden sm:inline">{preset.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowWeightSliders(!showWeightSliders)}
            className={`px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              showWeightSliders
                ? "bg-accent/15 border-accent text-accent"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
            title="Adjust Accuracy, Speed, and Reliability Weights"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Customize Weights</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          EXPANDABLE WEIGHT ADJUSTMENT SLIDERS
      ─────────────────────────────────────────────────────────────────────── */}
      {showWeightSliders && (
        <div className="p-3.5 bg-surface-elevated/70 border-b border-border/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12px] animate-fadeIn">
          {/* Accuracy Weight */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                <span>Accuracy Weight:</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {Math.round(weights.accuracy * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(weights.accuracy * 100)}
              onChange={(e) => handleSliderChange("accuracy", Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Speed Weight */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400 font-semibold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Speed Weight:</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {Math.round(weights.speed * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(weights.speed * 100)}
              onChange={(e) => handleSliderChange("speed", Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
          </div>

          {/* Reliability Weight */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-purple-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Reliability Weight:</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {Math.round(weights.reliability * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(weights.reliability * 100)}
              onChange={(e) => handleSliderChange("reliability", Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────
          TABLE CONTENT
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-elevated text-muted text-[11px]">
              <th className="px-3 py-2.5 text-center w-12 font-semibold">Rank</th>
              <th className="px-3 py-2.5 font-semibold">Provider / Model</th>
              <th className="px-3 py-2.5 text-right font-semibold">
                <span>Error Distance</span>
                <span className="block text-[10px] text-muted/70 font-normal">Median / Mean / P90</span>
              </th>
              <th className="px-3 py-2.5 font-semibold min-w-[150px]">
                <span>Accuracy Tiers</span>
                <span className="block text-[10px] text-muted/70 font-normal">&le;100m • 100m-1km • &gt;1km</span>
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">
                <span>Latency</span>
                <span className="block text-[10px] text-muted/70 font-normal">Median / Multiplier</span>
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                <span>Reliability</span>
                <span className="block text-[10px] text-muted/70 font-normal">Success / Outliers</span>
              </th>
              <th className="px-4 py-2.5 text-right font-bold text-foreground min-w-[180px]">
                <span>Composite Score</span>
                <span className="block text-[10px] text-muted/70 font-normal">Acc • Spd • Rel Contribution</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {providers.map((prov) => {
              const isSelected = selectedProvider === prov.provider;
              const isBaseline = prov.isBaseline;
              const isTop = prov.rank === 1;

              return (
                <tr
                  key={prov.provider}
                  onClick={() => {
                    onSelectBaseline(prov.provider);
                    onSelectProvider(isSelected ? null : prov.provider);
                  }}
                  className={`transition-colors cursor-pointer select-none ${
                    isBaseline
                      ? "bg-amber-500/10 hover:bg-amber-500/15"
                      : isSelected
                      ? "bg-accent/15"
                      : isTop
                      ? "bg-accent/5 hover:bg-accent/10"
                      : "hover:bg-surface-elevated/60"
                  }`}
                  title="Click to select and set as baseline reference"
                >
                  {/* Rank Column */}
                  <td className="px-3 py-3 text-center font-mono font-bold text-[13px]">
                    {prov.rank === 1 ? (
                      <span className="inline-flex items-center gap-1 text-accent font-extrabold">
                        <span>🥇</span>
                        <span>1</span>
                      </span>
                    ) : prov.rank === 2 ? (
                      <span className="inline-flex items-center gap-1 text-slate-300 font-bold">
                        <span>🥈</span>
                        <span>2</span>
                      </span>
                    ) : prov.rank === 3 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                        <span>🥉</span>
                        <span>3</span>
                      </span>
                    ) : (
                      <span>{prov.rank}</span>
                    )}
                  </td>

                  {/* Provider & Model */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: prov.color }}
                      />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-foreground text-sm">{prov.name}</span>
                          {isBaseline && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                              REF
                            </span>
                          )}
                          {prov.isParetoOptimal && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              PARETO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted">
                          <span>{prov.typeInfo.label}</span>
                          {prov.model && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-muted/80">{prov.model}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Error Distance (Median / Mean / P90 / Delta vs REF) */}
                  <td className="px-3 py-3 text-right font-mono">
                    <div className="font-bold text-foreground text-sm">
                      {formatDistance(prov.distanceStats.p50)} <span className="text-[11px] font-normal text-muted">median</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      Avg: {formatDistance(prov.avgDistanceMeters)} • P90: {formatDistance(prov.distanceStats.p90)}
                    </div>
                    {/* Relative Delta Pill vs Baseline */}
                    {!isBaseline && prov.distanceDeltaMeters !== null && (
                      <div className="mt-1 flex items-center justify-end">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            prov.distanceDeltaMeters <= 0
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}
                        >
                          {prov.distanceDeltaMeters <= 0
                            ? `▼ -${formatDistance(Math.abs(prov.distanceDeltaMeters))}`
                            : `▲ +${formatDistance(prov.distanceDeltaMeters)} (${prov.distanceDeltaRatio}x)`}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Accuracy Tier Distribution (Inline Stacked Bar) */}
                  <td className="px-3 py-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-foreground font-semibold">
                          {prov.pinpointPct}% &le;100m
                        </span>
                        <span className="text-muted text-[10px]">
                          {prov.accuracyTiers.excellent} | {prov.accuracyTiers.moderate} | {prov.accuracyTiers.poor}
                        </span>
                      </div>
                      <div className="flex h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                        <div
                          title={`<=100m: ${prov.accuracyTiers.excellent}`}
                          style={{
                            width: `${(prov.accuracyTiers.excellent / (prov.totalInputs || 1)) * 100}%`,
                          }}
                          className="bg-emerald-500"
                        />
                        <div
                          title={`100m–1km: ${prov.accuracyTiers.moderate}`}
                          style={{
                            width: `${(prov.accuracyTiers.moderate / (prov.totalInputs || 1)) * 100}%`,
                          }}
                          className="bg-amber-500"
                        />
                        <div
                          title={`>1km: ${prov.accuracyTiers.poor}`}
                          style={{
                            width: `${(prov.accuracyTiers.poor / (prov.totalInputs || 1)) * 100}%`,
                          }}
                          className="bg-rose-500"
                        />
                      </div>
                    </div>
                  </td>

                  {/* Latency (Median / Mean / Multiplier / Delta vs REF) */}
                  <td className="px-3 py-3 text-right font-mono">
                    <div className="font-bold text-foreground text-sm">
                      {prov.durationStats.p50} ms <span className="text-[11px] font-normal text-muted">median</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      Avg: {prov.avgDurationMs} ms • {prov.latencySpeedupRatio <= 1.0 ? "1.0x (fastest)" : `${prov.latencySpeedupRatio}x`}
                    </div>
                    {/* Latency delta vs Baseline */}
                    {!isBaseline && (
                      <div className="mt-1 flex items-center justify-end">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                            prov.latencyDeltaMs <= 0
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-surface-elevated text-muted"
                          }`}
                        >
                          {prov.latencyDeltaMs <= 0
                            ? `${prov.latencyDeltaMs}ms (faster)`
                            : `+${prov.latencyDeltaMs}ms`}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Reliability & Outliers */}
                  <td className="px-3 py-3 text-center font-mono">
                    <div
                      className={`font-bold text-sm ${
                        prov.successRate === 100 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {prov.successRate}%
                    </div>
                    <div className="text-[11px] text-muted">
                      {prov.resolvedCount}/{prov.totalInputs}
                    </div>
                    {prov.outlierCount > 0 && (
                      <span
                        className="mt-1 inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30"
                        title={`${prov.outlierCount} wild result(s) >460km excluded from mean error`}
                      >
                        ⚠ {prov.outlierCount}
                      </span>
                    )}
                  </td>

                  {/* Composite Score Breakdown (Stacked Contribution Bar) */}
                  <td className="px-4 py-3 text-right font-mono">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-base font-extrabold text-accent">
                        {prov.overallScore}
                      </span>
                      <span className="text-[11px] text-muted">/ 100</span>
                    </div>

                    {/* Stacked contribution bar */}
                    <div className="mt-1 space-y-1">
                      <div className="flex h-2 w-full rounded-full bg-surface-elevated overflow-hidden border border-border/40">
                        <div
                          title={`Accuracy pts: ${Math.round(prov.accuracyScore * weights.accuracy)} / ${Math.round(weights.accuracy * 100)}`}
                          style={{
                            width: `${(Math.round(prov.accuracyScore * weights.accuracy) / Math.max(1, prov.overallScore)) * 100}%`,
                          }}
                          className="bg-emerald-400"
                        />
                        <div
                          title={`Speed pts: ${Math.round(prov.speedScore * weights.speed)} / ${Math.round(weights.speed * 100)}`}
                          style={{
                            width: `${(Math.round(prov.speedScore * weights.speed) / Math.max(1, prov.overallScore)) * 100}%`,
                          }}
                          className="bg-cyan-400"
                        />
                        <div
                          title={`Reliability pts: ${Math.round(prov.reliabilityScore * weights.reliability)} / ${Math.round(weights.reliability * 100)}`}
                          style={{
                            width: `${(Math.round(prov.reliabilityScore * weights.reliability) / Math.max(1, prov.overallScore)) * 100}%`,
                          }}
                          className="bg-purple-400"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted">
                        <span className="text-emerald-400 font-semibold">{prov.accuracyScore} Acc</span>
                        <span className="text-cyan-400 font-semibold">{prov.speedScore} Spd</span>
                        <span className="text-purple-400 font-semibold">{prov.reliabilityScore} Rel</span>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

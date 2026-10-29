"use client";

import { useState } from "react";
import { useBenchmarkStats } from "@/lib/useBenchmarkStats";
import { JobResultFile } from "@/lib/types";
import StatsWinnerCards from "./stats/StatsWinnerCards";
import StatsExecutiveComparison from "./stats/StatsExecutiveComparison";
import StatsLeaderboard from "./stats/StatsLeaderboard";
import StatsParetoMatrix from "./stats/StatsParetoMatrix";
import StatsDistributionDeepDive from "./stats/StatsDistributionDeepDive";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

interface ResultsStatsProps {
  file: JobResultFile;
}

export default function ResultsStats({ file }: ResultsStatsProps) {
  const {
    stats,
    weights,
    setWeights,
    activePreset,
    applyPreset,
    baselineProvider,
    setBaselineProvider,
    hoveredAddressIndex,
    setHoveredAddressIndex,
    selectedProvider,
    setSelectedProvider,
  } = useBenchmarkStats(file);

  // Advanced charts collapse toggle (defaults to expanded)
  const [showAdvancedCharts, setShowAdvancedCharts] = useState(true);

  return (
    <div className="w-full space-y-6">
      {/* ───────────────────────────────────────────────────────────────────────
          SECTION 1: EXECUTIVE WINNER CARDS WITH RUNNER-UP DELTA BADGES
      ─────────────────────────────────────────────────────────────────────── */}
      <StatsWinnerCards
        awards={stats.winnerAwards}
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
      />

      {/* ───────────────────────────────────────────────────────────────────────
          SECTION 2: NEW HEAD-TO-HEAD EXECUTIVE COMPARISON OVERVIEW
      ─────────────────────────────────────────────────────────────────────── */}
      <StatsExecutiveComparison
        providers={stats.providers}
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
      />

      {/* ───────────────────────────────────────────────────────────────────────
          SECTION 3: UNIFIED INTERACTIVE MASTER LEADERBOARD
      ─────────────────────────────────────────────────────────────────────── */}
      <StatsLeaderboard
        providers={stats.providers}
        weights={weights}
        onUpdateWeights={setWeights}
        activePreset={activePreset}
        onApplyPreset={applyPreset}
        baselineProvider={baselineProvider}
        onSelectBaseline={setBaselineProvider}
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
      />

      {/* ───────────────────────────────────────────────────────────────────────
          SECTION 4: ADVANCED STATISTICAL & DISTRIBUTIONAL ANALYSIS
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-2 border-t border-border/70" aria-labelledby="advanced-stats-heading">
        {/* Section Header with Collapse Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🔬</span>
              <h2
                id="advanced-stats-heading"
                className="text-base sm:text-lg font-bold text-foreground tracking-tight"
              >
                Advanced Statistical &amp; Distributional Analysis
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Granular percentile curves, interquartile variance, and Pareto frontier trade-offs across all {file.results.length} test addresses
            </p>
          </div>

          <button
            id="btn-toggle-advanced-charts"
            type="button"
            onClick={() => setShowAdvancedCharts(!showAdvancedCharts)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-xs font-semibold text-foreground hover:bg-surface hover:border-accent/40 cursor-pointer transition-colors flex items-center gap-2 shrink-0 self-start sm:self-auto shadow-sm"
          >
            {showAdvancedCharts ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-muted" />
                <span>Hide Advanced Charts</span>
                <ChevronUp className="w-3.5 h-3.5 text-muted" />
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-accent" />
                <span className="text-accent">Show Advanced Charts (3 Plots)</span>
                <ChevronDown className="w-3.5 h-3.5 text-accent" />
              </>
            )}
          </button>
        </div>

        {/* Collapsible Advanced Visualizations */}
        {showAdvancedCharts && (
          <div className="space-y-4 animate-fadeIn">
            {/* Pareto Decision Matrix */}
            <StatsParetoMatrix
              providers={stats.providers}
              paretoFrontier={stats.paretoFrontier}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
            />

            {/* ECDF Reach Curves & Raincloud Box/Jitter Strip Plot */}
            <StatsDistributionDeepDive
              providers={stats.providers}
              addressJitterData={stats.addressJitterData}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
              hoveredAddressIndex={hoveredAddressIndex}
              onHoverAddressIndex={setHoveredAddressIndex}
            />
          </div>
        )}
      </section>
    </div>
  );
}

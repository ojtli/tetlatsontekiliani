"use client";

import { useState, useMemo, useCallback } from "react";
import { JobResultFile } from "./types";
import {
  processBenchmarkStats,
  ScoreWeights,
  DEFAULT_SCORE_WEIGHTS,
  BenchmarkStatsResult,
} from "./benchmark-stats";

export type ScenarioPreset = "balanced" | "precision" | "speed";

export const SCENARIO_PRESETS: Record<ScenarioPreset, { label: string; icon: string; weights: ScoreWeights }> = {
  balanced: {
    label: "Balanced",
    icon: "⚖️",
    weights: { accuracy: 0.6, speed: 0.3, reliability: 0.1 },
  },
  precision: {
    label: "Precision Critical",
    icon: "🎯",
    weights: { accuracy: 0.85, speed: 0.05, reliability: 0.1 },
  },
  speed: {
    label: "Real-Time / Speed",
    icon: "⚡",
    weights: { accuracy: 0.35, speed: 0.55, reliability: 0.1 },
  },
};

export interface UseBenchmarkStatsReturn {
  stats: BenchmarkStatsResult;
  weights: ScoreWeights;
  setWeights: (weights: ScoreWeights) => void;
  activePreset: ScenarioPreset | "custom";
  applyPreset: (preset: ScenarioPreset) => void;
  baselineProvider: string;
  setBaselineProvider: (provider: string) => void;
  hoveredAddressIndex: number | null;
  setHoveredAddressIndex: (idx: number | null) => void;
  selectedProvider: string | null;
  setSelectedProvider: (provider: string | null) => void;
}

export function useBenchmarkStats(file: JobResultFile): UseBenchmarkStatsReturn {
  const [weights, setWeightsState] = useState<ScoreWeights>(DEFAULT_SCORE_WEIGHTS);
  const [activePreset, setActivePreset] = useState<ScenarioPreset | "custom">("balanced");
  const [baselineProvider, setBaselineProvider] = useState<string>("");
  const [hoveredAddressIndex, setHoveredAddressIndex] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const applyPreset = useCallback((preset: ScenarioPreset) => {
    setActivePreset(preset);
    setWeightsState(SCENARIO_PRESETS[preset].weights);
  }, []);

  const setWeights = useCallback((newWeights: ScoreWeights) => {
    setActivePreset("custom");
    setWeightsState(newWeights);
  }, []);

  const stats = useMemo(() => {
    return processBenchmarkStats(file, {
      weights,
      baselineProvider: baselineProvider || undefined,
    });
  }, [file, weights, baselineProvider]);

  return {
    stats,
    weights,
    setWeights,
    activePreset,
    applyPreset,
    baselineProvider: stats.baselineProvider,
    setBaselineProvider,
    hoveredAddressIndex,
    setHoveredAddressIndex,
    selectedProvider,
    setSelectedProvider,
  };
}

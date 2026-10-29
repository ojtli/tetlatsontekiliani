"use client";

import { useState, useMemo } from "react";
import { scaleLinear, scaleLog, scaleSqrt } from "d3-scale";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { ProcessedProviderStats, ParetoFrontierPoint } from "@/lib/benchmark-stats";
import { formatDistance } from "@/lib/geo";

interface StatsParetoMatrixProps {
  providers: ProcessedProviderStats[];
  paretoFrontier: ParetoFrontierPoint[];
  selectedProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}

type ScaleType = "log" | "sqrt" | "linear";

export default function StatsParetoMatrix({
  providers,
  paretoFrontier,
  selectedProvider,
  onSelectProvider,
}: StatsParetoMatrixProps) {
  // Default to Log scale for optimal quadrant separation and centered 500ms divider
  const [scaleType, setScaleType] = useState<ScaleType>("log");
  const [showIqr, setShowIqr] = useState(true);
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);

  // Canvas Dimensions
  const width = 840;
  const height = 440;
  const margin = { top: 35, right: 45, bottom: 55, left: 85 };

  // Data ranges based on median values
  const { minLat, maxLat, minDist, maxDist } = useMemo(() => {
    const latencies = providers
      .map((p) => p.durationStats?.p50 ?? p.avgDurationMs)
      .filter((v) => v > 0);
    const distances = providers
      .map((p) => p.distanceStats?.p50 ?? p.avgDistanceMeters ?? 1000)
      .filter((v) => v > 0);

    const minL = Math.min(...latencies, 150);
    const maxL = Math.max(...latencies, 3000);
    const minD = Math.min(...distances, 40);
    const maxD = Math.max(...distances, 1200);

    return {
      minLat: minL,
      maxLat: maxL * 1.15,
      minDist: minD,
      maxDist: maxD * 1.2,
    };
  }, [providers]);

  // D3 Scales with clean log padding
  const xScale = useMemo(() => {
    const range = [margin.left, width - margin.right];
    if (scaleType === "log") {
      // Padded [150ms, 3500ms] so 500ms sits near ~45% center
      const domainMin = Math.max(50, Math.min(150, minLat * 0.8));
      const domainMax = Math.max(3500, maxLat);
      return scaleLog().domain([domainMin, domainMax]).range(range);
    }
    if (scaleType === "sqrt") {
      return scaleSqrt().domain([0, maxLat]).range(range);
    }
    return scaleLinear().domain([0, maxLat]).range(range);
  }, [scaleType, minLat, maxLat, margin.left, margin.right, width]);

  const yScale = useMemo(() => {
    // 0 error (best accuracy) at bottom, high error at top
    const range = [height - margin.bottom, margin.top];
    if (scaleType === "log") {
      // Padded [40m, 1500m]
      const domainMin = Math.max(20, Math.min(40, minDist * 0.7));
      const domainMax = Math.max(1500, maxDist);
      return scaleLog().domain([domainMin, domainMax]).range(range);
    }
    if (scaleType === "sqrt") {
      return scaleSqrt().domain([0, maxDist]).range(range);
    }
    return scaleLinear().domain([0, maxDist]).range(range);
  }, [scaleType, minDist, maxDist, height, margin.bottom, margin.top]);

  // Safe coordinate calculator
  const getCoords = (latMs: number, distM: number | null) => {
    const effectiveLat = Math.max(10, latMs);
    const effectiveDist = Math.max(10, distM ?? 1000);
    return {
      x: xScale(effectiveLat),
      y: yScale(effectiveDist),
    };
  };

  // Quadrant divider lines: Latency = 500ms (Real-Time limit), Distance = 100m (Pinpoint limit)
  const dividerX = xScale(500);
  const dividerY = yScale(100);

  // Build Pareto Polyline path
  const paretoPoints = useMemo(() => {
    return paretoFrontier.map((pt) =>
      getCoords(
        pt.durationMs ?? pt.avgDurationMs,
        pt.distanceMeters ?? pt.avgDistanceMeters
      )
    );
  }, [paretoFrontier, xScale, yScale]);

  const paretoPathD = useMemo(() => {
    if (paretoPoints.length === 0) return "";
    return paretoPoints.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, "");
  }, [paretoPoints]);

  // X-Axis tick marks
  const xTicks = useMemo(() => {
    if (scaleType === "log") return [150, 250, 500, 1000, 2000, 3000];
    if (scaleType === "sqrt") return [100, 300, 500, 1000, 2000, 3000];
    return [0, 500, 1000, 1500, 2000, 2500, 3000];
  }, [scaleType]);

  // Y-Axis tick marks
  const yTicks = useMemo(() => {
    if (scaleType === "log") return [40, 75, 100, 200, 500, 1000];
    if (scaleType === "sqrt") return [50, 100, 250, 500, 800, 1200];
    return [0, 100, 250, 500, 800, 1200];
  }, [scaleType]);

  // Precompute collision-free pill positions
  const pillLayouts = useMemo(() => {
    const nodes = providers.map((p) => {
      const lat = p.durationStats?.p50 ?? p.avgDurationMs;
      const dist = p.distanceStats?.p50 ?? p.avgDistanceMeters;
      const { x, y } = getCoords(lat, dist);
      const pillText = `${p.name} • ${formatDistance(dist)}, ${Math.round(lat)}ms`;
      const pillWidth = pillText.length * 6.6 + (p.isParetoOptimal ? 54 : 18);
      const pillHeight = 22;
      return {
        provider: p,
        x,
        y,
        pillText,
        pillWidth,
        pillHeight,
      };
    });

    const placed: Array<{
      providerId: string;
      pillX: number;
      pillY: number;
      pillWidth: number;
      pillHeight: number;
    }> = [];

    return nodes.map((node) => {
      const id = node.provider.provider;
      let dx = 14;
      let dy = -11;

      if (id === "nvidia") {
        dx = 14;
        dy = 30;
      } else if (id === "openai") {
        dx = 14;
        dy = -22;
      } else if (id === "anthropic") {
        dx = 14;
        dy = 10;
      } else if (id === "lm-studio") {
        dx = 14;
        dy = -11;
      } else if (id === "google-gemini") {
        dx = -node.pillWidth - 14;
        dy = -11;
      }

      // Check right boundary
      if (node.x + dx + node.pillWidth > width - margin.right - 8) {
        dx = -node.pillWidth - 14;
      }

      const pillX = node.x + dx;
      let pillY = node.y + dy;

      // Iteratively check collisions against already placed pills and nudge down if colliding
      for (let attempt = 0; attempt < 6; attempt++) {
        let collides = false;
        for (const other of placed) {
          const overlapX =
            Math.abs(pillX + node.pillWidth / 2 - (other.pillX + other.pillWidth / 2)) <
            (node.pillWidth + other.pillWidth) / 2 + 6;
          const overlapY =
            Math.abs(pillY + node.pillHeight / 2 - (other.pillY + other.pillHeight / 2)) <
            (node.pillHeight + other.pillHeight) / 2 + 4;
          if (overlapX && overlapY) {
            collides = true;
            pillY += 25; // nudge down
            break;
          }
        }
        if (!collides) break;
      }

      // Check top & bottom boundary
      if (pillY < margin.top + 6) pillY = margin.top + 6;
      if (pillY + node.pillHeight > height - margin.bottom - 6) {
        pillY = height - margin.bottom - 6 - node.pillHeight;
      }

      placed.push({
        providerId: id,
        pillX,
        pillY,
        pillWidth: node.pillWidth,
        pillHeight: node.pillHeight,
      });

      return {
        ...node,
        pillX,
        pillY,
      };
    });
  }, [providers, xScale, yScale, width, height, margin]);

  return (
    <div className="p-4 rounded-xl border border-border bg-surface shadow-sm space-y-3">
      {/* Header & Controls Bar */}
      <div className="space-y-1.5 border-b border-border/70 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">⚖️</span>
              <h3 className="font-semibold text-foreground uppercase tracking-wider text-[13px]">
                Accuracy vs. Latency Pareto Decision Matrix
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Pareto Efficiency Frontier</span>
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Multi-objective optimization space evaluating speed vs. accuracy trade-offs.
            </p>
          </div>

          {/* Toolbar: Scale selector, IQR switch, Clear selection */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* IQR toggle */}
            <button
              id="btn-toggle-iqr"
              type="button"
              onClick={() => setShowIqr(!showIqr)}
              className={`px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                showIqr
                  ? "bg-accent/15 border-accent text-accent"
                  : "border-border bg-surface-elevated text-muted hover:text-foreground"
              }`}
              title="Toggle P25–P75 Interquartile Range crosshairs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>IQR Spread</span>
            </button>

            {/* Scale selector */}
            <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface-elevated text-[12px]">
              <button
                id="btn-scale-log"
                type="button"
                onClick={() => setScaleType("log")}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  scaleType === "log" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                Log (Optimal)
              </button>
              <button
                id="btn-scale-sqrt"
                type="button"
                onClick={() => setScaleType("sqrt")}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  scaleType === "sqrt" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                Sqrt
              </button>
              <button
                id="btn-scale-linear"
                type="button"
                onClick={() => setScaleType("linear")}
                className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  scaleType === "linear" ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                Linear
              </button>
            </div>

            {selectedProvider && (
              <button
                id="btn-clear-selection"
                type="button"
                onClick={() => onSelectProvider(null)}
                className="px-2.5 py-1 rounded-lg border border-border bg-surface-elevated text-[12px] text-muted hover:text-foreground cursor-pointer transition-colors"
              >
                Clear ✕
              </button>
            )}
          </div>
        </div>

        {/* 1-Line Reader Guide */}
        <p className="text-xs text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">
          💡 <strong>How to read:</strong> Bottom-left is best (fast &amp; accurate). Providers on the green dashed Pareto Frontier cannot be beaten on both speed and accuracy simultaneously.
        </p>
      </div>

      {/* SVG Canvas Container */}
      <div className="w-full relative overflow-hidden rounded-xl border border-border/80 bg-surface-elevated/40 p-2 sm:p-4">
        <div className="w-full aspect-[16/9] sm:aspect-[21/9] max-h-[440px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible select-none"
            aria-label="Accuracy vs Latency Pareto Decision Matrix"
          >
            <defs>
              {/* Glow filter for Pareto frontier & active bubbles */}
              <filter id="pareto-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ─── IN-CANVAS QUADRANT WATERMARK LABELS (Short & Clean) ─── */}
            {/* Bottom-Left: SWEET SPOT */}
            <g transform={`translate(${margin.left + 16}, ${height - margin.bottom - 28})`}>
              <text fill="#10b981" opacity="0.35" fontSize="13" fontWeight="bold" letterSpacing="1">
                SWEET SPOT
              </text>
              <text y="14" fill="#10b981" opacity="0.25" fontSize="10" fontWeight="600">
                Fast &amp; Pinpoint (&le;500ms, &le;100m)
              </text>
            </g>

            {/* Bottom-Right: HIGH PRECISION */}
            <g transform={`translate(${width - margin.right - 16}, ${height - margin.bottom - 28})`}>
              <text textAnchor="end" fill="#3b82f6" opacity="0.32" fontSize="13" fontWeight="bold" letterSpacing="1">
                HIGH PRECISION
              </text>
              <text textAnchor="end" y="14" fill="#3b82f6" opacity="0.25" fontSize="10" fontWeight="600">
                Slower Latency (&gt;500ms, &le;100m)
              </text>
            </g>

            {/* Top-Left: FAST HEURISTIC */}
            <g transform={`translate(${margin.left + 16}, ${margin.top + 18})`}>
              <text fill="#f59e0b" opacity="0.32" fontSize="13" fontWeight="bold" letterSpacing="1">
                FAST HEURISTIC
              </text>
              <text y="14" fill="#f59e0b" opacity="0.25" fontSize="10" fontWeight="600">
                Lower Accuracy (&le;500ms, &gt;100m)
              </text>
            </g>

            {/* Top-Right: LAGGING */}
            <g transform={`translate(${width - margin.right - 16}, ${margin.top + 18})`}>
              <text textAnchor="end" fill="#ef4444" opacity="0.28" fontSize="13" fontWeight="bold" letterSpacing="1">
                LAGGING
              </text>
              <text textAnchor="end" y="14" fill="#ef4444" opacity="0.22" fontSize="10" fontWeight="600">
                Slow &amp; High Error (&gt;500ms, &gt;100m)
              </text>
            </g>

            {/* ─── QUADRANT DIVIDER DASHED LINES (500ms & 100m) ─── */}
            <line
              x1={dividerX}
              y1={margin.top}
              x2={dividerX}
              y2={height - margin.bottom}
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.35"
            />
            <line
              x1={margin.left}
              y1={dividerY}
              x2={width - margin.right}
              y2={dividerY}
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.35"
            />

            {/* ─── GRID LINES & AXIS LABELS ─── */}
            {/* Horizontal Grid Lines (Error Distance) */}
            {yTicks.map((tickVal) => {
              const y = yScale(tickVal);
              if (y < margin.top || y > height - margin.bottom) return null;
              return (
                <g key={`y-grid-${tickVal}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={width - margin.right}
                    y2={y}
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                    opacity="0.35"
                  />
                  <text
                    x={margin.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {formatDistance(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* Vertical Grid Lines (Latency) */}
            {xTicks.map((tickVal) => {
              const x = xScale(tickVal);
              if (x < margin.left || x > width - margin.right) return null;
              return (
                <g key={`x-grid-${tickVal}`}>
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={height - margin.bottom}
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                    opacity="0.35"
                  />
                  <text
                    x={x}
                    y={height - margin.bottom + 18}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {tickVal} ms
                  </text>
                </g>
              );
            })}

            {/* Axis Title Labels */}
            <text
              x={(margin.left + width - margin.right) / 2}
              y={height - 14}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              Median Latency (ms) — Faster →
            </text>

            <text
              x={-((margin.top + height - margin.bottom) / 2)}
              y={24}
              transform="rotate(-90)"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="12"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              Median Error Distance (m) — More Accurate ↓
            </text>

            {/* ─── PARETO EFFICIENCY FRONTIER ─── */}
            {paretoPoints.length > 0 && (
              <g id="pareto-frontier-layer">
                {/* Glowing polyline */}
                {paretoPathD && (
                  <path
                    d={paretoPathD}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray="6 3"
                    filter="url(#pareto-glow)"
                    opacity="0.85"
                  />
                )}

                {/* Dashed projections from frontier endpoints to axes */}
                {paretoPoints[0] && (
                  <line
                    x1={paretoPoints[0].x}
                    y1={paretoPoints[0].y}
                    x2={paretoPoints[0].x}
                    y2={height - margin.bottom}
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.45"
                  />
                )}
                {paretoPoints[paretoPoints.length - 1] && (
                  <line
                    x1={paretoPoints[paretoPoints.length - 1].x}
                    y1={paretoPoints[paretoPoints.length - 1].y}
                    x2={margin.left}
                    y2={paretoPoints[paretoPoints.length - 1].y}
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.45"
                  />
                )}

                {/* Pareto Frontier Label badge */}
                {paretoPoints[0] && (
                  <g transform={`translate(${paretoPoints[0].x + 8}, ${paretoPoints[0].y - 22})`}>
                    <rect
                      x="0"
                      y="0"
                      width="125"
                      height="20"
                      rx="4"
                      fill="#064e3b"
                      fillOpacity="0.85"
                      stroke="#10b981"
                      strokeWidth="1"
                    />
                    <text
                      x="8"
                      y="14"
                      fill="#6ee7b7"
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      ★ Optimal Frontier
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* ─── IQR CONSISTENCY CROSSHAIRS (P25 - P75) ─── */}
            {showIqr &&
              providers.map((p) => {
                const lat = p.durationStats?.p50 ?? p.avgDurationMs;
                const dist = p.distanceStats?.p50 ?? p.avgDistanceMeters;
                const center = getCoords(lat, dist);
                const xP25 = xScale(Math.max(10, p.durationStats.p25));
                const xP75 = xScale(Math.max(10, p.durationStats.p75));
                const yP25 = yScale(Math.max(10, p.distanceStats.p25));
                const yP75 = yScale(Math.max(10, p.distanceStats.p75));

                const isDimmed = selectedProvider && selectedProvider !== p.provider;

                return (
                  <g key={`iqr-${p.provider}`} opacity={isDimmed ? 0.2 : 0.6}>
                    <line
                      x1={xP25}
                      y1={center.y}
                      x2={xP75}
                      y2={center.y}
                      stroke={p.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1={center.x}
                      y1={yP25}
                      x2={center.x}
                      y2={yP75}
                      stroke={p.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

            {/* ─── PROVIDER NODES WITH COLLISION-FREE PILLS ─── */}
            {pillLayouts.map((node) => {
              const p = node.provider;
              const { x, y, pillText, pillWidth, pillX, pillY } = node;
              const isSelected = selectedProvider === p.provider;
              const isHovered = hoveredProvider === p.provider;
              const isDimmed = selectedProvider && !isSelected && !isHovered;

              const radius = isSelected ? 12 : isHovered ? 10 : 8;

              return (
                <g
                  key={`node-${p.provider}`}
                  onClick={() => onSelectProvider(isSelected ? null : p.provider)}
                  onMouseEnter={() => setHoveredProvider(p.provider)}
                  onMouseLeave={() => setHoveredProvider(null)}
                  className="cursor-pointer transition-all duration-200"
                  opacity={isDimmed ? 0.35 : 1}
                >
                  {/* Selected Pulsing Ring */}
                  {isSelected && (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 8}
                      fill="none"
                      stroke={p.color}
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      className="animate-spin"
                      style={{ transformOrigin: `${x}px ${y}px` }}
                    />
                  )}

                  {/* Drop Guidelines to Axes on Hover / Select */}
                  {(isSelected || isHovered) && (
                    <>
                      <line
                        x1={x}
                        y1={y}
                        x2={x}
                        y2={height - margin.bottom}
                        stroke={p.color}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.7"
                      />
                      <line
                        x1={x}
                        y1={y}
                        x2={margin.left}
                        y2={y}
                        stroke={p.color}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.7"
                      />
                    </>
                  )}

                  {/* Outer Aura */}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius + 4}
                    fill={p.color}
                    fillOpacity={isSelected ? 0.35 : 0.2}
                  />

                  {/* Core Bubble */}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={p.color}
                    stroke="#ffffff"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    filter="url(#pareto-glow)"
                  />

                  {/* Collision-Free Sleek Dark Pill Callout */}
                  <g transform={`translate(${pillX}, ${pillY})`}>
                    <rect
                      x="0"
                      y="0"
                      width={pillWidth}
                      height="22"
                      rx="5"
                      fill="#0f172a"
                      fillOpacity="0.94"
                      stroke={isSelected ? "#ffffff" : p.color}
                      strokeWidth={isSelected ? "1.5" : "1"}
                      className="shadow-sm"
                    />
                    <text
                      x="8"
                      y="15"
                      fill="#f8fafc"
                      fontSize="10.5"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {pillText}
                    </text>
                    {p.isParetoOptimal && (
                      <text
                        x={pillWidth - 44}
                        y="15"
                        fill="#34d399"
                        fontSize="9"
                        fontWeight="extrabold"
                        fontFamily="sans-serif"
                      >
                        PARETO
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

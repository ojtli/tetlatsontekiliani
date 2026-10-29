"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { scaleLog, scaleLinear, scaleSqrt } from "d3-scale";
import { ProcessedProviderStats, AddressJitterPoint, ECDF_THRESHOLDS } from "@/lib/benchmark-stats";
import { formatDistance } from "@/lib/geo";

interface StatsDistributionDeepDiveProps {
  providers: ProcessedProviderStats[];
  addressJitterData: AddressJitterPoint[];
  selectedProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
  hoveredAddressIndex: number | null;
  onHoverAddressIndex: (idx: number | null) => void;
}

type StripMetric = "distance" | "latency";
type BoxScale = "sqrt" | "linear";

// Deterministic jitter function to prevent hydration mismatches and jumpy re-renders
function getJitterY(addressIndex: number, provIndex: number, maxOffset: number): number {
  const hash = Math.sin(addressIndex * 12.9898 + provIndex * 78.233) * 43758.5453;
  const normalized = hash - Math.floor(hash) - 0.5; // -0.5 to +0.5
  return normalized * maxOffset;
}

export default function StatsDistributionDeepDive({
  providers,
  addressJitterData,
  selectedProvider,
  onSelectProvider,
  hoveredAddressIndex,
  onHoverAddressIndex,
}: StatsDistributionDeepDiveProps) {
  // Strip metric toggle: Distance vs Latency
  const [stripMetric, setStripMetric] = useState<StripMetric>("distance");
  // Box scale toggle: Sqrt vs Linear
  const [boxScale, setBoxScale] = useState<BoxScale>("sqrt");
  // Hovered provider row in strip plot
  const [hoveredStripProv, setHoveredStripProv] = useState<string | null>(null);

  // ECDF interactive vertical crosshair state
  const [crosshairThreshold, setCrosshairThreshold] = useState<number | null>(null);
  const ecdfSvgRef = useRef<SVGSVGElement | null>(null);

  // Providers sorted by accuracy (median error distance) for visual hierarchy
  const rankedByAccuracy = useMemo(() => {
    return [...providers].sort(
      (a, b) =>
        (a.distanceStats?.p50 ?? a.avgDistanceMeters ?? 999999) -
        (b.distanceStats?.p50 ?? b.avgDistanceMeters ?? 999999)
    );
  }, [providers]);

  const top1Provider = rankedByAccuracy[0];
  const top2Provider = rankedByAccuracy[1];

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ECDF REACH CURVE SCALES & DENSE EMPIRICAL CURVE RESOLUTION
  // ───────────────────────────────────────────────────────────────────────────
  const ecdfWidth = 540;
  const ecdfHeight = 360;
  const ecdfMargin = { top: 30, right: 35, bottom: 45, left: 55 };

  const ecdfXScale = useMemo(() => {
    // Log scale from 10m to 1500m
    return scaleLog()
      .domain([10, 1500])
      .range([ecdfMargin.left, ecdfWidth - ecdfMargin.right]);
  }, [ecdfMargin.left, ecdfMargin.right, ecdfWidth]);

  const ecdfYScale = useMemo(() => {
    // 0% to 100%
    return scaleLinear()
      .domain([0, 100])
      .range([ecdfHeight - ecdfMargin.bottom, ecdfMargin.top]);
  }, [ecdfHeight, ecdfMargin.bottom, ecdfMargin.top]);

  // True Empirical High-Resolution ECDF Curves
  const ecdfCurves = useMemo(() => {
    return providers.map((prov) => {
      // Collect all actual distance measurements for this provider
      const distances = addressJitterData
        .map((item) => item.providerValues[prov.provider]?.distanceMeters)
        .filter((d): d is number => d !== null && d !== undefined && d >= 0)
        .sort((a, b) => a - b);

      const totalAddresses = prov.totalInputs || distances.length || 1;

      // Sample a dense array of thresholds including all discrete address distances
      const samplePoints: number[] = [10];
      // Include unique observed distances clamped to [10, 1500]
      distances.forEach((d) => {
        if (d >= 10 && d <= 1500 && !samplePoints.includes(d)) {
          samplePoints.push(d);
        }
      });
      // Include key benchmark milestone thresholds
      [25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500].forEach((t) => {
        if (!samplePoints.includes(t)) samplePoints.push(t);
      });
      samplePoints.sort((a, b) => a - b);

      // Generate empirical coordinates
      const densePoints = samplePoints.map((threshold) => {
        const count = distances.filter((d) => d <= threshold).length;
        const pct = (count / totalAddresses) * 100;
        return {
          threshold,
          percentage: pct,
          x: ecdfXScale(threshold),
          y: ecdfYScale(pct),
        };
      });

      // SVG Path D
      const pathD = densePoints.reduce((acc, pt, idx) => {
        return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
      }, "");

      // Area path under curve for #1 provider
      let areaD = "";
      if (densePoints.length > 0) {
        const first = densePoints[0];
        const last = densePoints[densePoints.length - 1];
        const baseY = ecdfYScale(0);
        areaD = `${pathD} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
      }

      // Check percentage at 100m milestone
      const at100Count = distances.filter((d) => d <= 100).length;
      const at100Pct = (at100Count / totalAddresses) * 100;

      return {
        provider: prov.provider,
        name: prov.name,
        color: prov.color,
        pathD,
        areaD,
        points: densePoints,
        at100Pct,
        at100Point: {
          x: ecdfXScale(100),
          y: ecdfYScale(at100Pct),
        },
      };
    });
  }, [providers, addressJitterData, ecdfXScale, ecdfYScale]);

  // Handle pointer move on ECDF chart
  const handleEcdfPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ecdfSvgRef.current) return;
      const rect = ecdfSvgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgX = (mouseX / rect.width) * ecdfWidth;

      if (svgX >= ecdfMargin.left && svgX <= ecdfWidth - ecdfMargin.right) {
        const invertedVal = ecdfXScale.invert(svgX);
        const closest = ECDF_THRESHOLDS.reduce((prev, curr) => {
          return Math.abs(curr - invertedVal) < Math.abs(prev - invertedVal) ? curr : prev;
        });
        setCrosshairThreshold(closest);
      }
    },
    [ecdfXScale, ecdfMargin.left, ecdfMargin.right, ecdfWidth]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 2. BOX & JITTER STRIP PLOT (RAINCLOUD / SPLIT-TRACK LAYOUT)
  // ───────────────────────────────────────────────────────────────────────────
  const stripWidth = 540;
  const stripMargin = { top: 30, right: 35, bottom: 45, left: 110 };
  const rowHeight = 68; // Height allocated per provider
  const stripHeight = stripMargin.top + providers.length * rowHeight + stripMargin.bottom;

  // Domain bounds
  const maxDistanceBound = useMemo(() => {
    const allDist = addressJitterData.flatMap((item) =>
      Object.values(item.providerValues)
        .map((pv) => pv.distanceMeters)
        .filter((d): d is number => d !== null && d <= 460000)
    );
    return Math.max(...allDist, 1200) * 1.05;
  }, [addressJitterData]);

  const maxLatencyBound = useMemo(() => {
    const allLat = addressJitterData.flatMap((item) =>
      Object.values(item.providerValues)
        .map((pv) => pv.durationMs)
        .filter((ms) => ms > 0)
    );
    return Math.max(...allLat, 3200) * 1.08;
  }, [addressJitterData]);

  const stripXScale = useMemo(() => {
    const range = [stripMargin.left, stripWidth - stripMargin.right];
    if (stripMetric === "distance") {
      if (boxScale === "sqrt") {
        return scaleSqrt().domain([0, maxDistanceBound]).range(range);
      }
      return scaleLinear().domain([0, maxDistanceBound]).range(range);
    }
    return scaleLinear().domain([0, maxLatencyBound]).range(range);
  }, [stripMetric, boxScale, maxDistanceBound, maxLatencyBound, stripMargin.left, stripMargin.right, stripWidth]);

  // Hovered address item for rich tooltip
  const activeAddressItem = useMemo(() => {
    if (hoveredAddressIndex === null) return null;
    return addressJitterData[hoveredAddressIndex] || null;
  }, [hoveredAddressIndex, addressJitterData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ───────────────────────────────────────────────────────────────────────
          LEFT CHART: CUMULATIVE ACCURACY REACH CURVE (ECDF PLOT)
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-sm space-y-3">
        {/* Header & Reader Guide */}
        <div className="space-y-1.5 border-b border-border/70 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📈</span>
              <h3 className="font-semibold text-foreground uppercase tracking-wider text-[13px]">
                Cumulative Accuracy Reach (ECDF)
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted self-start sm:self-auto bg-surface-elevated px-2 py-0.5 rounded border border-border">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>&le;100m Pinpoint Threshold</span>
            </div>
          </div>
          <p className="text-xs text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">
            💡 <strong>How to read:</strong> Higher and further left is better. Read vertically at any distance (like 100m) to see what % of addresses each provider successfully resolved within that radius.
          </p>
        </div>

        {/* ECDF SVG Chart */}
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-lg bg-surface-elevated/40 border border-border/60">
          <svg
            ref={ecdfSvgRef}
            viewBox={`0 0 ${ecdfWidth} ${ecdfHeight}`}
            onPointerMove={handleEcdfPointerMove}
            onPointerLeave={() => setCrosshairThreshold(null)}
            className="w-full h-full overflow-visible select-none cursor-crosshair"
            aria-label="Cumulative Empirical Distribution Reach Curves"
          >
            <defs>
              {/* Subtle Area Gradient for Top Provider #1 */}
              <linearGradient id="top1-area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={top1Provider?.color || "#6366f1"} stopOpacity="0.25" />
                <stop offset="100%" stopColor={top1Provider?.color || "#6366f1"} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines (0%, 25%, 50%, 75%, 100%) */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = ecdfYScale(pct);
              return (
                <g key={`ecdf-y-${pct}`}>
                  <line
                    x1={ecdfMargin.left}
                    y1={y}
                    x2={ecdfWidth - ecdfMargin.right}
                    y2={y}
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                    opacity="0.35"
                  />
                  <text
                    x={ecdfMargin.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Vertical Milestone Reference Lines (50m, 100m, 500m) */}
            {[
              { val: 50, label: "50m (Corner)" },
              { val: 100, label: "100m (Pinpoint)" },
              { val: 500, label: "500m (District)" },
            ].map((refLine) => {
              const x = ecdfXScale(refLine.val);
              const is100m = refLine.val === 100;
              return (
                <g key={`ref-${refLine.val}`}>
                  <line
                    x1={x}
                    y1={ecdfMargin.top}
                    x2={x}
                    y2={ecdfHeight - ecdfMargin.bottom}
                    stroke={is100m ? "#10b981" : "#475569"}
                    strokeWidth={is100m ? "1.5" : "1"}
                    strokeDasharray={is100m ? "4 3" : "3 3"}
                    opacity={is100m ? "0.85" : "0.5"}
                  />
                  <text
                    x={x}
                    y={ecdfMargin.top - 8}
                    textAnchor="middle"
                    fill={is100m ? "#34d399" : "#94a3b8"}
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {refLine.label}
                  </text>
                </g>
              );
            })}

            {/* X-Axis Ticks (10m, 25m, 50m, 100m, 250m, 500m, 1000m, 1500m) */}
            {[10, 25, 50, 100, 250, 500, 1000, 1500].map((tickM) => {
              const x = ecdfXScale(tickM);
              return (
                <text
                  key={`ecdf-x-${tickM}`}
                  x={x}
                  y={ecdfHeight - ecdfMargin.bottom + 16}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {tickM < 1000 ? `${tickM}m` : `${tickM / 1000}km`}
                </text>
              );
            })}

            {/* Axis Titles */}
            <text
              x={(ecdfMargin.left + ecdfWidth - ecdfMargin.right) / 2}
              y={ecdfHeight - 10}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="11"
              fontWeight="600"
            >
              Error Distance Threshold (Logarithmic Scale) →
            </text>

            <text
              x={-((ecdfMargin.top + ecdfHeight - ecdfMargin.bottom) / 2)}
              y={18}
              transform="rotate(-90)"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="11"
              fontWeight="600"
            >
              % Addresses Resolved Within Threshold
            </text>

            {/* Area fill beneath top #1 provider curve */}
            {top1Provider && (
              <path
                d={ecdfCurves.find((c) => c.provider === top1Provider.provider)?.areaD || ""}
                fill="url(#top1-area-gradient)"
                pointerEvents="none"
              />
            )}

            {/* Polylines for each provider with visual hierarchy */}
            {ecdfCurves.map((curve) => {
              const isSelected = selectedProvider === curve.provider;
              const isDimmed = selectedProvider && !isSelected;
              const isTop1 = top1Provider?.provider === curve.provider;
              const isTop2 = top2Provider?.provider === curve.provider;

              // Top 2 get thicker stroke (3px / 3.5px), trailing LLMs get 2px at 0.75 opacity
              const strokeWidth = isSelected ? 4 : isTop1 ? 3.5 : isTop2 ? 3 : 2;
              const curveOpacity = isDimmed ? 0.2 : isTop1 || isTop2 || isSelected ? 1 : 0.75;

              return (
                <g key={`ecdf-curve-${curve.provider}`}>
                  {/* Outer glow aura if selected */}
                  {isSelected && (
                    <path
                      d={curve.pathD}
                      fill="none"
                      stroke={curve.color}
                      strokeWidth="7"
                      opacity="0.3"
                    />
                  )}

                  {/* Main empirical step curve */}
                  <path
                    d={curve.pathD}
                    fill="none"
                    stroke={curve.color}
                    strokeWidth={strokeWidth}
                    opacity={curveOpacity}
                    className="transition-all duration-200"
                  />

                  {/* End label at rightmost point */}
                  {curve.points.length > 0 && (
                    <text
                      x={curve.points[curve.points.length - 1].x + 4}
                      y={curve.points[curve.points.length - 1].y + 3}
                      fill={curve.color}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      opacity={curveOpacity}
                    >
                      {curve.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Milestone Callout Tags at the 100m Pinpoint Line */}
            {top1Provider && (
              (() => {
                const curve = ecdfCurves.find((c) => c.provider === top1Provider.provider);
                if (!curve) return null;
                const { x, y } = curve.at100Point;
                return (
                  <g transform={`translate(${x - 42}, ${y - 24})`}>
                    <rect
                      x="0"
                      y="0"
                      width="84"
                      height="20"
                      rx="4"
                      fill="#1e1b4b"
                      stroke="#818cf8"
                      strokeWidth="1.5"
                    />
                    <text
                      x="42"
                      y="14"
                      textAnchor="middle"
                      fill="#e0e7ff"
                      fontSize="10"
                      fontWeight="extrabold"
                      fontFamily="monospace"
                    >
                      {curve.at100Pct.toFixed(0)}% &le; 100m
                    </text>
                  </g>
                );
              })()
            )}

            {/* Interactive Vertical Crosshair on Hover */}
            {crosshairThreshold !== null && (
              <g id="ecdf-crosshair">
                <line
                  x1={ecdfXScale(crosshairThreshold)}
                  y1={ecdfMargin.top}
                  x2={ecdfXScale(crosshairThreshold)}
                  y2={ecdfHeight - ecdfMargin.bottom}
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {providers.map((p) => {
                  const curve = ecdfCurves.find((c) => c.provider === p.provider);
                  const pt = curve?.points.find((ep) => ep.threshold === crosshairThreshold);
                  if (!pt) return null;
                  return (
                    <circle
                      key={`crosshair-dot-${p.provider}`}
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill={p.color}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </g>
            )}
          </svg>

          {/* Interactive Floating Card at Crosshair */}
          {crosshairThreshold !== null && (
            <div className="absolute top-2 right-2 p-2 rounded-lg bg-surface/95 border border-border shadow-lg backdrop-blur-sm text-[11px] font-mono space-y-1 pointer-events-none min-w-[170px] z-10">
              <div className="font-bold text-sky-400 border-b border-border/60 pb-1 flex items-center justify-between">
                <span>Threshold: &le; {formatDistance(crosshairThreshold)}</span>
              </div>
              <div className="space-y-0.5">
                {[...providers]
                  .sort((a, b) => {
                    const cA = ecdfCurves.find((c) => c.provider === a.provider);
                    const cB = ecdfCurves.find((c) => c.provider === b.provider);
                    const ptA = cA?.points.find((ep) => ep.threshold === crosshairThreshold)?.percentage ?? 0;
                    const ptB = cB?.points.find((ep) => ep.threshold === crosshairThreshold)?.percentage ?? 0;
                    return ptB - ptA;
                  })
                  .map((p) => {
                    const curve = ecdfCurves.find((c) => c.provider === p.provider);
                    const pt = curve?.points.find((ep) => ep.threshold === crosshairThreshold);
                    return (
                      <div key={`crosshair-row-${p.provider}`} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-foreground truncate">{p.name}</span>
                        </span>
                        <strong className="text-foreground">{(pt?.percentage ?? 0).toFixed(0)}%</strong>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          RIGHT CHART: DISTRIBUTION BOX & JITTER STRIP PLOT (SPLIT-TRACK LAYOUT)
      ─────────────────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-border bg-surface shadow-sm space-y-3">
        {/* Header, Scale Toggles & Reader Guide */}
        <div className="space-y-1.5 border-b border-border/70 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📦</span>
              <h3 className="font-semibold text-foreground uppercase tracking-wider text-[13px]">
                Distribution Box &amp; Jitter Strip Plot
              </h3>
            </div>

            {/* Controls: Metric & Scale Toggles */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* Distance Scale Toggle (Sqrt vs Linear) */}
              {stripMetric === "distance" && (
                <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface-elevated text-[11px]">
                  <button
                    id="btn-box-scale-sqrt"
                    type="button"
                    onClick={() => setBoxScale("sqrt")}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                      boxScale === "sqrt"
                        ? "bg-accent text-white shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Sqrt (Expanded)
                  </button>
                  <button
                    id="btn-box-scale-linear"
                    type="button"
                    onClick={() => setBoxScale("linear")}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                      boxScale === "linear"
                        ? "bg-accent text-white shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Linear
                  </button>
                </div>
              )}

              {/* Metric Selector Toggle (Distance vs Latency) */}
              <div className="flex items-center p-0.5 rounded-lg border border-border bg-surface-elevated text-[11px]">
                <button
                  id="btn-strip-distance"
                  type="button"
                  onClick={() => setStripMetric("distance")}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                    stripMetric === "distance"
                      ? "bg-accent text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  🎯 Error (m)
                </button>
                <button
                  id="btn-strip-latency"
                  type="button"
                  onClick={() => setStripMetric("latency")}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                    stripMetric === "latency"
                      ? "bg-accent text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  ⚡ Latency (ms)
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">
            💡 <strong>How to read:</strong> The shaded box holds the middle 50% of results (P25–P75); a narrower box further to the left means higher consistency and lower error. Dots below represent each of the individual test addresses.
          </p>
        </div>

        {/* Raincloud Split-Track SVG Plot */}
        <div className="relative w-full overflow-x-auto rounded-lg bg-surface-elevated/40 border border-border/60">
          <svg
            viewBox={`0 0 ${stripWidth} ${stripHeight}`}
            style={{ minHeight: `${stripHeight}px` }}
            className="w-full select-none"
            aria-label="Distribution Box and Individual Jitter Strip Plot"
          >
            {/* Vertical grid lines */}
            {(stripMetric === "distance"
              ? [25, 50, 100, 250, 500, 1000]
              : [200, 500, 1000, 2000, 3000]
            ).map((tickVal) => {
              const x = stripXScale(tickVal);
              return (
                <g key={`strip-grid-${tickVal}`}>
                  <line
                    x1={x}
                    y1={stripMargin.top}
                    x2={x}
                    y2={stripHeight - stripMargin.bottom}
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray="2 4"
                    opacity="0.35"
                  />
                  <text
                    x={x}
                    y={stripHeight - stripMargin.bottom + 16}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {stripMetric === "distance" ? formatDistance(tickVal) : `${tickVal}ms`}
                  </text>
                </g>
              );
            })}

            {/* Axis Title */}
            <text
              x={(stripMargin.left + stripWidth - stripMargin.right) / 2}
              y={stripHeight - 10}
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="11"
              fontWeight="600"
            >
              {stripMetric === "distance"
                ? `Geocoding Error Distance (${boxScale === "sqrt" ? "Sqrt Scale" : "Linear Scale"}) — Closer is Better →`
                : "Response Time / Latency (ms) — Faster is Better →"}
            </text>

            {/* Provider Rows: Split-Track Raincloud Layout */}
            {providers.map((prov, provIndex) => {
              const rowCenterY = stripMargin.top + provIndex * rowHeight + rowHeight / 2;
              // Split-track vertical centers:
              // Top track (Box & Whiskers): rowCenterY - 10
              // Bottom track (Jitter dots): rowCenterY + 14
              const boxCenterY = rowCenterY - 11;
              const dotsCenterY = rowCenterY + 14;
              const boxH = 16;

              const isSelected = selectedProvider === prov.provider;
              const isHovered = hoveredStripProv === prov.provider;
              const isDimmed = selectedProvider && !isSelected;

              // Statistics for this metric
              const stats = stripMetric === "distance" ? prov.distanceStats : prov.durationStats;
              const meanVal = stripMetric === "distance" ? prov.avgDistanceMeters ?? 0 : prov.avgDurationMs;

              const xP10 = stripXScale(stats.p10);
              const xP25 = stripXScale(stats.p25);
              const xP50 = stripXScale(stats.p50);
              const xP75 = stripXScale(stats.p75);
              const xP90 = stripXScale(stats.p90);
              const xMean = stripXScale(meanVal);

              return (
                <g
                  key={`strip-row-${prov.provider}`}
                  opacity={isDimmed ? 0.3 : 1}
                  onMouseEnter={() => setHoveredStripProv(prov.provider)}
                  onMouseLeave={() => setHoveredStripProv(null)}
                  className="transition-opacity duration-200"
                >
                  {/* Row background highlight */}
                  <rect
                    x={stripMargin.left}
                    y={rowCenterY - rowHeight / 2}
                    width={stripWidth - stripMargin.left - stripMargin.right}
                    height={rowHeight}
                    fill={provIndex % 2 === 0 ? "#1e293b" : "transparent"}
                    fillOpacity={isHovered ? "0.35" : "0.15"}
                  />

                  {/* Provider label on left */}
                  <text
                    x={stripMargin.left - 10}
                    y={rowCenterY + 3}
                    textAnchor="end"
                    fill={prov.color}
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    className="cursor-pointer"
                    onClick={() => onSelectProvider(isSelected ? null : prov.provider)}
                  >
                    {prov.name}
                  </text>

                  {/* ─── TOP TRACK: HIGH-CONTRAST IQR BOX & WHISKERS ─── */}
                  {/* Whiskers (P10 to P90) */}
                  <line
                    x1={xP10}
                    y1={boxCenterY}
                    x2={xP90}
                    y2={boxCenterY}
                    stroke={prov.color}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    opacity="0.85"
                  />
                  <line
                    x1={xP10}
                    y1={boxCenterY - 4}
                    x2={xP10}
                    y2={boxCenterY + 4}
                    stroke={prov.color}
                    strokeWidth="1.5"
                  />
                  <line
                    x1={xP90}
                    y1={boxCenterY - 4}
                    x2={xP90}
                    y2={boxCenterY + 4}
                    stroke={prov.color}
                    strokeWidth="1.5"
                  />

                  {/* IQR Box (P25 to P75): High Visibility fillOpacity=0.45, strokeWidth=2 */}
                  <rect
                    x={xP25}
                    y={boxCenterY - boxH / 2}
                    width={Math.max(3, xP75 - xP25)}
                    height={boxH}
                    rx="4"
                    fill={prov.color}
                    fillOpacity="0.45"
                    stroke={prov.color}
                    strokeWidth="2"
                  />

                  {/* Tall High-Contrast Median Line (P50) */}
                  <line
                    x1={xP50}
                    y1={boxCenterY - boxH / 2 - 2}
                    x2={xP50}
                    y2={boxCenterY + boxH / 2 + 2}
                    stroke="#ffffff"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />

                  {/* Mean Marker (Diamond) */}
                  <polygon
                    points={`${xMean},${boxCenterY - 4} ${xMean + 3.5},${boxCenterY} ${xMean},${boxCenterY + 4} ${xMean - 3.5},${boxCenterY}`}
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="1"
                  />

                  {/* Miniature Hover Text Labels on Box Track */}
                  {isHovered && (
                    <g className="text-[9px] font-mono select-none pointer-events-none">
                      <text x={xP25} y={boxCenterY - boxH / 2 - 4} textAnchor="middle" fill="#94a3b8">
                        P25: {Math.round(stats.p25)}
                      </text>
                      <text x={xP50} y={boxCenterY - boxH / 2 - 4} textAnchor="middle" fill="#ffffff" fontWeight="bold">
                        Med: {Math.round(stats.p50)}
                      </text>
                      <text x={xP75} y={boxCenterY - boxH / 2 - 4} textAnchor="middle" fill="#94a3b8">
                        P75: {Math.round(stats.p75)}
                      </text>
                    </g>
                  )}

                  {/* ─── BOTTOM TRACK: UNOBSTRUCTED JITTER DOTS ─── */}
                  {addressJitterData.map((item) => {
                    const valObj = item.providerValues[prov.provider];
                    if (!valObj) return null;

                    const rawVal =
                      stripMetric === "distance" ? valObj.distanceMeters : valObj.durationMs;
                    if (rawVal === null || isNaN(rawVal)) return null;

                    const dotX = stripXScale(rawVal);
                    // Jitter bounded strictly within bottom track (+/- 6px)
                    const jitterY = getJitterY(item.addressIndex, provIndex, 10);
                    const dotY = dotsCenterY + jitterY;

                    const isAddressHovered = hoveredAddressIndex === item.addressIndex;

                    return (
                      <circle
                        key={`dot-${prov.provider}-${item.addressIndex}`}
                        cx={dotX}
                        cy={dotY}
                        r={isAddressHovered ? 6 : 3.5}
                        fill={isAddressHovered ? "#ffffff" : prov.color}
                        stroke={isAddressHovered ? prov.color : "#0f172a"}
                        strokeWidth={isAddressHovered ? 2.5 : 1}
                        fillOpacity={isAddressHovered ? 1 : 0.8}
                        className="cursor-pointer transition-all duration-150"
                        onMouseEnter={() => onHoverAddressIndex(item.addressIndex)}
                        onMouseLeave={() => onHoverAddressIndex(null)}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Cross-Highlighting Address Tooltip */}
          {activeAddressItem && (
            <div className="absolute bottom-2 left-2 right-2 p-3 rounded-lg bg-surface/95 border border-border shadow-xl backdrop-blur-md text-[12px] space-y-1.5 z-20 animate-fadeIn">
              <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-1">
                <span className="font-bold text-foreground">
                  Address #{activeAddressItem.addressIndex + 1}:
                </span>
                <span className="font-mono text-muted text-[11px] truncate max-w-xs">
                  {activeAddressItem.input}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
                {Object.entries(activeAddressItem.providerValues).map(([prov, pVal]) => {
                  const provInfo = providers.find((p) => p.provider === prov);
                  return (
                    <div
                      key={`tooltip-prov-${prov}`}
                      className="flex items-center justify-between gap-2 bg-surface-elevated/60 px-2 py-1 rounded"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: provInfo?.color ?? "#94a3b8" }}
                        />
                        <span className="text-muted text-[11px] truncate">
                          {provInfo?.name ?? prov}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] font-bold text-foreground">
                        {pVal.distanceMeters !== null
                          ? formatDistance(pVal.distanceMeters)
                          : "Error"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

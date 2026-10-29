"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { JobResultFile } from "@/lib/types";
import { AUTO_CIRCLES_ZOOM_THRESHOLD } from "@/lib/constants";
import { useLeafletMap } from "./map/useLeafletMap";
import { useVisibleProviders } from "./map/useVisibleProviders";
import {
  calculateDatasetBounds,
  calculateEntryBounds,
  renderEntryMarkersAndCircles,
  renderOverviewMarkers,
  renderAutoVisibleCircles,
} from "./map/leaflet-helpers";
import MapToolbar from "./map/MapToolbar";
import MapLegendOverlay from "./map/MapLegendOverlay";
import MapAddressOverlay from "./map/MapAddressOverlay";
import MapTimelineSlider from "./map/MapTimelineSlider";

interface CompareMapProps {
  runs: JobResultFile[];
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  isStandalone?: boolean;
}

export default function CompareMap({
  runs,
  selectedIndex = 0,
  onSelectIndex,
  isStandalone = false,
}: CompareMapProps) {
  const {
    mapContainerRef,
    mapInstanceRef,
    layerGroupRef,
    isDarkMap,
    setIsDarkMap,
    currentZoom,
    fitBoundsSafely,
  } = useLeafletMap();

  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const [activeRunIndex, setActiveRunIndex] = useState(0); // 0 = Run A, 1 = Run B, 2 = Run C
  const [showAllInputs, setShowAllInputs] = useState(false);
  const lastFittedKeyRef = useRef<string | null>(null);

  // Baseline run is runs[0]
  const baseRun = runs[0];
  const activeRun = runs[activeRunIndex] || baseRun;
  const activeResults = activeRun?.results || [];

  const {
    visibleProviders,
    setVisibleProviders,
    toggleProviderVisibility,
  } = useVisibleProviders(baseRun?.providers || []);

  useEffect(() => {
    if (selectedIndex !== currentIndex) {
      setCurrentIndex(selectedIndex);
    }
  }, [selectedIndex, currentIndex]);

  useEffect(() => {
    if (baseRun?.providers) {
      setVisibleProviders(new Set(baseRun.providers));
    }
  }, [baseRun, setVisibleProviders]);

  const handleSelectAddress = useCallback(
    (newIdx: number) => {
      setShowAllInputs(false);
      setCurrentIndex(newIdx);
      onSelectIndex?.(newIdx);
    },
    [onSelectIndex]
  );

  const runLabel = `Run ${String.fromCharCode(65 + activeRunIndex)}`;

  // Update Markers & Circles Effect
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || !activeRun?.results || activeRun.results.length === 0) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    if (showAllInputs) {
      const isZoomedIn = currentZoom >= AUTO_CIRCLES_ZOOM_THRESHOLD;

      if (!isZoomedIn) {
        // Zoomed Out: Numbered pins across Costa Rica
        renderOverviewMarkers({
          results: activeRun.results,
          currentIndex,
          layerGroup,
          bounds,
          buttonIdPrefix: "compare-goto-pin",
          onSelectAddress: handleSelectAddress,
          map,
        });
      } else {
        // Zoomed In: Automatically render circles for visible entries
        renderAutoVisibleCircles({
          results: activeRun.results,
          layerGroup,
          map,
          visibleProviders,
          currentIndex,
          onClosestIndexChange: (closestIdx) => {
            setCurrentIndex(closestIdx);
            onSelectIndex?.(closestIdx);
          },
          runLabel,
          baseRunResults: activeRunIndex > 0 ? baseRun?.results : undefined,
        });
      }
    } else {
      // Single address focus mode
      const activeEntry = activeRun.results[currentIndex];
      if (!activeEntry) return;

      renderEntryMarkersAndCircles({
        entry: activeEntry,
        entryIdx: currentIndex,
        targetLayerGroup: layerGroup,
        visibleProviders,
        boundsToExtend: bounds,
        runLabel,
        baseEntry: activeRunIndex > 0 ? baseRun?.results[currentIndex] : undefined,
      });

      const focusKey = `${currentIndex}-${activeRunIndex}`;
      if (lastFittedKeyRef.current !== focusKey) {
        lastFittedKeyRef.current = focusKey;
        fitBoundsSafely(bounds, [60, 60], 16);
      }
    }
  }, [
    currentIndex,
    activeRunIndex,
    showAllInputs,
    currentZoom,
    visibleProviders,
    activeRun,
    baseRun,
    runLabel,
    mapInstanceRef,
    layerGroupRef,
    fitBoundsSafely,
    handleSelectAddress,
    onSelectIndex,
  ]);

  const handleToggleShowAll = () => {
    const nextVal = !showAllInputs;
    setShowAllInputs(nextVal);
    lastFittedKeyRef.current = null;

    if (nextVal && activeRun?.results) {
      const allBounds = calculateDatasetBounds(activeRun.results);
      fitBoundsSafely(allBounds, [40, 40]);
    } else {
      const activeEntry = activeRun?.results[currentIndex];
      if (activeEntry) {
        const b = calculateEntryBounds(activeEntry, visibleProviders);
        fitBoundsSafely(b, [60, 60], 16);
      }
    }
  };

  const handleFitBounds = () => {
    if (showAllInputs && activeRun?.results) {
      const b = calculateDatasetBounds(activeRun.results);
      fitBoundsSafely(b, [40, 40]);
    } else {
      const activeEntry = activeRun?.results[currentIndex];
      if (activeEntry) {
        const b = calculateEntryBounds(activeEntry, visibleProviders);
        fitBoundsSafely(b, [60, 60], 16);
      }
    }
  };

  const activeEntry = activeRun?.results[currentIndex];
  const isAutoCirclesActive = showAllInputs && currentZoom >= AUTO_CIRCLES_ZOOM_THRESHOLD;
  const showLegend = !showAllInputs || isAutoCirclesActive;

  return (
    <div
      className={`w-full flex flex-col rounded-xl border border-border bg-surface overflow-hidden shadow-sm transition-all ${
        isStandalone ? "flex-1 min-h-[550px] h-[calc(100vh-175px)]" : ""
      }`}
    >
      {/* Top Header: Address Stepper & Controls */}
      <MapToolbar
        currentIndex={currentIndex}
        results={activeResults}
        onSelectAddress={handleSelectAddress}
        showAllInputs={showAllInputs}
        onToggleShowAll={handleToggleShowAll}
        isDarkMap={isDarkMap}
        onToggleDarkMap={() => setIsDarkMap((prev) => !prev)}
        currentZoom={currentZoom}
        onFitBounds={handleFitBounds}
        showAllButtonId="btn-show-all-pins"
        fitBoundsButtonId="btn-fit-bounds"
      />

      {/* Temporal Timeline Step Slider */}
      <MapTimelineSlider
        runs={runs}
        activeRunIndex={activeRunIndex}
        onSelectRunIndex={setActiveRunIndex}
      />

      {/* Map Display Container */}
      <div
        className={`relative w-full bg-background ${
          isStandalone ? "flex-1 min-h-0 h-full" : "h-[540px]"
        }`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Provider Visibility Legend */}
        {showLegend && (
          <MapLegendOverlay
            providers={baseRun?.providers || []}
            visibleProviders={visibleProviders}
            onToggleProvider={toggleProviderVisibility}
            activeEntry={activeEntry}
            badgeLabel={runLabel}
          />
        )}

        {/* Active Address Card */}
        <MapAddressOverlay
          currentIndex={currentIndex}
          input={activeEntry?.input}
          expectedResult={activeEntry?.expectedResult}
          badgeText={`${runLabel} Active`}
          badgeClassName="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent font-bold ml-auto font-mono"
        />
      </div>
    </div>
  );
}

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

interface ResultsMapProps {
  file: JobResultFile;
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  isStandalone?: boolean;
}

export default function ResultsMap({
  file,
  selectedIndex = 0,
  onSelectIndex,
  isStandalone = false,
}: ResultsMapProps) {
  const {
    mapContainerRef,
    mapInstanceRef,
    layerGroupRef,
    isDarkMap,
    setIsDarkMap,
    currentZoom,
    fitBoundsSafely,
  } = useLeafletMap();

  const lastFittedIndexRef = useRef<number | null>(null);

  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const [showAllInputs, setShowAllInputs] = useState(false);
  const {
    visibleProviders,
    setVisibleProviders,
    toggleProviderVisibility,
  } = useVisibleProviders(file.providers);

  // Sync internal index with controlled prop
  useEffect(() => {
    if (selectedIndex !== currentIndex) {
      lastFittedIndexRef.current = null;
      setCurrentIndex(selectedIndex);
    }
  }, [selectedIndex, currentIndex]);

  // Reset last fitted index and keep all providers visible when file changes
  useEffect(() => {
    lastFittedIndexRef.current = null;
    setVisibleProviders(new Set(file.providers));
  }, [file, setVisibleProviders]);

  const handleSelectAddress = useCallback(
    (newIdx: number) => {
      setShowAllInputs(false);
      if (newIdx !== currentIndex) {
        lastFittedIndexRef.current = null;
      }
      setCurrentIndex(newIdx);
      onSelectIndex?.(newIdx);
    },
    [currentIndex, onSelectIndex]
  );

  // Update Markers & Circles on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || !file.results || file.results.length === 0) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    if (showAllInputs) {
      const isZoomedIn = currentZoom >= AUTO_CIRCLES_ZOOM_THRESHOLD;

      if (!isZoomedIn) {
        // Zoomed Out: Numbered pins across Costa Rica
        renderOverviewMarkers({
          results: file.results,
          currentIndex,
          layerGroup,
          bounds,
          buttonIdPrefix: "goto-pin",
          onSelectAddress: handleSelectAddress,
          map,
        });
      } else {
        // Zoomed In: Automatically render circles for entries visible in current viewport
        renderAutoVisibleCircles({
          results: file.results,
          layerGroup,
          map,
          visibleProviders,
          currentIndex,
          onClosestIndexChange: (closestIdx) => {
            setCurrentIndex(closestIdx);
            onSelectIndex?.(closestIdx);
          },
        });
      }
    } else {
      // Single Address Focus Mode
      const activeEntry = file.results[currentIndex];
      if (!activeEntry) return;

      renderEntryMarkersAndCircles({
        entry: activeEntry,
        entryIdx: currentIndex,
        targetLayerGroup: layerGroup,
        visibleProviders,
        boundsToExtend: bounds,
      });

      // Fit bounds when selecting a new address
      if (lastFittedIndexRef.current !== currentIndex) {
        lastFittedIndexRef.current = currentIndex;
        fitBoundsSafely(bounds, [60, 60], 16);
      }
    }
  }, [
    currentIndex,
    showAllInputs,
    currentZoom,
    visibleProviders,
    file,
    mapInstanceRef,
    layerGroupRef,
    fitBoundsSafely,
    handleSelectAddress,
    onSelectIndex,
  ]);

  const handleToggleShowAll = () => {
    const nextVal = !showAllInputs;
    setShowAllInputs(nextVal);

    if (nextVal) {
      lastFittedIndexRef.current = null;
      const allBounds = calculateDatasetBounds(file.results);
      fitBoundsSafely(allBounds, [40, 40]);
    } else {
      lastFittedIndexRef.current = currentIndex;
      const activeEntry = file.results[currentIndex];
      if (activeEntry) {
        const b = calculateEntryBounds(activeEntry, visibleProviders);
        fitBoundsSafely(b, [60, 60], 16);
      }
    }
  };

  const handleFitBounds = () => {
    if (showAllInputs) {
      const b = calculateDatasetBounds(file.results);
      fitBoundsSafely(b, [40, 40]);
    } else {
      const activeEntry = file.results[currentIndex];
      if (activeEntry) {
        const b = calculateEntryBounds(activeEntry, visibleProviders);
        fitBoundsSafely(b, [60, 60], 16);
      }
    }
  };

  const activeEntry = file.results[currentIndex];
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
        results={file.results}
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

      {/* Map Display Container with Floating Legend & Info Overlays */}
      <div
        className={`relative w-full bg-background ${
          isStandalone ? "flex-1 min-h-0 h-full" : "h-[540px]"
        }`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Provider Visibility Legend */}
        {showLegend && (
          <MapLegendOverlay
            providers={file.providers}
            visibleProviders={visibleProviders}
            onToggleProvider={toggleProviderVisibility}
            activeEntry={activeEntry}
          />
        )}

        {/* Floating Active Address Info Overlay (Bottom Left) */}
        <MapAddressOverlay
          currentIndex={currentIndex}
          input={activeEntry?.input}
          expectedResult={activeEntry?.expectedResult}
          badgeText={showAllInputs ? "Auto-Selected" : undefined}
        />
      </div>
    </div>
  );
}

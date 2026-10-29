import L from "leaflet";
import { JobResultFile } from "@/lib/types";
import { PROVIDER_COLORS } from "@/lib/constants";
import { isDistanceOutlier } from "@/lib/geo";
import { calculateDelta } from "@/lib/compare";
import {
  createTargetDivIconHtml,
  createProviderDivIconHtml,
  createTargetMarkerPopupHtml,
  createOverviewTargetPopupHtml,
  createProviderCirclePopupHtml,
  createProviderPinPopupHtml,
} from "./map-helpers";

export const DEFAULT_MAP_CENTER: [number, number] = [9.934, -84.08];
export const DEFAULT_MAP_ZOOM = 13;

/**
 * Creates Leaflet DivIcon for the ground truth target pin.
 */
export function createTargetDivIcon(entryIdx: number, isSelected = false): L.DivIcon {
  return L.divIcon({
    className: "!bg-transparent !border-none",
    html: createTargetDivIconHtml(entryIdx, isSelected),
    iconSize: [44, 26],
    iconAnchor: [22, 13],
  });
}

/**
 * Creates Leaflet DivIcon for a provider pin with initials.
 */
export function createProviderDivIcon(provider: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "!bg-transparent !border-none",
    html: createProviderDivIconHtml(provider, color),
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/**
 * Creates Leaflet Circle for provider geodesic error distance.
 */
export function createGeodesicCircle(
  lat: number,
  lng: number,
  distMeters: number,
  isOutlier: boolean,
  color: string
): L.Circle {
  const radius = isOutlier ? 1000 : Math.max(distMeters, 25);
  const circleColor = isOutlier ? "#a855f7" : color;

  return L.circle([lat, lng], {
    radius,
    color: circleColor,
    fillColor: circleColor,
    fillOpacity: 0.18,
    weight: 2,
    dashArray: isOutlier ? "6, 6" : distMeters > 500 ? "4, 4" : undefined,
  });
}

/**
 * Calculates geographic bounding box for an entire dataset of target points.
 */
export function calculateDatasetBounds(
  results: Array<{ expectedResult?: { lat: number; lng: number } | null }>
): L.LatLngBounds {
  const bounds = L.latLngBounds([]);
  results.forEach((entry) => {
    if (!entry.expectedResult) return;
    const { lat, lng } = entry.expectedResult;
    if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
      bounds.extend([lat, lng]);
    }
  });
  return bounds;
}

/**
 * Calculates geographic bounding box for a single entry (target + non-outlier visible provider returns).
 */
export function calculateEntryBounds(
  entry: {
    expectedResult?: { lat: number; lng: number } | null;
    providersResults: Array<{
      provider: string;
      result?: { lat: number; lng: number } | null;
      distanceMeters?: number | null;
      isOutlier?: boolean;
    }>;
  },
  visibleProviders: Set<string>
): L.LatLngBounds {
  const bounds = L.latLngBounds([]);
  if (entry.expectedResult) {
    const { lat, lng } = entry.expectedResult;
    if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
      bounds.extend([lat, lng]);
    }
  }

  entry.providersResults.forEach((pr) => {
    if (pr.result && visibleProviders.has(pr.provider)) {
      const isOutlier =
        pr.isOutlier || (pr.distanceMeters !== null && pr.distanceMeters !== undefined && isDistanceOutlier(pr.distanceMeters));
      if (!isOutlier) {
        bounds.extend([pr.result.lat, pr.result.lng]);
      }
    }
  });

  return bounds;
}

export interface RenderEntryMarkersOptions {
  entry: JobResultFile["results"][0];
  entryIdx: number;
  targetLayerGroup: L.LayerGroup;
  visibleProviders: Set<string>;
  boundsToExtend?: L.LatLngBounds;
  runLabel?: string;
  baseEntry?: JobResultFile["results"][0];
}

/**
 * Renders target pin and provider geodesic circles + pins for a single entry.
 */
export function renderEntryMarkersAndCircles({
  entry,
  entryIdx,
  targetLayerGroup,
  visibleProviders,
  boundsToExtend,
  runLabel,
  baseEntry,
}: RenderEntryMarkersOptions): void {
  if (!entry.expectedResult) return;
  const { lat: expLat, lng: expLng } = entry.expectedResult;
  if (typeof expLat !== "number" || typeof expLng !== "number" || isNaN(expLat) || isNaN(expLng)) {
    return;
  }

  if (boundsToExtend) {
    boundsToExtend.extend([expLat, expLng]);
  }

  // 1. Ground Truth Target Pin
  const targetIcon = createTargetDivIcon(entryIdx);
  const targetMarker = L.marker([expLat, expLng], {
    icon: targetIcon,
    zIndexOffset: 1000,
  });
  targetMarker.bindPopup(createTargetMarkerPopupHtml(entryIdx, entry.input, expLat, expLng));
  targetLayerGroup.addLayer(targetMarker);

  // 2. Provider Error Circles & Provider Markers
  entry.providersResults.forEach((pr) => {
    if (!visibleProviders.has(pr.provider)) return;
    if (!pr.result || pr.error) return;

    const pLat = pr.result.lat;
    const pLng = pr.result.lng;
    if (typeof pLat !== "number" || typeof pLng !== "number" || isNaN(pLat) || isNaN(pLng)) return;

    const distMeters = pr.distanceMeters ?? 0;
    const isOutlier = pr.isOutlier || (pr.distanceMeters !== null && isDistanceOutlier(pr.distanceMeters));

    if (boundsToExtend && !isOutlier) {
      boundsToExtend.extend([pLat, pLng]);
    }

    const color = PROVIDER_COLORS[pr.provider] ?? "#888";

    // Optional delta vs baseline
    const basePr = baseEntry?.providersResults.find((p) => p.provider === pr.provider);
    const delta = baseEntry
      ? calculateDelta(basePr?.distanceMeters, pr.distanceMeters)
      : null;

    // Error circle
    const circle = createGeodesicCircle(pLat, pLng, distMeters, isOutlier, color);
    circle.bindPopup(
      createProviderCirclePopupHtml({
        provider: pr.provider,
        color,
        entryIdx,
        distMeters,
        durationMs: pr.durationMs,
        lat: pLat,
        lng: pLng,
        isOutlier,
        runLabel,
        delta,
      })
    );
    targetLayerGroup.addLayer(circle);

    // Provider center pin
    const provIcon = createProviderDivIcon(pr.provider, color);
    const provMarker = L.marker([pLat, pLng], { icon: provIcon });
    provMarker.bindPopup(
      createProviderPinPopupHtml({
        provider: pr.provider,
        color,
        entryIdx,
        distMeters,
        lat: pLat,
        lng: pLng,
        delta,
      })
    );
    targetLayerGroup.addLayer(provMarker);
  });
}

export interface RenderOverviewMarkersOptions {
  results: JobResultFile["results"];
  currentIndex: number;
  layerGroup: L.LayerGroup;
  bounds: L.LatLngBounds;
  buttonIdPrefix?: string;
  onSelectAddress: (idx: number) => void;
  map: L.Map;
}

/**
 * Renders numbered target pins across the whole dataset in overview mode.
 */
export function renderOverviewMarkers({
  results,
  currentIndex,
  layerGroup,
  bounds,
  buttonIdPrefix = "pin",
  onSelectAddress,
  map,
}: RenderOverviewMarkersOptions): void {
  results.forEach((entry, idx) => {
    if (!entry.expectedResult) return;
    const { lat, lng } = entry.expectedResult;
    if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) return;

    bounds.extend([lat, lng]);

    const isSelected = idx === currentIndex;
    const markerIcon = createTargetDivIcon(idx, isSelected);
    const marker = L.marker([lat, lng], {
      icon: markerIcon,
      zIndexOffset: isSelected ? 1000 : 100,
    });

    const buttonId = `${buttonIdPrefix}-${idx}`;
    marker.bindPopup(createOverviewTargetPopupHtml(idx, entry.input, lat, lng, buttonId));

    marker.on("popupopen", () => {
      const btn = document.getElementById(buttonId);
      if (btn) {
        btn.onclick = () => {
          onSelectAddress(idx);
          map.flyTo([lat, lng], 15);
        };
      }
    });

    layerGroup.addLayer(marker);
  });
}

export interface RenderAutoVisibleCirclesOptions {
  results: JobResultFile["results"];
  layerGroup: L.LayerGroup;
  map: L.Map;
  visibleProviders: Set<string>;
  currentIndex: number;
  onClosestIndexChange: (idx: number) => void;
  runLabel?: string;
  baseRunResults?: JobResultFile["results"];
}

/**
 * Automatically renders circles for entries visible in current map bounds when zoomed in.
 */
export function renderAutoVisibleCircles({
  results,
  layerGroup,
  map,
  visibleProviders,
  currentIndex,
  onClosestIndexChange,
  runLabel,
  baseRunResults,
}: RenderAutoVisibleCirclesOptions): void {
  const mapBounds = map.getBounds().pad(0.3);
  const mapCenter = map.getCenter();
  let closestIdx = currentIndex;
  let minCenterDist = Infinity;

  results.forEach((entry, idx) => {
    if (!entry.expectedResult) return;
    const { lat, lng } = entry.expectedResult;
    if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) return;

    if (mapBounds.contains([lat, lng])) {
      renderEntryMarkersAndCircles({
        entry,
        entryIdx: idx,
        targetLayerGroup: layerGroup,
        visibleProviders,
        runLabel,
        baseEntry: baseRunResults ? baseRunResults[idx] : undefined,
      });

      const distToCenter = map.distance(mapCenter, [lat, lng]);
      if (distToCenter < minCenterDist) {
        minCenterDist = distToCenter;
        closestIdx = idx;
      }
    }
  });

  if (closestIdx !== currentIndex) {
    onClosestIndexChange(closestIdx);
  }
}

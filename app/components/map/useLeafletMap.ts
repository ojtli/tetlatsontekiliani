"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "./leaflet-helpers";

export interface UseLeafletMapOptions {
  defaultCenter?: [number, number];
  defaultZoom?: number;
  initialDarkMap?: boolean;
}

export function useLeafletMap({
  defaultCenter = DEFAULT_MAP_CENTER,
  defaultZoom = DEFAULT_MAP_ZOOM,
  initialDarkMap = true,
}: UseLeafletMapOptions = {}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [isDarkMap, setIsDarkMap] = useState(initialDarkMap);
  const [currentZoom, setCurrentZoom] = useState(defaultZoom);

  // Initialize Map & Tile Layer
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(defaultCenter, defaultZoom);

    // OpenStreetMap standard tile layer (free, no API key required)
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: isDarkMap ? "dark-map-tiles" : "",
    }).addTo(map);

    tileLayerRef.current = tiles;

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    const handleMapMovement = () => {
      if (!mapInstanceRef.current) return;
      const zoom = mapInstanceRef.current.getZoom();
      setCurrentZoom(zoom);
    };

    map.on("zoomend", handleMapMovement);
    map.on("moveend", handleMapMovement);

    const invalidateSize = () => {
      try {
        if (mapInstanceRef.current && mapContainerRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      } catch {
        // Safe ignore
      }
    }

    const resizeObserver = new ResizeObserver(invalidateSize);
    resizeObserver.observe(mapContainerRef.current);

    const initTimer = setTimeout(invalidateSize, 150);

    return () => {
      clearTimeout(initTimer);
      resizeObserver.disconnect();
      try {
        map.off("zoomend", handleMapMovement);
        map.off("moveend", handleMapMovement);
        map.remove();
      } catch {
        // Safe ignore
      }
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
      tileLayerRef.current = null;
    };
  }, [defaultCenter, defaultZoom, isDarkMap]);

  // Toggle Dark / Standard Tile Appearance
  useEffect(() => {
    const tileLayer = tileLayerRef.current;
    if (!tileLayer) return;
    const container = tileLayer.getContainer();
    if (container) {
      if (isDarkMap) {
        container.classList.add("dark-map-tiles");
      } else {
        container.classList.remove("dark-map-tiles");
      }
    }
  }, [isDarkMap]);

  const fitBoundsSafely = useCallback(
    (bounds: L.LatLngBounds, padding: [number, number] = [60, 60], maxZoom = 16) => {
      try {
        if (!mapInstanceRef.current || !mapContainerRef.current) return;
        mapInstanceRef.current.invalidateSize();
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding, maxZoom });
        }
      } catch {
        // Safe ignore transient render states
      }
    },
    []
  );

  return {
    mapContainerRef,
    mapInstanceRef,
    layerGroupRef,
    tileLayerRef,
    isDarkMap,
    setIsDarkMap,
    currentZoom,
    setCurrentZoom,
    fitBoundsSafely,
  };
}

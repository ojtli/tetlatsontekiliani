"use client";

import { useState, useCallback } from "react";
import { toggleSetItem } from "./map-helpers";

/**
 * Hook to manage visible provider filters for map layers and popups.
 */
export function useVisibleProviders(initialProviders: string[] = []) {
  const [visibleProviders, setVisibleProviders] = useState<Set<string>>(
    () => new Set(initialProviders)
  );

  const toggleProviderVisibility = useCallback((prov: string) => {
    setVisibleProviders((prev) => toggleSetItem(prev, prov));
  }, []);

  return {
    visibleProviders,
    setVisibleProviders,
    toggleProviderVisibility,
  };
}

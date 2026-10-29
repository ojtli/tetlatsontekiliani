import { LatLng, ProviderResult } from "../types.ts";
import { calculateDistanceMeters, formatDistance } from "../geo.ts";

/**
 * Robust parser to extract latitude and longitude from arbitrary JSON or LLM text response.
 */
export function extractCoordinates(raw: unknown): LatLng | null {
  if (!raw) return null;

  // Case 0: Array of results/candidates
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return extractCoordinates(raw[0]);
  }

  // Case 1: Already an object
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;

    // Direct { lat, lng }
    const lat = Number(obj.lat ?? obj.latitude);
    const lng = Number(obj.lng ?? obj.longitude ?? obj.lon);
    const directCoord = resolveCoord(lat, lng);
    if (directCoord) {
      return directCoord;
    }

    // Nested under pos (e.g. standard format: { pos: { lat, lng } }), position, coordinates, location, geo, etc.
    const nested =
      obj.pos ||
      obj.position ||
      obj.coordinates ||
      obj.location ||
      obj.result ||
      obj.geo ||
      obj.point ||
      obj.data;

    if (nested && typeof nested === "object") {
      const nObj = nested as Record<string, unknown>;
      const nLat = Number(nObj.lat ?? nObj.latitude);
      const nLng = Number(nObj.lng ?? nObj.longitude ?? nObj.lon);
      const nestedCoord = resolveCoord(nLat, nLng);
      if (nestedCoord) {
        return nestedCoord;
      }

      // GeoJSON array [longitude, latitude] or [latitude, longitude]
      if (Array.isArray(nested) && nested.length >= 2) {
        const a0 = Number(nested[0]);
        const a1 = Number(nested[1]);
        const c1 = resolveCoord(a1, a0);
        if (c1) return c1;
        const c0 = resolveCoord(a0, a1);
        if (c0) return c0;
      }
    }

    // List of results/features/candidates inside an object
    const list = obj.results || obj.features || obj.candidates;
    if (Array.isArray(list) && list.length > 0) {
      return extractCoordinates(list[0]);
    }
  }

  // Case 2: String that might be JSON or contain markdown fences
  if (typeof raw === "string") {
    const cleaned = raw.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = fenceMatch ? fenceMatch[1] : cleaned;

    try {
      const parsed = JSON.parse(candidate);
      return extractCoordinates(parsed);
    } catch {
      // Regex fallback if JSON.parse fails (e.g. model added extra conversational text)
      // Check for {"pos": {"lat": ..., "lng": ...}}
      const posMatch = cleaned.match(
        /"?(?:pos|position)"?\s*:\s*\{[^}]*?"?(?:lat|latitude)"?\s*:\s*([+-]?\d+(?:\.\d+)?)[^}]*?"?(?:lng|longitude|lon)"?\s*:\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (posMatch) {
        const lat = parseFloat(posMatch[1]);
        const lng = parseFloat(posMatch[2]);
        const matched = resolveCoord(lat, lng);
        if (matched) {
          return matched;
        }
      }

      const latMatch = cleaned.match(/"?(?:lat|latitude)"?\s*:\s*([+-]?\d+(?:\.\d+)?)/i);
      const lngMatch = cleaned.match(/"?(?:lng|longitude|lon)"?\s*:\s*([+-]?\d+(?:\.\d+)?)/i);

      if (latMatch && lngMatch) {
        const lat = parseFloat(latMatch[1]);
        const lng = parseFloat(lngMatch[1]);
        const matched = resolveCoord(lat, lng);
        if (matched) {
          return matched;
        }
      }
    }
  }

  return null;
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Normalizes coordinates, automatically recovering from common LLM output mistakes
 * such as inverted lat/lng or positive longitude for the Western Hemisphere.
 */
function resolveCoord(lat: number, lng: number): LatLng | null {
  if (!isValidCoord(lat, lng)) return null;

  // Case A: Lat and Lng accidentally inverted by the model
  // e.g. lat = -84.08, lng = 9.93
  if (lat < 0 && lng > 0 && Math.abs(lat) >= 82 && Math.abs(lat) <= 86 && lng >= 8 && lng <= 12) {
    return { lat: lng, lng: lat };
  }

  // Case B: Model forgot the negative sign for Western hemisphere longitude
  // e.g. lat = 9.93, lng = 84.08
  if (lat >= 8 && lat <= 12 && lng >= 82 && lng <= 86) {
    return { lat, lng: -lng };
  }

  return { lat, lng };
}

export interface ParsedGeocodingResponse {
  coords: LatLng | null;
  isNullResult: boolean;
  error?: string;
}

/**
 * Robust parser for LLM geocoding responses.
 * Distinguishes between:
 * 1. Valid coordinates found: { coords: LatLng, isNullResult: false }
 * 2. Explicit null response (e.g. {"pos": null}): { coords: null, isNullResult: true }
 * 3. Unparseable / malformed text: { coords: null, isNullResult: false, error: string }
 */
export function parseGeocodingResponse(raw: unknown): ParsedGeocodingResponse {
  if (raw === null || raw === undefined) {
    return { coords: null, isNullResult: true };
  }

  // Case 1: Already an object
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // Explicit null: {"pos": null}, {"position": null}, {"result": null}, {"location": null}, {"coordinates": null}
    if (
      ("pos" in obj && obj.pos === null) ||
      ("position" in obj && obj.position === null) ||
      ("result" in obj && obj.result === null) ||
      ("location" in obj && obj.location === null) ||
      ("coordinates" in obj && obj.coordinates === null)
    ) {
      return { coords: null, isNullResult: true };
    }

    const coords = extractCoordinates(raw);
    if (coords) {
      return { coords, isNullResult: false };
    }
  }

  // Case 2: String that might be JSON or text
  if (typeof raw === "string") {
    const cleaned = raw.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

    try {
      const parsed = JSON.parse(candidate);
      if (parsed === null) {
        return { coords: null, isNullResult: true };
      }
      if (typeof parsed === "object" && parsed !== null) {
        const pObj = parsed as Record<string, unknown>;
        if (
          ("pos" in pObj && pObj.pos === null) ||
          ("position" in pObj && pObj.position === null) ||
          ("result" in pObj && pObj.result === null) ||
          ("location" in pObj && pObj.location === null) ||
          ("coordinates" in pObj && pObj.coordinates === null)
        ) {
          return { coords: null, isNullResult: true };
        }
      }
      const coords = extractCoordinates(parsed);
      if (coords) {
        return { coords, isNullResult: false };
      }
    } catch {
      // Regex check for explicit null: "pos"\s*:\s*null
      if (/"?(?:pos|position|result|location|coordinates)"?\s*:\s*null/i.test(candidate)) {
        return { coords: null, isNullResult: true };
      }
    }

    // Fallback regex attempt on candidate
    const coords = extractCoordinates(candidate);
    if (coords) {
      return { coords, isNullResult: false };
    }

    return {
      coords: null,
      isNullResult: false,
      error: `Unable to parse coordinates or null location from response: ${cleaned.slice(0, 100)}`,
    };
  }

  return {
    coords: null,
    isNullResult: false,
    error: "Unexpected response format",
  };
}

/**
 * Wrapper to format provider result with duration and geolib distance calculation.
 */
export function buildProviderResult(
  provider: string,
  result: LatLng | null,
  durationMs: number,
  expected?: LatLng | null,
  error?: string,
  model?: string,
  aggregator?: string
): ProviderResult {
  let distanceMeters: number | null = null;
  let formattedDist: string | undefined = undefined;

  let isOutlier = false;

  if (result && expected) {
    try {
      distanceMeters = calculateDistanceMeters(result, expected);
      formattedDist = formatDistance(distanceMeters);
      isOutlier = distanceMeters > 460_000;
    } catch {
      distanceMeters = null;
    }
  } else if (!result && expected === null && !error) {
    // Both model output and expected are null -> exact match on rejection!
    distanceMeters = 0;
    formattedDist = "0 m";
  }

  return {
    provider,
    model,
    aggregator,
    result,
    durationMs: Math.round(durationMs),
    distanceMeters,
    formattedDistance: formattedDist,
    isOutlier: isOutlier ? true : undefined,
    error,
  };
}

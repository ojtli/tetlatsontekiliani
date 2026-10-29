import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCoordinates,
  parseGeocodingResponse,
  buildProviderResult,
} from "../lib/providers/base.ts";

test("extractCoordinates parses direct lat/lng objects", () => {
  const parsed = extractCoordinates({ lat: 9.9333, lng: -84.0833 });
  assert.deepEqual(parsed, { lat: 9.9333, lng: -84.0833 });
});

test("extractCoordinates parses nested pos/location/coordinates objects", () => {
  const posFormat = extractCoordinates({ pos: { lat: 9.9333, lng: -84.0833 } });
  assert.deepEqual(posFormat, { lat: 9.9333, lng: -84.0833 });

  const locationFormat = extractCoordinates({ location: { latitude: 9.9333, longitude: -84.0833 } });
  assert.deepEqual(locationFormat, { lat: 9.9333, lng: -84.0833 });
});

test("extractCoordinates auto-recovers from inverted lat/lng", () => {
  // Model returned lat = -84.08 (longitude), lng = 9.93 (latitude)
  const inverted = extractCoordinates({ lat: -84.0833, lng: 9.9333 });
  assert.deepEqual(inverted, { lat: 9.9333, lng: -84.0833 });
});

test("extractCoordinates auto-recovers from positive Western hemisphere longitude", () => {
  // Model omitted negative sign for Costa Rica longitude
  const missingSign = extractCoordinates({ lat: 9.9333, lng: 84.0833 });
  assert.deepEqual(missingSign, { lat: 9.9333, lng: -84.0833 });
});

test("parseGeocodingResponse correctly parses valid coordinate JSON and markdown blocks", () => {
  const jsonString = '{"pos": {"lat": 9.9333, "lng": -84.0833}}';
  const res1 = parseGeocodingResponse(jsonString);
  assert.equal(res1.isNullResult, false);
  assert.equal(res1.error, undefined);
  assert.deepEqual(res1.coords, { lat: 9.9333, lng: -84.0833 });

  const markdownString = '```json\n{"pos": {"lat": 10.0167, "lng": -84.2167}}\n```';
  const res2 = parseGeocodingResponse(markdownString);
  assert.equal(res2.isNullResult, false);
  assert.equal(res2.error, undefined);
  assert.deepEqual(res2.coords, { lat: 10.0167, lng: -84.2167 });
});

test("parseGeocodingResponse recognizes explicit null responses without error", () => {
  const explicitNull = '{"pos": null}';
  const res = parseGeocodingResponse(explicitNull);
  assert.equal(res.isNullResult, true);
  assert.equal(res.coords, null);
  assert.equal(res.error, undefined);

  const parsedNullObj = { pos: null };
  const resObj = parseGeocodingResponse(parsedNullObj);
  assert.equal(resObj.isNullResult, true);
  assert.equal(resObj.coords, null);
  assert.equal(resObj.error, undefined);
});

test("parseGeocodingResponse flags unparseable or nonsensical text as error", () => {
  const bad = "I cannot fulfill this request.";
  const res = parseGeocodingResponse(bad);
  assert.equal(res.isNullResult, false);
  assert.equal(res.coords, null);
  assert.ok(res.error?.includes("Unable to parse"));
});

test("buildProviderResult calculates distance when expected is provided", () => {
  const result = buildProviderResult(
    "test-prov",
    { lat: 9.9333, lng: -84.0833 },
    150,
    { lat: 9.9333, lng: -84.0833 }
  );

  assert.equal(result.provider, "test-prov");
  assert.equal(result.distanceMeters, 0);
  assert.equal(result.formattedDistance, "0 m");
  assert.equal(result.durationMs, 150);
  assert.equal(result.error, undefined);
});

test("buildProviderResult handles expected null correctly for successful rejection", () => {
  const result = buildProviderResult(
    "test-prov",
    null,
    150,
    null
  );

  assert.equal(result.provider, "test-prov");
  assert.equal(result.distanceMeters, 0);
  assert.equal(result.formattedDistance, "0 m");
  assert.equal(result.result, null);
  assert.equal(result.error, undefined);
  assert.equal(result.isOutlier, undefined);
});

test("buildProviderResult flags coordinates >460km as outlier", () => {
  // Expected in Costa Rica, but model responded in Madrid, Spain
  const result = buildProviderResult(
    "test-prov",
    { lat: 40.4168, lng: -3.7038 },
    150,
    { lat: 9.9333, lng: -84.0833 }
  );

  assert.ok(result.distanceMeters! > 8_000_000);
  assert.equal(result.isOutlier, true, "Should set isOutlier: true for response > 460km");
});

test("OpenAIProvider returns configured or default model", async () => {
  const { OpenAIProvider } = await import("../lib/providers/openai.ts");
  const provider = new OpenAIProvider();
  const config = provider.getConfigStatus();
  assert.equal(config.modelOrEndpoint, process.env.OPENAI_MODEL || "gpt-6.1-sol-pro");
});


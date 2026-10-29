import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDistanceMeters,
  formatDistance,
  getAccuracyCategory,
  calculateJobSummary,
  isDistanceOutlier,
  calculateMedian,
} from "../lib/geo.ts";
import type { GeocodingResultEntry } from "../lib/types.ts";

test("calculateDistanceMeters calculates accurate distance between Costa Rican coordinates", () => {
  // San José Central Park to Alajuela Central Park (~17-18 km)
  const sj = { lat: 9.9333, lng: -84.0833 };
  const alajuela = { lat: 10.0167, lng: -84.2167 };
  const dist = calculateDistanceMeters(sj, alajuela);

  assert.ok(dist > 15000 && dist < 20000, `Expected distance ~17km, got ${dist}m`);
});

test("calculateDistanceMeters returns 0 for identical coordinates", () => {
  const coord = { lat: 9.9333, lng: -84.0833 };
  const dist = calculateDistanceMeters(coord, coord);
  assert.equal(dist, 0);
});

test("formatDistance formats meters, kilometers, and null correctly", () => {
  assert.equal(formatDistance(null), "N/A");
  assert.equal(formatDistance(undefined), "N/A");
  assert.equal(formatDistance(0), "0 m");
  assert.equal(formatDistance(45), "45 m");
  assert.equal(formatDistance(950), "950 m");
  assert.equal(formatDistance(1000), "1.00 km");
  assert.equal(formatDistance(12500), "12.5 km");
});

test("getAccuracyCategory classifies accuracy tiers correctly", () => {
  assert.equal(getAccuracyCategory(null), "error");
  assert.equal(getAccuracyCategory(undefined), "error");
  assert.equal(getAccuracyCategory(0), "excellent");
  assert.equal(getAccuracyCategory(50), "excellent");
  assert.equal(getAccuracyCategory(100), "excellent");
  assert.equal(getAccuracyCategory(101), "moderate");
  assert.equal(getAccuracyCategory(500), "moderate");
  assert.equal(getAccuracyCategory(1000), "moderate");
  assert.equal(getAccuracyCategory(1001), "poor");
  assert.equal(getAccuracyCategory(5000), "poor");
});

test("calculateJobSummary aggregates metrics for normal results", () => {
  const results: GeocodingResultEntry[] = [
    {
      input: "Address 1",
      expectedResult: { lat: 9.9333, lng: -84.0833 },
      providersResults: [
        {
          provider: "provider-a",
          result: { lat: 9.9335, lng: -84.0835 },
          durationMs: 120,
          distanceMeters: 30,
          formattedDistance: "30 m",
        },
        {
          provider: "provider-b",
          result: { lat: 9.9340, lng: -84.0840 },
          durationMs: 200,
          distanceMeters: 110,
          formattedDistance: "110 m",
        },
      ],
    },
    {
      input: "Address 2",
      expectedResult: { lat: 10.0, lng: -84.2 },
      providersResults: [
        {
          provider: "provider-a",
          result: { lat: 10.0005, lng: -84.2005 },
          durationMs: 140,
          distanceMeters: 70,
          formattedDistance: "70 m",
        },
        {
          provider: "provider-b",
          result: null,
          durationMs: 50,
          distanceMeters: null,
          error: "Zero results",
        },
      ],
    },
  ];

  const summary = calculateJobSummary(results, ["provider-a", "provider-b"]);

  assert.equal(summary.totalInputs, 2);
  assert.equal(summary.completedInputs, 2);

  const provA = summary.providers["provider-a"];
  assert.equal(provA.total, 2);
  assert.equal(provA.success, 2);
  assert.equal(provA.errors, 0);
  assert.equal(provA.successRate, 100);
  assert.equal(provA.avgDistanceMeters, 50); // (30 + 70) / 2
  assert.equal(provA.accuracyTiers.excellent, 2);

  const provB = summary.providers["provider-b"];
  assert.equal(provB.total, 2);
  assert.equal(provB.success, 1);
  assert.equal(provB.errors, 1);
  assert.equal(provB.successRate, 50);
  assert.equal(provB.avgDistanceMeters, 110);
  assert.equal(provB.accuracyTiers.moderate, 1);
  assert.equal(provB.accuracyTiers.poor, 1);
});

test("isDistanceOutlier correctly flags distances beyond Costa Rica max span (460km)", () => {
  assert.equal(isDistanceOutlier(null), false);
  assert.equal(isDistanceOutlier(undefined), false);
  assert.equal(isDistanceOutlier(0), false);
  assert.equal(isDistanceOutlier(100), false);
  assert.equal(isDistanceOutlier(460_000), false); // Exactly 460 km
  assert.equal(isDistanceOutlier(460_001), true);  // Beyond 460 km
  assert.equal(isDistanceOutlier(10_000_000), true); // Wild point (e.g. Madrid or Beijing)
});

test("calculateMedian computes accurate median for odd, even, and empty arrays", () => {
  assert.equal(calculateMedian([]), null);
  assert.equal(calculateMedian([45]), 45);
  // Odd length
  assert.equal(calculateMedian([10, 50, 20]), 20);
  // Even length: average of middle two (20 + 40) / 2 = 30
  assert.equal(calculateMedian([10, 20, 40, 100]), 30);
});

test("calculateJobSummary isolates outliers from avgDistanceMeters and tracks outlier counts", () => {
  const results: GeocodingResultEntry[] = [
    {
      input: "San José Central Park",
      expectedResult: { lat: 9.9333, lng: -84.0833 },
      providersResults: [
        {
          provider: "wild-model",
          result: { lat: 9.9335, lng: -84.0835 },
          durationMs: 100,
          distanceMeters: 40,
        },
      ],
    },
    {
      input: "Alajuela Cathedral",
      expectedResult: { lat: 10.0167, lng: -84.2167 },
      providersResults: [
        {
          provider: "wild-model",
          result: { lat: 10.0170, lng: -84.2170 },
          durationMs: 120,
          distanceMeters: 60,
        },
      ],
    },
    {
      input: "Address with wild foreign response (Spain)",
      expectedResult: { lat: 9.9333, lng: -84.0833 },
      providersResults: [
        {
          provider: "wild-model",
          result: { lat: 40.4168, lng: -3.7038 }, // Madrid, Spain!
          durationMs: 250,
          distanceMeters: 8_500_000, // 8,500 km away!
        },
      ],
    },
  ];

  const summary = calculateJobSummary(results, ["wild-model"]);
  const prov = summary.providers["wild-model"];

  assert.equal(prov.total, 3);
  assert.equal(prov.success, 3);
  assert.equal(prov.outliers, 1, "Should count 1 outlier (>460km)");
  
  // Notice: raw average is (40 + 60 + 8,500,000) / 3 = ~2,833,367 meters
  assert.equal(prov.rawAvgDistanceMeters, 2833367);

  // Representative average EXCLUDES the 8,500km outlier: (40 + 60) / 2 = 50 meters!
  assert.equal(prov.avgDistanceMeters, 50, "Average distance must not be skewed by foreign outlier");

  // Median of [40, 60] is 50 meters
  assert.equal(prov.medianDistanceMeters, 50);

  // Min and max of valid in-bounds predictions
  assert.equal(prov.minDistanceMeters, 40);
  assert.equal(prov.maxDistanceMeters, 60);

  // The outlier falls into poor tier
  assert.equal(prov.accuracyTiers.excellent, 2);
  assert.equal(prov.accuracyTiers.poor, 1);
});

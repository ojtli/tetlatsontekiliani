import test from "node:test";
import assert from "node:assert/strict";
import {
  computePercentiles,
  computeEcdf,
  computeParetoOptimalProviders,
  calculateCompositeScore,
  processBenchmarkStats,
} from "../lib/benchmark-stats";
import { JobResultFile } from "../lib/types";

test("computePercentiles computes accurate percentiles and IQR using d3-array", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const p = computePercentiles(values);

  assert.equal(p.min, 10);
  assert.equal(p.max, 100);
  assert.equal(p.p50, 55); // median of 10 items
  assert.ok(p.p25 >= 25 && p.p25 <= 35);
  assert.ok(p.p75 >= 75 && p.p75 <= 85);
  assert.equal(p.iqr, p.p75 - p.p25);

  // Empty array handling
  const empty = computePercentiles([]);
  assert.equal(empty.min, 0);
  assert.equal(empty.p50, 0);
  assert.equal(empty.iqr, 0);
});

test("computeEcdf computes exact reach curve percentages across thresholds", () => {
  // 10 items: 5 are <= 50m, 8 are <= 100m, all 10 are <= 500m
  const distances = [5, 12, 25, 45, 50, 60, 85, 95, 200, 350];
  const ecdf = computeEcdf(distances, 10);

  const at50 = ecdf.find((pt) => pt.threshold === 50);
  assert.ok(at50);
  assert.equal(at50.count, 5);
  assert.equal(at50.percentage, 50);

  const at100 = ecdf.find((pt) => pt.threshold === 100);
  assert.ok(at100);
  assert.equal(at100.count, 8);
  assert.equal(at100.percentage, 80);

  const at500 = ecdf.find((pt) => pt.threshold === 500);
  assert.ok(at500);
  assert.equal(at500.count, 10);
  assert.equal(at500.percentage, 100);
});

test("computeParetoOptimalProviders identifies non-dominated frontier", () => {
  const providers = [
    { provider: "fast-but-coarse", avgDistanceMeters: 200, avgDurationMs: 100 }, // Pareto: fastest
    { provider: "accurate-but-slow", avgDistanceMeters: 50, avgDurationMs: 500 }, // Pareto: most accurate
    { provider: "dominated-by-fast", avgDistanceMeters: 250, avgDurationMs: 150 }, // Dominated by fast-but-coarse
    { provider: "dominated-by-both", avgDistanceMeters: 300, avgDurationMs: 600 }, // Dominated by both
  ];

  const optimal = computeParetoOptimalProviders(providers);

  assert.equal(optimal.has("fast-but-coarse"), true);
  assert.equal(optimal.has("accurate-but-slow"), true);
  assert.equal(optimal.has("dominated-by-fast"), false);
  assert.equal(optimal.has("dominated-by-both"), false);
});

test("calculateCompositeScore applies weights and calculates contributions", () => {
  const score = calculateCompositeScore(80, 50, 100, {
    accuracy: 0.6,
    speed: 0.3,
    reliability: 0.1,
  });

  // 80 * 0.6 = 48
  // 50 * 0.3 = 15
  // 100 * 0.1 = 10
  // Total = 73
  assert.equal(score.accuracyContribution, 48);
  assert.equal(score.speedContribution, 15);
  assert.equal(score.reliabilityContribution, 10);
  assert.equal(score.overallScore, 73);
});

test("processBenchmarkStats handles negative inputs and calculates awards and deltas", () => {
  const mockFile: JobResultFile = {
    filename: "test-benchmark.json",
    startedAt: "2026-10-18T12:00:00Z",
    completedAt: "2026-10-18T12:01:00Z",
    providers: ["provider-a", "provider-b", "llm-provider"],
    results: [
      // Entry 1: Standard input
      {
        input: "Address 1",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          { provider: "provider-a", result: { lat: 9.9301, lng: -84.0801 }, distanceMeters: 15, durationMs: 200 },
          { provider: "provider-b", result: { lat: 9.9305, lng: -84.0805 }, distanceMeters: 75, durationMs: 100 },
          { provider: "llm-provider", result: { lat: 9.932, lng: -84.082 }, distanceMeters: 300, durationMs: 1500 },
        ],
      },
      // Entry 2: Negative input (expectedResult is null)
      {
        input: "Unresolvable fake place",
        expectedResult: null,
        providersResults: [
          // provider-a correctly rejects -> True Negative
          { provider: "provider-a", result: null, distanceMeters: null, durationMs: 180 },
          // provider-b correctly rejects -> True Negative
          { provider: "provider-b", result: null, distanceMeters: null, durationMs: 90 },
          // llm-provider hallucinates coordinates -> False Positive
          { provider: "llm-provider", result: { lat: 9.95, lng: -84.1 }, distanceMeters: null, durationMs: 1800 },
        ],
      },
    ],
  };

  const processed = processBenchmarkStats(mockFile);

  // provider-a should have 0 hallucinations and 1 true negative
  const provA = processed.providers.find((p) => p.provider === "provider-a")!;
  assert.equal(provA.hallucinationCount, 0);
  assert.equal(provA.trueNegativeCount, 1);
  assert.equal(provA.successRate, 100);

  // llm-provider should have 1 hallucination
  const llm = processed.providers.find((p) => p.provider === "llm-provider")!;
  assert.equal(llm.hallucinationCount, 1);
  assert.ok(llm.reliabilityScore < 100);

  // Winner awards
  assert.ok(processed.winnerAwards.bestAccuracy);
  assert.equal(processed.winnerAwards.bestAccuracy.provider.provider, "provider-a");
  assert.equal(processed.winnerAwards.bestAccuracy.runnerUp?.provider, "provider-b");
  // deltaMeters = 75 - 15 = 60
  assert.equal(processed.winnerAwards.bestAccuracy.deltaMeters, 60);

  assert.ok(processed.winnerAwards.fastestLatency);
  assert.equal(processed.winnerAwards.fastestLatency.provider.provider, "provider-b");

  // Head-to-head deltas vs baseline (default Rank #1 provider-a)
  assert.equal(processed.baselineProvider, "provider-a");
  const provB = processed.providers.find((p) => p.provider === "provider-b")!;
  assert.equal(provB.distanceDeltaMeters, 60); // 75 - 15 = +60m
});

test("accurately computes 3-tier pinpoint breakdowns (≤100m, 100m-1km, >1km)", () => {
  const distances = [15, 45, 95, 100, 250, 800, 1200, 3500]; // 8 total
  const pinPoint = distances.filter((d) => d <= 100).length; // 4
  const moderate = distances.filter((d) => d > 100 && d <= 1000).length; // 2
  const poor = distances.filter((d) => d > 1000).length; // 2

  assert.equal(pinPoint, 4);
  assert.equal(moderate, 2);
  assert.equal(poor, 2);

  const pctPinpoint = (pinPoint / distances.length) * 100;
  assert.equal(pctPinpoint, 50);
});

test("calculates relative speed multipliers and error distance ratios vs leader", () => {
  const fastestDuration = 200; // ms
  const slowDuration = 1200; // ms
  const ratio = slowDuration / fastestDuration;
  assert.equal(ratio, 6.0);

  const bestDistance = 50; // meters
  const runnerUpDistance = 150; // meters
  const errorRatio = runnerUpDistance / bestDistance;
  const deltaDistance = runnerUpDistance - bestDistance;

  assert.equal(errorRatio, 3.0);
  assert.equal(deltaDistance, 100);
});

test("bestAccuracy award and Overall Leader accuracyScore use median (P50) instead of average", () => {
  // Provider A has median 20m, but 1 distant outlier pulls its average to 500m
  // Provider B has median 200m, with consistent distances so average is 200m
  const mockFile: JobResultFile = {
    filename: "skew-test.json",
    startedAt: "2026-10-18T12:00:00Z",
    completedAt: "2026-10-18T12:01:00Z",
    providers: ["provider-a", "provider-b"],
    results: [
      {
        input: "Test 1",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          { provider: "provider-a", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 20, durationMs: 200 },
          { provider: "provider-b", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 200, durationMs: 200 },
        ],
      },
      {
        input: "Test 2",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          { provider: "provider-a", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 20, durationMs: 200 },
          { provider: "provider-b", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 200, durationMs: 200 },
        ],
      },
      {
        input: "Test 3",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          { provider: "provider-a", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 1460, durationMs: 200 },
          { provider: "provider-b", result: { lat: 9.93, lng: -84.08 }, distanceMeters: 200, durationMs: 200 },
        ],
      },
    ],
  };

  const processed = processBenchmarkStats(mockFile);

  const provA = processed.providers.find((p) => p.provider === "provider-a")!;
  const provB = processed.providers.find((p) => p.provider === "provider-b")!;

  // A has higher average error (500m vs 200m)
  assert.equal(provA.avgDistanceMeters, 500);
  assert.equal(provB.avgDistanceMeters, 200);

  // But A has lower median error (20m vs 200m)
  assert.equal(provA.distanceStats.p50, 20);
  assert.equal(provB.distanceStats.p50, 200);

  // Best Accuracy award MUST pick provider-a because its median is 20m vs provider-b's 200m
  assert.ok(processed.winnerAwards.bestAccuracy);
  assert.equal(processed.winnerAwards.bestAccuracy.provider.provider, "provider-a");
  assert.equal(processed.winnerAwards.bestAccuracy.runnerUp?.provider, "provider-b");
  assert.equal(processed.winnerAwards.bestAccuracy.deltaMeters, 180); // 200m - 20m = 180m
  assert.equal(processed.winnerAwards.bestAccuracy.deltaPct, 90); // 180 / 200 = 90% lower error

  // Accuracy score in composite ranking must reward provider-a higher for its 20m median
  assert.ok(provA.accuracyScore > provB.accuracyScore);
});



import test from "node:test";
import assert from "node:assert/strict";
import {
  isProviderResultFailed,
  countFailedResultsByProvider,
  filterRetryTasks,
  applyRetryResult,
  recalculateJobFileSummary,
} from "../lib/retry";
import { GeocodingResultEntry, JobResultFile } from "../lib/types";

test("isProviderResultFailed correctly classifies failed vs successful results", () => {
  // Undefined or null
  assert.equal(isProviderResultFailed(undefined), true);
  assert.equal(isProviderResultFailed(null), true);

  // Error present
  assert.equal(
    isProviderResultFailed({
      provider: "lm-studio",
      result: null,
      durationMs: 120000,
      distanceMeters: null,
      error: "Timeout error",
    }),
    true
  );

  // Result is null
  assert.equal(
    isProviderResultFailed({
      provider: "openai",
      result: null,
      durationMs: 100,
      distanceMeters: null,
    }),
    true
  );

  // Outlier
  assert.equal(
    isProviderResultFailed({
      provider: "google-gemini",
      result: { lat: 0, lng: 0 },
      durationMs: 250,
      distanceMeters: 500000,
      isOutlier: true,
    }),
    true
  );

  // Successful valid coordinate
  assert.equal(
    isProviderResultFailed({
      provider: "google-gemini",
      result: { lat: 9.9333, lng: -84.0833 },
      durationMs: 250,
      distanceMeters: 45,
    }),
    false
  );
});

test("countFailedResultsByProvider counts failures strictly when expectedResult is not null", () => {
  const results: GeocodingResultEntry[] = [
    // Entry 1: expectedResult not null, lm-studio failed, openai succeeded
    {
      input: "San Jose Centro",
      expectedResult: { lat: 9.9333, lng: -84.0833 },
      providersResults: [
        {
          provider: "lm-studio",
          result: null,
          durationMs: 120000,
          distanceMeters: null,
          error: "Timeout",
        },
        {
          provider: "openai",
          result: { lat: 9.9334, lng: -84.0832 },
          durationMs: 200,
          distanceMeters: 15,
        },
      ],
    },
    // Entry 2: expectedResult is null (negative test case) -> MUST BE EXCLUDED even if failed
    {
      input: "Invalid non-address",
      expectedResult: null,
      providersResults: [
        {
          provider: "lm-studio",
          result: null,
          durationMs: 100,
          distanceMeters: 0,
        },
        {
          provider: "openai",
          result: { lat: 9.93, lng: -84.08 },
          durationMs: 200,
          distanceMeters: null,
          error: "Hallucinated coordinate",
        },
      ],
    },
    // Entry 3: expectedResult not null, both failed
    {
      input: "Cartago Centro",
      expectedResult: { lat: 9.8644, lng: -83.9194 },
      providersResults: [
        {
          provider: "lm-studio",
          result: null,
          durationMs: 120000,
          distanceMeters: null,
          error: "Network error",
        },
        {
          provider: "openai",
          result: null,
          durationMs: 50,
          distanceMeters: null,
          error: "Rate limit",
        },
      ],
    },
  ];

  const counts = countFailedResultsByProvider(results, ["lm-studio", "openai", "nvidia"]);
  assert.equal(counts["lm-studio"], 2);
  assert.equal(counts["openai"], 1);
  assert.equal(counts["nvidia"], 2); // missing is treated as failed
});

test("filterRetryTasks extracts only retryable entries and tracks failed providers", () => {
  const results: GeocodingResultEntry[] = [
    // Entry 0: expected not null, provA failed, provB succeeded
    {
      input: "San Pedro",
      expectedResult: { lat: 9.93, lng: -84.05 },
      providersResults: [
        { provider: "provA", result: null, durationMs: 0, distanceMeters: null, error: "err" },
        { provider: "provB", result: { lat: 9.93, lng: -84.05 }, durationMs: 50, distanceMeters: 10 },
      ],
    },
    // Entry 1: expected null -> must be skipped
    {
      input: "Unresolvable",
      expectedResult: null,
      providersResults: [
        { provider: "provA", result: null, durationMs: 0, distanceMeters: 0 },
      ],
    },
    // Entry 2: expected not null, provA succeeded, provB succeeded
    {
      input: "Alajuela",
      expectedResult: { lat: 10.01, lng: -84.21 },
      providersResults: [
        { provider: "provA", result: { lat: 10.01, lng: -84.21 }, durationMs: 50, distanceMeters: 5 },
        { provider: "provB", result: { lat: 10.01, lng: -84.21 }, durationMs: 50, distanceMeters: 8 },
      ],
    },
  ];

  // Filtering for provA only
  const tasksA = filterRetryTasks(results, ["provA"]);
  assert.equal(tasksA.length, 1);
  assert.equal(tasksA[0].entryIndex, 0);
  assert.deepEqual(tasksA[0].failedProviders, ["provA"]);

  // Filtering for provB only (none failed for provB where expected is not null)
  const tasksB = filterRetryTasks(results, ["provB"]);
  assert.equal(tasksB.length, 0);

  // Filtering for both provA and provB
  const tasksBoth = filterRetryTasks(results, ["provA", "provB"]);
  assert.equal(tasksBoth.length, 1);
  assert.deepEqual(tasksBoth[0].failedProviders, ["provA"]);
});

test("applyRetryResult only updates when expectedResult is not null and result is not nullish", () => {
  // Case 1: expectedResult is null -> must reject update
  const entryNullExpected: GeocodingResultEntry = {
    input: "Fake address",
    expectedResult: null,
    providersResults: [
      { provider: "lm-studio", result: null, durationMs: 10, distanceMeters: 0 },
    ],
  };

  const updateSuccess = applyRetryResult(entryNullExpected, {
    provider: "lm-studio",
    result: { lat: 9.93, lng: -84.08 },
    durationMs: 150,
    distanceMeters: 50,
  });
  assert.equal(updateSuccess, false);
  assert.equal(entryNullExpected.providersResults[0].result, null);

  // Case 2: retry result is nullish -> must reject update
  const entryValid: GeocodingResultEntry = {
    input: "Escazu",
    expectedResult: { lat: 9.92, lng: -84.14 },
    providersResults: [
      { provider: "lm-studio", result: null, durationMs: 120000, distanceMeters: null, error: "timeout" },
      { provider: "openai", result: { lat: 9.92, lng: -84.14 }, durationMs: 80, distanceMeters: 10 },
    ],
  };

  const nullishUpdate = applyRetryResult(entryValid, {
    provider: "lm-studio",
    result: null,
    durationMs: 120000,
    distanceMeters: null,
    error: "timeout again",
  });
  assert.equal(nullishUpdate, false);
  assert.equal(entryValid.providersResults[0].error, "timeout");

  // Case 3: valid coordinates and expectedResult not null -> succeeds and updates ONLY its own data
  const validUpdate = applyRetryResult(entryValid, {
    provider: "lm-studio",
    result: { lat: 9.9201, lng: -84.1399 },
    durationMs: 1450,
    distanceMeters: 25,
    formattedDistance: "25 m",
  });
  assert.equal(validUpdate, true);
  // Verify lm-studio was updated
  assert.deepEqual(entryValid.providersResults[0].result, { lat: 9.9201, lng: -84.1399 });
  assert.equal(entryValid.providersResults[0].distanceMeters, 25);
  assert.equal(entryValid.providersResults[0].error, undefined);

  // Verify openai was untouched ("Each retry must only update its own data")
  assert.equal(entryValid.providersResults[1].provider, "openai");
  assert.deepEqual(entryValid.providersResults[1].result, { lat: 9.92, lng: -84.14 });
  assert.equal(entryValid.providersResults[1].durationMs, 80);
});

test("recalculateJobFileSummary recalculates summary metrics and retains models", () => {
  const file: JobResultFile = {
    filename: "results-test.json",
    startedAt: "2026-10-22T00:00:00.000Z",
    completedAt: "2026-10-22T00:05:00.000Z",
    providers: ["lm-studio", "openai"],
    providerModels: {
      "lm-studio": "qwen3.6-27b",
      openai: "gpt-6-mini",
    },
    results: [
      {
        input: "San Jose",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          { provider: "lm-studio", result: { lat: 9.93, lng: -84.08 }, durationMs: 1000, distanceMeters: 0 },
          { provider: "openai", result: { lat: 9.93, lng: -84.08 }, durationMs: 200, distanceMeters: 0 },
        ],
      },
      {
        input: "Cartago",
        expectedResult: { lat: 9.86, lng: -83.91 },
        providersResults: [
          { provider: "lm-studio", result: { lat: 9.86, lng: -83.91 }, durationMs: 1200, distanceMeters: 20 },
          { provider: "openai", result: { lat: 9.86, lng: -83.91 }, durationMs: 250, distanceMeters: 10 },
        ],
      },
    ],
    summary: {
      totalInputs: 2,
      completedInputs: 2,
      elapsedMs: 10000,
      topProvider: "openai",
      providers: {
        "lm-studio": {
          provider: "lm-studio",
          model: "qwen3.6-27b",
          total: 2,
          success: 1,
          errors: 1,
          outliers: 0,
          successRate: 50,
          totalMs: 1000,
          avgDurationMs: 1000,
          totalDistanceMeters: 0,
          avgDistanceMeters: 0,
          medianDistanceMeters: 0,
          rawAvgDistanceMeters: 0,
          minDistanceMeters: 0,
          maxDistanceMeters: 0,
          accuracyTiers: { excellent: 1, moderate: 0, poor: 1 },
        },
        openai: {
          provider: "openai",
          model: "gpt-6-mini",
          total: 2,
          success: 2,
          errors: 0,
          outliers: 0,
          successRate: 100,
          totalMs: 450,
          avgDurationMs: 225,
          totalDistanceMeters: 10,
          avgDistanceMeters: 5,
          medianDistanceMeters: 5,
          rawAvgDistanceMeters: 5,
          minDistanceMeters: 0,
          maxDistanceMeters: 10,
          accuracyTiers: { excellent: 2, moderate: 0, poor: 0 },
        },
      },
    },
  };

  const newSummary = recalculateJobFileSummary(file, 2500);

  // Verify total elapsed includes additional time
  assert.equal(newSummary.elapsedMs, 12500);

  // Both providers now have 2 successes and 0 errors in results
  assert.equal(newSummary.providers["lm-studio"].success, 2);
  assert.equal(newSummary.providers["lm-studio"].errors, 0);
  assert.equal(newSummary.providers["lm-studio"].successRate, 100);
  assert.equal(newSummary.providers["lm-studio"].model, "qwen3.6-27b");

  assert.equal(newSummary.providers["openai"].success, 2);
  assert.equal(newSummary.providers["openai"].errors, 0);
  assert.equal(newSummary.providers["openai"].model, "gpt-6-mini");
});

test("filterRetryTasks targets only failed inputs and starts from first failed address", () => {
  const fileResults: GeocodingResultEntry[] = [
    {
      input: "First Address (Successful)",
      expectedResult: { lat: 9.93, lng: -84.08 },
      providersResults: [
        { provider: "lm-studio", result: { lat: 9.93, lng: -84.08 }, durationMs: 500, distanceMeters: 5 },
      ],
    },
    {
      input: "Second Address (Failed lm-studio)",
      expectedResult: { lat: 9.94, lng: -84.09 },
      providersResults: [
        { provider: "lm-studio", result: null, durationMs: 120000, distanceMeters: null, error: "timeout" },
      ],
    },
    {
      input: "Third Address (Failed lm-studio)",
      expectedResult: { lat: 9.95, lng: -84.10 },
      providersResults: [
        { provider: "lm-studio", result: null, durationMs: 120000, distanceMeters: null, error: "connection refused" },
      ],
    },
  ];

  const tasks = filterRetryTasks(fileResults, ["lm-studio"]);
  // Must NOT include the first successful address
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].entryIndex, 1);
  assert.equal(tasks[0].entry.input, "Second Address (Failed lm-studio)");
  assert.equal(tasks[1].entryIndex, 2);
  assert.equal(tasks[1].entry.input, "Third Address (Failed lm-studio)");
});

test("filterRetryTasks and countFailedResultsByProvider ignore providers not in original run", () => {
  const fileResults: GeocodingResultEntry[] = [
    {
      input: "Address 1",
      expectedResult: { lat: 9.93, lng: -84.08 },
      providersResults: [
        { provider: "lm-studio", result: null, durationMs: 120000, distanceMeters: null, error: "timeout" },
      ],
    },
    {
      input: "Address 2",
      expectedResult: { lat: 9.94, lng: -84.09 },
      providersResults: [
        { provider: "lm-studio", result: { lat: 9.94, lng: -84.09 }, durationMs: 200, distanceMeters: 5 },
      ],
    },
  ];

  // google-gemini was never in this run (fileProviders is ["lm-studio"])
  const counts = countFailedResultsByProvider(fileResults, ["lm-studio", "google-gemini"], ["lm-studio"]);
  assert.equal(counts["lm-studio"], 1);
  assert.equal(counts["google-gemini"], 0);

  const tasks = filterRetryTasks(fileResults, ["lm-studio", "google-gemini"], ["lm-studio"]);
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].failedProviders, ["lm-studio"]);
});

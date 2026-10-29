import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDelta,
  buildComparisonRows,
  buildOverallComparison,
  selectDefaultComparisonRuns,
  formatResultFileOptionLabel,
  getDeltaSortScore,
} from "../lib/compare";
import { calculateJobSummary } from "../lib/geo";
import { JobResultFile } from "../lib/types";

test("calculateDelta classifies changes accurately", () => {
  // Baseline error -> Comparison succeeded: drop Fixed label (formattedDelta is "")
  const fixed = calculateDelta(null, 50);
  assert.equal(fixed.type, "fixed");
  assert.equal(fixed.formattedDelta, "");

  // Baseline succeeded -> Comparison failed: Failed
  const failed = calculateDelta(100, null);
  assert.equal(failed.type, "failed");
  assert.equal(failed.formattedDelta, "Failed 🔴");

  // Negligible change (<= 2m)
  const neutral = calculateDelta(100, 101);
  assert.equal(neutral.type, "neutral");
  assert.equal(neutral.diffMeters, 0);

  // Significant improvement (error decreased)
  const improvement = calculateDelta(200, 100);
  assert.equal(improvement.type, "improvement");
  assert.equal(improvement.diffMeters, -100);
  assert.equal(improvement.formattedDelta, "▲ -50%");

  // Significant regression (error increased)
  const regression = calculateDelta(100, 200);
  assert.equal(regression.type, "regression");
  assert.equal(regression.diffMeters, 100);
  assert.equal(regression.formattedDelta, "▼ +100%");

  // Both missing
  const bothMissing = calculateDelta(null, null);
  assert.equal(bothMissing.type, "error");
});

test("buildComparisonRows and buildOverallComparison align runs and compute deltas", () => {
  const resultsA = [
    {
      input: "San Jose, Costa Rica",
      expectedResult: { lat: 9.934, lng: -84.08 },
      providersResults: [
        {
          provider: "provider-a",
          result: { lat: 9.9341, lng: -84.0801 },
          distanceMeters: 15,
          durationMs: 120,
        },
        {
          provider: "provider-b",
          result: { lat: 9.935, lng: -84.081 },
          distanceMeters: 150,
          durationMs: 80,
        },
      ],
    },
  ];

  const providers = ["provider-a", "provider-b"];

  const runA: JobResultFile = {
    filename: "run-a.json",
    startedAt: "2026-10-16T00:00:00Z",
    completedAt: "2026-10-16T00:01:00Z",
    providers,
    results: resultsA,
    summary: calculateJobSummary(resultsA, providers),
  };

  const resultsB = [
    {
      input: "San Jose, Costa Rica",
      expectedResult: { lat: 9.934, lng: -84.08 },
      providersResults: [
        {
          provider: "provider-a",
          result: { lat: 9.93405, lng: -84.08005 },
          distanceMeters: 8,
          durationMs: 110,
        },
        {
          provider: "provider-b",
          result: null,
          error: "Timeout",
          distanceMeters: null,
          durationMs: 5000,
        },
      ],
    },
  ];

  const runB: JobResultFile = {
    filename: "run-b.json",
    startedAt: "2026-10-16T01:00:00Z",
    completedAt: "2026-10-16T01:01:00Z",
    providers,
    results: resultsB,
    summary: calculateJobSummary(resultsB, providers),
  };

  const rows = buildComparisonRows([runA, runB]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].providers["provider-a"].length, 2);
  assert.equal(rows[0].providers["provider-a"][1].deltaToBaseline?.type, "improvement");
  assert.equal(rows[0].providers["provider-b"][1].deltaToBaseline?.type, "failed");

  const overall = buildOverallComparison(rows, ["provider-a", "provider-b"], runA, runB);
  assert.equal(overall.length, 2);
  const provA = overall.find((o) => o.provider === "provider-a");
  assert.equal(provA?.improvedCount, 1);
  assert.equal(provA?.baseAvgDistance, 15);
  assert.equal(provA?.compAvgDistance, 8);
});

test("buildComparisonRows and buildOverallComparison track specific models per run", () => {
  const run1: JobResultFile = {
    filename: "run-1.json",
    startedAt: "2026-10-16T00:00:00Z",
    completedAt: "2026-10-16T00:01:00Z",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.6-flash" },
    results: [
      {
        input: "San Jose",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.6-flash",
            result: { lat: 9.931, lng: -84.081 },
            distanceMeters: 120,
            durationMs: 500,
          },
        ],
      },
    ],
  };

  const run2: JobResultFile = {
    filename: "run-2.json",
    startedAt: "2026-10-16T01:00:00Z",
    completedAt: "2026-10-16T01:01:00Z",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
    results: [
      {
        input: "San Jose",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.8-flash",
            result: { lat: 9.9302, lng: -84.0802 },
            distanceMeters: 30,
            durationMs: 400,
          },
        ],
      },
    ],
  };

  const rows = buildComparisonRows([run1, run2]);
  assert.equal(rows[0].providers["google-gemini"][0].model, "gemini-3.6-flash");
  assert.equal(rows[0].providers["google-gemini"][1].model, "gemini-3.8-flash");

  const overall = buildOverallComparison(rows, ["google-gemini"], run1, run2);
  assert.equal(overall[0].baseModel, "gemini-3.6-flash");
  assert.equal(overall[0].compModel, "gemini-3.8-flash");
});

test("selectDefaultComparisonRuns defaults to the latest three runs correctly ordered", () => {
  // Empty
  assert.deepEqual(selectDefaultComparisonRuns([]), { runA: "", runB: "", runC: "" });

  // 1 run
  assert.deepEqual(
    selectDefaultComparisonRuns([{ filename: "run-1.json", completedAt: "2026-10-16T10:00:00Z" }]),
    { runA: "run-1.json", runB: "", runC: "" }
  );

  // 2 runs
  const twoRuns = [
    { filename: "run-2.json", completedAt: "2026-10-16T12:00:00Z" },
    { filename: "run-1.json", completedAt: "2026-10-16T10:00:00Z" },
  ];
  assert.deepEqual(selectDefaultComparisonRuns(twoRuns), {
    runA: "run-1.json",
    runB: "run-2.json",
    runC: "",
  });

  // 5 runs (ordered newest first as from API)
  const fiveRuns = [
    { filename: "run-5.json", completedAt: "2026-10-16T15:00:00Z" }, // latest
    { filename: "run-4.json", completedAt: "2026-10-16T14:00:00Z" }, // middle of the 3
    { filename: "run-3.json", completedAt: "2026-10-16T13:00:00Z" }, // earliest of the 3
    { filename: "run-2.json", completedAt: "2026-10-16T12:00:00Z" },
    { filename: "run-1.json", completedAt: "2026-10-16T10:00:00Z" },
  ];
  const defaults = selectDefaultComparisonRuns(fiveRuns);
  // runA should be second most recent file (run-4.json, baseline)
  assert.equal(defaults.runA, "run-4.json");
  // runB should be the latest file (run-5.json, comparison)
  assert.equal(defaults.runB, "run-5.json");
  // runC should be "None" ("") by default
  assert.equal(defaults.runC, "");
});

test("formatResultFileOptionLabel formats option label consistently with the results page", () => {
  const file1 = {
    filename: "results-2026-10-18T20-00-00.json",
    completedAt: "2026-10-18T20:15:00.000Z",
    providers: ["provider-a", "provider-b"],
    totalResults: 10,
  };

  const labelEn = formatResultFileOptionLabel(file1, { locale: "en-US" });
  assert.match(labelEn, /Oct 18.*\(2 prov, 10 addr\)/);

  // Missing completedAt falls back to filename
  const fileWithoutDate = {
    filename: "results-custom.json",
    providers: ["provider-a"],
    totalResults: 5,
  };
  const fallbackLabel = formatResultFileOptionLabel(fileWithoutDate);
  assert.equal(fallbackLabel, "results-custom.json (1 prov, 5 addr)");

  // Invalid date falls back to filename
  const fileWithInvalidDate = {
    filename: "results-invalid.json",
    completedAt: "invalid-date-string",
    providers: [],
    totalResults: 0,
  };
  const invalidDateLabel = formatResultFileOptionLabel(fileWithInvalidDate);
  assert.equal(invalidDateLabel, "results-invalid.json (0 prov, 0 addr)");
});

test("getDeltaSortScore calculates accurate ranking scores for sorting comparison results", () => {
  // Empty / undefined cell
  assert.equal(getDeltaSortScore(undefined, 1), null);
  assert.equal(getDeltaSortScore({ runIndex: 1, result: null }, 1), null);

  // Run A (baseline): sorts by baseline distance
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 0,
        result: { provider: "provider-b", result: { lat: 9, lng: -84 }, distanceMeters: 45, durationMs: 100 },
      },
      0
    ),
    45
  );

  // Run A with error -> ranked at end (1e9)
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 0,
        result: { provider: "provider-b", result: null, error: "Failed", distanceMeters: null, durationMs: 100 },
      },
      0
    ),
    1e9
  );

  // Run B (comparison): numeric improvement (-150m)
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 1,
        result: { provider: "provider-b", result: { lat: 9, lng: -84 }, distanceMeters: 50, durationMs: 100 },
        deltaToBaseline: {
          diffMeters: -150,
          percentChange: -75,
          type: "improvement",
          formattedDelta: "▲ -75%",
        },
      },
      1
    ),
    -150
  );

  // Run B: numeric regression (+300m)
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 1,
        result: { provider: "provider-b", result: { lat: 9, lng: -84 }, distanceMeters: 500, durationMs: 100 },
        deltaToBaseline: {
          diffMeters: 300,
          percentChange: 150,
          type: "regression",
          formattedDelta: "▼ +150%",
        },
      },
      1
    ),
    300
  );

  // Run B: fixed (baseline errored, comp succeeded) -> top improvement (-1e9)
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 1,
        result: { provider: "provider-b", result: { lat: 9, lng: -84 }, distanceMeters: 80, durationMs: 100 },
        deltaToBaseline: {
          diffMeters: null,
          percentChange: null,
          type: "fixed",
          formattedDelta: "",
        },
      },
      1
    ),
    -1e9
  );

  // Run B: failed (baseline succeeded, comp failed) -> top regression (1e9)
  assert.equal(
    getDeltaSortScore(
      {
        runIndex: 1,
        result: { provider: "provider-b", result: null, error: "API timeout", distanceMeters: null, durationMs: 5000 },
        deltaToBaseline: {
          diffMeters: null,
          percentChange: null,
          type: "failed",
          formattedDelta: "Failed 🔴",
        },
      },
      1
    ),
    1e9
  );
});




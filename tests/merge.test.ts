import test from "node:test";
import assert from "node:assert/strict";
import {
  checkMergeCompatibility,
  mergeResultFiles,
  getProviderModelKey,
  determineFileChronology,
} from "../lib/merge";
import { calculateJobSummary } from "../lib/geo";
import { JobResultFile } from "../lib/types";

function createMockResultFile(overrides: Partial<JobResultFile>): JobResultFile {
  const providers = overrides.providers || ["openai"];
  const results = overrides.results || [];
  return {
    filename: overrides.filename || "results-1000.json",
    startedAt: overrides.startedAt || "2026-10-18T10:00:00Z",
    completedAt: overrides.completedAt || "2026-10-18T10:01:00Z",
    providers,
    providerModels: overrides.providerModels || {},
    results,
    summary: overrides.summary || calculateJobSummary(results, providers),
  };
}

test("getProviderModelKey creates distinct keys for models and providers", () => {
  assert.equal(getProviderModelKey("openai"), "openai::");
  assert.equal(getProviderModelKey("google-gemini", "gemini-3.6-flash"), "google-gemini::gemini-3.6-flash");
  assert.equal(getProviderModelKey("google-gemini", "gemini-3.8-flash"), "google-gemini::gemini-3.8-flash");
  assert.notEqual(
    getProviderModelKey("google-gemini", "gemini-3.6-flash"),
    getProviderModelKey("google-gemini", "gemini-3.8-flash")
  );
});

test("determineFileChronology correctly identifies older and newer files", () => {
  const fileOld = createMockResultFile({
    filename: "results-100.json",
    completedAt: "2026-10-17T10:00:00Z",
  });
  const fileNew = createMockResultFile({
    filename: "results-200.json",
    completedAt: "2026-10-18T10:00:00Z",
  });

  const { older, newer } = determineFileChronology(fileOld, fileNew);
  assert.equal(older.filename, "results-100.json");
  assert.equal(newer.filename, "results-200.json");

  // Inverted parameter order should still resolve accurately
  const res2 = determineFileChronology(fileNew, fileOld);
  assert.equal(res2.older.filename, "results-100.json");
  assert.equal(res2.newer.filename, "results-200.json");
});

test("Rule 1: allows merge when providers are different", () => {
  const fileA = createMockResultFile({
    filename: "results-a.json",
    providers: ["openai"],
  });
  const fileB = createMockResultFile({
    filename: "results-b.json",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
  });

  const check = checkMergeCompatibility(fileA, fileB);
  assert.equal(check.canMerge, true);
  assert.equal(check.conflictingProviders.length, 0);
});

test("Rule 1: allows merge when provider is same but models are different", () => {
  const fileA = createMockResultFile({
    filename: "results-a.json",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.6-flash" },
  });
  const fileB = createMockResultFile({
    filename: "results-b.json",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
  });

  const check = checkMergeCompatibility(fileA, fileB);
  assert.equal(check.canMerge, true);
  assert.equal(check.conflictingProviders.length, 0);
});

test("Rule 1: blocks merge when both files share the exact same provider and model", () => {
  const fileA = createMockResultFile({
    filename: "results-a.json",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
  });
  const fileB = createMockResultFile({
    filename: "results-b.json",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
  });

  const check = checkMergeCompatibility(fileA, fileB);
  assert.equal(check.canMerge, false);
  assert.match(check.reason!, /identical results/i);
  assert.equal(check.conflictingProviders.length, 1);
});

test("Rule 1: blocks merge when both files share standard API provider without model", () => {
  const fileA = createMockResultFile({
    filename: "results-a.json",
    providers: ["openai"],
  });
  const fileB = createMockResultFile({
    filename: "results-b.json",
    providers: ["openai", "anthropic"],
  });

  const check = checkMergeCompatibility(fileA, fileB);
  assert.equal(check.canMerge, false);
  assert.match(check.reason!, /openai/);
});

test("Rule 2 & 3: moves data from old to new and deletes old file when all data is moved", () => {
  const older = createMockResultFile({
    filename: "results-old.json",
    completedAt: "2026-10-17T12:00:00Z",
    providers: ["openai"],
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "openai",
            result: { lat: 9.931, lng: -84.081 },
            distanceMeters: 50,
            durationMs: 120,
          },
        ],
      },
      {
        input: "Cartago, Costa Rica",
        expectedResult: { lat: 9.86, lng: -83.92 },
        providersResults: [
          {
            provider: "openai",
            result: { lat: 9.862, lng: -83.922 },
            distanceMeters: 80,
            durationMs: 130,
          },
        ],
      },
    ],
  });

  const newer = createMockResultFile({
    filename: "results-new.json",
    completedAt: "2026-10-18T12:00:00Z",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.8-flash",
            result: { lat: 9.9305, lng: -84.0805 },
            distanceMeters: 25,
            durationMs: 400,
          },
        ],
      },
      {
        input: "Cartago, Costa Rica",
        expectedResult: { lat: 9.86, lng: -83.92 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.8-flash",
            result: { lat: 9.861, lng: -83.921 },
            distanceMeters: 35,
            durationMs: 450,
          },
        ],
      },
    ],
  });

  const merged = mergeResultFiles(older, newer);

  // Older file had 2 inputs, both matched newer. All data moved!
  assert.equal(merged.isOldFileDeleted, true);
  assert.equal(merged.updatedOldFile, null);
  assert.equal(merged.mergedInputsCount, 2);

  // Newer file has both providers now
  assert.deepEqual(merged.updatedNewFile.providers, ["google-gemini", "openai"]);
  assert.equal(merged.updatedNewFile.results[0].providersResults.length, 2);

  // Recalculated summary contains both providers
  assert.ok(merged.updatedNewFile.summary?.providers["google-gemini"]);
  assert.ok(merged.updatedNewFile.summary?.providers["openai"]);
  assert.equal(merged.updatedNewFile.summary?.providers["openai"].total, 2);
  assert.equal(merged.updatedNewFile.summary?.providers["google-gemini"].total, 2);
});

test("Rule 2 & 3: retains old file when not all data was moved (unmatched inputs stay in old)", () => {
  const older = createMockResultFile({
    filename: "results-old.json",
    completedAt: "2026-10-17T12:00:00Z",
    providers: ["openai"],
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "openai",
            result: { lat: 9.931, lng: -84.081 },
            distanceMeters: 50,
            durationMs: 120,
          },
        ],
      },
      {
        input: "Unique Old Address Only, Costa Rica",
        expectedResult: { lat: 10.0, lng: -84.2 },
        providersResults: [
          {
            provider: "openai",
            result: { lat: 10.01, lng: -84.21 },
            distanceMeters: 90,
            durationMs: 140,
          },
        ],
      },
    ],
  });

  const newer = createMockResultFile({
    filename: "results-new.json",
    completedAt: "2026-10-18T12:00:00Z",
    providers: ["google-gemini"],
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            result: { lat: 9.9305, lng: -84.0805 },
            distanceMeters: 25,
            durationMs: 400,
          },
        ],
      },
    ],
  });

  // Without includeUnmatchedFromOld
  const merged = mergeResultFiles(older, newer, { includeUnmatchedFromOld: false });

  // Older file still has 1 unmatched input
  assert.equal(merged.isOldFileDeleted, false);
  assert.notEqual(merged.updatedOldFile, null);
  assert.equal(merged.updatedOldFile?.results.length, 1);
  assert.equal(merged.updatedOldFile?.results[0].input, "Unique Old Address Only, Costa Rica");
  assert.equal(merged.unmatchedInputsRetained, 1);

  // Recalculated summary on retained old file
  assert.equal(merged.updatedOldFile?.summary?.totalInputs, 1);
  assert.equal(merged.updatedOldFile?.summary?.providers["openai"].total, 1);

  // Newer file has San Jose merged
  assert.equal(merged.updatedNewFile.results.length, 1);
  assert.equal(merged.updatedNewFile.results[0].providersResults.length, 2);
});

test("Rule 1 Disambiguation: merges same provider with different models by disambiguating identifier", () => {
  const older = createMockResultFile({
    filename: "results-old.json",
    completedAt: "2026-10-17T12:00:00Z",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.6-flash" },
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.6-flash",
            result: { lat: 9.931, lng: -84.081 },
            distanceMeters: 50,
            durationMs: 120,
          },
        ],
      },
    ],
  });

  const newer = createMockResultFile({
    filename: "results-new.json",
    completedAt: "2026-10-18T12:00:00Z",
    providers: ["google-gemini"],
    providerModels: { "google-gemini": "gemini-3.8-flash" },
    results: [
      {
        input: "San Jose, Costa Rica",
        expectedResult: { lat: 9.93, lng: -84.08 },
        providersResults: [
          {
            provider: "google-gemini",
            model: "gemini-3.8-flash",
            result: { lat: 9.9305, lng: -84.0805 },
            distanceMeters: 25,
            durationMs: 400,
          },
        ],
      },
    ],
  });

  const merged = mergeResultFiles(older, newer);

  assert.equal(merged.updatedNewFile.providers.length, 2);
  assert.ok(merged.updatedNewFile.providers.includes("google-gemini"));
  assert.ok(merged.updatedNewFile.providers.includes("google-gemini (gemini-3.6-flash)"));

  const targetResults = merged.updatedNewFile.results[0].providersResults;
  assert.equal(targetResults.length, 2);

  const res38 = targetResults.find((p) => p.model === "gemini-3.8-flash");
  const res36 = targetResults.find((p) => p.model === "gemini-3.6-flash");

  assert.ok(res38);
  assert.ok(res36);
  assert.equal(res36?.provider, "google-gemini (gemini-3.6-flash)");

  // Summary recalculated for both models
  assert.ok(merged.updatedNewFile.summary?.providers["google-gemini"]);
  assert.ok(merged.updatedNewFile.summary?.providers["google-gemini (gemini-3.6-flash)"]);
  assert.equal(
    merged.updatedNewFile.summary?.providers["google-gemini (gemini-3.6-flash)"].model,
    "gemini-3.6-flash"
  );
});

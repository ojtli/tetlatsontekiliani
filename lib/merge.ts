import { JobResultFile, GeocodingResultEntry, ProviderResult } from "./types";
import { calculateJobSummary } from "./geo";

export interface ProviderModelPair {
  provider: string;
  model?: string;
  key: string;
}

export interface MergeCompatibilityResult {
  canMerge: boolean;
  reason?: string;
  olderFile: JobResultFile;
  newerFile: JobResultFile;
  conflictingProviders: ProviderModelPair[];
  sourceProviders: ProviderModelPair[];
  targetProviders: ProviderModelPair[];
  matchingInputsCount: number;
  sourceOnlyInputsCount: number;
  targetOnlyInputsCount: number;
}

export interface MergeExecutionResult {
  updatedNewFile: JobResultFile;
  updatedOldFile: JobResultFile | null;
  isOldFileDeleted: boolean;
  movedProviders: string[];
  mergedInputsCount: number;
  unmatchedInputsRetained: number;
}

/**
 * Normalizes a provider + model into a unique string key.
 * If model is present, format: `${provider}::${model}`.
 * If model is absent or empty, format: `${provider}::`.
 */
export function getProviderModelKey(provider: string, model?: string | null): string {
  return `${provider}::${(model || "").trim().toLowerCase()}`;
}

/**
 * Extracts a map of provider -> model for all providers present in a result file.
 */
export function extractFileProviderModels(file: JobResultFile): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. From providerModels property
  if (file.providerModels) {
    for (const [p, m] of Object.entries(file.providerModels)) {
      if (m) map[p] = m;
    }
  }

  // 2. From summary.providers property
  if (file.summary?.providers) {
    for (const [p, sp] of Object.entries(file.summary.providers)) {
      if (sp?.model && !map[p]) {
        map[p] = sp.model;
      }
    }
  }

  // 3. Fallback from individual result items in results
  if (Array.isArray(file.results)) {
    for (const entry of file.results) {
      if (Array.isArray(entry.providersResults)) {
        for (const pr of entry.providersResults) {
          if (pr.provider && pr.model && !map[pr.provider]) {
            map[pr.provider] = pr.model;
          }
        }
      }
    }
  }

  return map;
}

/**
 * Gets the list of ProviderModelPair items for all providers in the file.
 */
export function getFileProviderModelPairs(file: JobResultFile): ProviderModelPair[] {
  const modelsMap = extractFileProviderModels(file);
  const providers = file.providers && file.providers.length > 0
    ? file.providers
    : Object.keys(file.summary?.providers || {});

  return providers.map((prov) => {
    const model = modelsMap[prov] || undefined;
    return {
      provider: prov,
      model,
      key: getProviderModelKey(prov, model),
    };
  });
}

/**
 * Compares two result files and determines which is older (Source) and which is newer (Target).
 */
export function determineFileChronology(
  fileA: JobResultFile,
  fileB: JobResultFile
): { older: JobResultFile; newer: JobResultFile } {
  const getTime = (f: JobResultFile): number => {
    if (f.completedAt) return new Date(f.completedAt).getTime();
    if (f.startedAt) return new Date(f.startedAt).getTime();
    const match = f.filename.match(/results-(\d+)\.json/);
    if (match) return Number(match[1]);
    return 0;
  };

  const timeA = getTime(fileA);
  const timeB = getTime(fileB);

  if (timeA <= timeB) {
    return { older: fileA, newer: fileB };
  } else {
    return { older: fileB, newer: fileA };
  }
}

/**
 * Checks whether two result files are compatible to be merged according to Rule 1:
 * "only merge results if the providers and models are different...
 * If the two files selected both have Gemini provider and model gemini-3.8-flash then the merge should not happen"
 */
export function checkMergeCompatibility(
  fileA: JobResultFile,
  fileB: JobResultFile
): MergeCompatibilityResult {
  const { older, newer } = determineFileChronology(fileA, fileB);

  const olderPairs = getFileProviderModelPairs(older);
  const newerPairs = getFileProviderModelPairs(newer);

  // Check for duplicate / overlapping (provider, model) keys
  const newerKeysMap = new Map<string, ProviderModelPair>();
  for (const p of newerPairs) {
    newerKeysMap.set(p.key, p);
  }

  const conflictingProviders: ProviderModelPair[] = [];
  for (const p of olderPairs) {
    if (newerKeysMap.has(p.key)) {
      conflictingProviders.push(p);
    }
  }

  // Count matching inputs
  const targetInputsSet = new Set(
    (newer.results || []).map((r) => r.input.trim().toLowerCase())
  );
  const sourceInputsSet = new Set(
    (older.results || []).map((r) => r.input.trim().toLowerCase())
  );

  let matchingInputsCount = 0;
  let sourceOnlyInputsCount = 0;
  for (const inp of sourceInputsSet) {
    if (targetInputsSet.has(inp)) {
      matchingInputsCount++;
    } else {
      sourceOnlyInputsCount++;
    }
  }

  let targetOnlyInputsCount = 0;
  for (const inp of targetInputsSet) {
    if (!sourceInputsSet.has(inp)) {
      targetOnlyInputsCount++;
    }
  }

  if (conflictingProviders.length > 0) {
    const conflictNames = conflictingProviders
      .map((c) => (c.model ? `${c.provider} (${c.model})` : c.provider))
      .join(", ");
    return {
      canMerge: false,
      reason: `Both runs contain identical results for: ${conflictNames}. Merging is only allowed when providers and models are distinct.`,
      olderFile: older,
      newerFile: newer,
      conflictingProviders,
      sourceProviders: olderPairs,
      targetProviders: newerPairs,
      matchingInputsCount,
      sourceOnlyInputsCount,
      targetOnlyInputsCount,
    };
  }

  return {
    canMerge: true,
    olderFile: older,
    newerFile: newer,
    conflictingProviders: [],
    sourceProviders: olderPairs,
    targetProviders: newerPairs,
    matchingInputsCount,
    sourceOnlyInputsCount,
    targetOnlyInputsCount,
  };
}

export interface MergeOptions {
  includeUnmatchedFromOld?: boolean;
}

/**
 * Merges data from olderFile into newerFile.
 * - Providers and models must be compatible (Rule 1).
 * - Moves data from older to newer (Rule 2).
 * - If all data is moved from older, returns updatedOldFile: null and isOldFileDeleted: true (Rule 3).
 * - Recalculates summary for newerFile (and olderFile if partially retained).
 */
export function mergeResultFiles(
  olderFile: JobResultFile,
  newerFile: JobResultFile,
  options?: MergeOptions
): MergeExecutionResult {
  const compatibility = checkMergeCompatibility(olderFile, newerFile);
  if (!compatibility.canMerge) {
    throw new Error(compatibility.reason || "Files cannot be merged due to provider conflict.");
  }

  const includeUnmatched = options?.includeUnmatchedFromOld ?? false;

  // Deep clone to avoid mutating input references
  const target: JobResultFile = JSON.parse(JSON.stringify(newerFile));
  const source: JobResultFile = JSON.parse(JSON.stringify(olderFile));

  target.providerModels = target.providerModels || {};
  source.providerModels = source.providerModels || {};

  const sourceModels = extractFileProviderModels(source);
  const _targetModels = extractFileProviderModels(target);

  // Map each source provider to its identifier in the target file
  // If the target already has the base provider name (with a different model), disambiguate it
  const sourceToTargetProviderId: Record<string, string> = {};
  const movedProviders: string[] = [];

  for (const srcProv of source.providers) {
    const srcModel = sourceModels[srcProv];
    if (target.providers.includes(srcProv)) {
      // Base name collision with distinct model (e.g. google-gemini)
      const disambiguated = srcModel ? `${srcProv} (${srcModel})` : `${srcProv} (alt)`;
      sourceToTargetProviderId[srcProv] = disambiguated;
      if (!target.providers.includes(disambiguated)) {
        target.providers.push(disambiguated);
      }
      if (srcModel) {
        target.providerModels[disambiguated] = srcModel;
      }
      movedProviders.push(disambiguated);
    } else {
      sourceToTargetProviderId[srcProv] = srcProv;
      if (!target.providers.includes(srcProv)) {
        target.providers.push(srcProv);
      }
      if (srcModel) {
        target.providerModels[srcProv] = srcModel;
      }
      movedProviders.push(srcProv);
    }
  }

  // Build target inputs map for fast matching by normalized address
  const targetMap = new Map<string, GeocodingResultEntry>();
  for (const entry of target.results) {
    targetMap.set(entry.input.trim().toLowerCase(), entry);
  }

  let mergedInputsCount = 0;
  const remainingSourceEntries: GeocodingResultEntry[] = [];

  for (const srcEntry of source.results) {
    const normalized = srcEntry.input.trim().toLowerCase();
    const targetEntry = targetMap.get(normalized);

    if (targetEntry) {
      // Move all provider results from source to target entry
      for (const pr of srcEntry.providersResults) {
        const targetPid = sourceToTargetProviderId[pr.provider] || pr.provider;
        const targetModel = sourceModels[pr.provider] || pr.model;

        // Check if target entry already has this provider result (should not happen due to check)
        const existingIdx = targetEntry.providersResults.findIndex((p) => p.provider === targetPid);
        const updatedPr: ProviderResult = {
          ...pr,
          provider: targetPid,
          model: targetModel,
        };

        if (existingIdx >= 0) {
          targetEntry.providersResults[existingIdx] = updatedPr;
        } else {
          targetEntry.providersResults.push(updatedPr);
        }
      }
      mergedInputsCount++;
    } else {
      // Entry not in target
      if (includeUnmatched) {
        // Move to target as new entry
        const newTargetResults: ProviderResult[] = srcEntry.providersResults.map((pr) => ({
          ...pr,
          provider: sourceToTargetProviderId[pr.provider] || pr.provider,
          model: sourceModels[pr.provider] || pr.model,
        }));

        target.results.push({
          input: srcEntry.input,
          expectedResult: srcEntry.expectedResult,
          providersResults: newTargetResults,
        });
        mergedInputsCount++;
      } else {
        // Keep in source
        remainingSourceEntries.push(srcEntry);
      }
    }
  }

  // Recalculate summary for target
  target.summary = calculateJobSummary(
    target.results,
    target.providers,
    target.summary?.elapsedMs ?? 0
  );
  if (target.summary && target.providerModels) {
    for (const [p, m] of Object.entries(target.providerModels)) {
      if (target.summary.providers[p]) {
        target.summary.providers[p].model = m;
      }
    }
  }

  // Determine if all data was moved from older file
  const isOldFileDeleted = remainingSourceEntries.length === 0;
  let updatedOldFile: JobResultFile | null = null;

  if (!isOldFileDeleted) {
    source.results = remainingSourceEntries;
    source.summary = calculateJobSummary(
      source.results,
      source.providers,
      source.summary?.elapsedMs ?? 0
    );
    if (source.summary && source.providerModels) {
      for (const [p, m] of Object.entries(source.providerModels)) {
        if (source.summary.providers[p]) {
          source.summary.providers[p].model = m;
        }
      }
    }
    updatedOldFile = source;
  }

  return {
    updatedNewFile: target,
    updatedOldFile,
    isOldFileDeleted,
    movedProviders,
    mergedInputsCount,
    unmatchedInputsRetained: remainingSourceEntries.length,
  };
}

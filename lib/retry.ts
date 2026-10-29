import { GeocodingResultEntry, JobResultFile, JobSummary, ProviderResult } from "./types";
import { calculateJobSummary } from "./geo";

export interface RetryTask {
  entryIndex: number;
  entry: GeocodingResultEntry;
  failedProviders: string[];
}

/**
 * Checks whether a provider result is considered failed.
 * A result is failed if:
 * - The provider result entry is undefined or null
 * - It contains an error message (pr.error)
 * - Its coordinates result is nullish (pr.result === null || pr.result === undefined)
 * - It was flagged as an outlier (pr.isOutlier === true)
 */
export function isProviderResultFailed(pr?: ProviderResult | null): boolean {
  if (!pr) return true;
  if (pr.error) return true;
  if (pr.result === null || pr.result === undefined) return true;
  if (pr.isOutlier) return true;
  return false;
}

/**
 * Counts how many failed results exist for each provider in a result set,
 * strictly filtering for entries where expectedResult is NOT null.
 *
 * Entries with expectedResult === null are intentionally excluded because
 * expected null represents negative test cases (rejecting invalid input).
 */
export function countFailedResultsByProvider(
  results: GeocodingResultEntry[],
  providers: string[],
  fileProviders?: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const prov of providers) {
    counts[prov] = 0;
  }

  for (const entry of results) {
    // Only entries where expectedResult is not null can be retried
    if (entry.expectedResult === null) continue;

    for (const prov of providers) {
      if (fileProviders && !fileProviders.includes(prov)) {
        continue;
      }
      const pr = entry.providersResults.find((p) => p.provider === prov);
      if (isProviderResultFailed(pr)) {
        // If pr is missing and prov was not in fileProviders, don't count
        if (!pr && fileProviders && !fileProviders.includes(prov)) {
          continue;
        }
        counts[prov] = (counts[prov] || 0) + 1;
      }
    }
  }

  return counts;
}

/**
 * Filters the list of result entries to only those that have failed results
 * for the selected providers, strictly requiring expectedResult !== null.
 * Optionally constrained by fileProviders to only consider providers that were in the run.
 */
export function filterRetryTasks(
  results: GeocodingResultEntry[],
  selectedProviders: string[],
  fileProviders?: string[]
): RetryTask[] {
  const activeProviders = fileProviders
    ? selectedProviders.filter((p) => fileProviders.includes(p))
    : selectedProviders;

  const tasks: RetryTask[] = [];

  for (let i = 0; i < results.length; i++) {
    const entry = results[i];
    // Rule: only if expectedResult is not null
    if (entry.expectedResult === null) continue;

    const failedProviders: string[] = [];
    for (const prov of activeProviders) {
      const pr = entry.providersResults.find((p) => p.provider === prov);
      if (isProviderResultFailed(pr)) {
        if (!pr && fileProviders && !fileProviders.includes(prov)) {
          continue;
        }
        failedProviders.push(prov);
      }
    }

    if (failedProviders.length > 0) {
      tasks.push({
        entryIndex: i,
        entry,
        failedProviders,
      });
    }
  }

  return tasks;
}

/**
 * Applies a retry result to an entry.
 *
 * Requirements:
 * 1. Only updates if expectedResult is not null AND result is not nullish.
 * 2. Each retry must only update its own data (replaces only this provider's entry,
 *    leaving all other providers in the entry untouched).
 *
 * Returns true if the entry was updated, false otherwise.
 */
export function applyRetryResult(
  entry: GeocodingResultEntry,
  retryResult: ProviderResult
): boolean {
  // Condition: expectedResult is not null and result is not nullish
  if (entry.expectedResult === null) return false;
  if (retryResult.result === null || retryResult.result === undefined) return false;

  const idx = entry.providersResults.findIndex((p) => p.provider === retryResult.provider);
  if (idx >= 0) {
    // Update only its own data
    entry.providersResults[idx] = retryResult;
  } else {
    entry.providersResults.push(retryResult);
  }
  return true;
}

/**
 * Recalculates summary values for a JobResultFile after retries.
 * Recomputes all metrics using calculateJobSummary and preserves/updates models.
 */
export function recalculateJobFileSummary(
  file: JobResultFile,
  additionalElapsedMs: number = 0,
  updatedModels?: Record<string, string>
): JobSummary {
  const previousElapsed = file.summary?.elapsedMs ?? 0;
  const totalElapsed = previousElapsed + additionalElapsedMs;

  const summary = calculateJobSummary(file.results, file.providers, totalElapsed);

  // Preserve or update provider models in the summary
  const effectiveModels: Record<string, string> = {
    ...(file.providerModels || {}),
    ...(updatedModels || {}),
  };

  Object.entries(effectiveModels).forEach(([pid, model]) => {
    if (summary.providers[pid]) {
      summary.providers[pid].model = model;
    }
  });

  return summary;
}

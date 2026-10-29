import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { checkMergeCompatibility, mergeResultFiles } from "@/lib/merge";
import { JobResultFile } from "@/lib/types";

const RESULTS_DIR = path.join(process.cwd(), "data", "results");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileA, fileB, includeUnmatchedFromOld } = body;

    if (!fileA || !fileB) {
      return NextResponse.json(
        { error: "Both fileA and fileB are required" },
        { status: 400 }
      );
    }

    if (fileA === fileB) {
      return NextResponse.json(
        { error: "Cannot merge a result file with itself" },
        { status: 400 }
      );
    }

    // Verify both files exist
    const pathA = path.join(RESULTS_DIR, fileA);
    const pathB = path.join(RESULTS_DIR, fileB);

    let contentA: string;
    let contentB: string;

    try {
      contentA = await fs.readFile(pathA, "utf-8");
    } catch {
      return NextResponse.json(
        { error: `File not found: ${fileA}` },
        { status: 404 }
      );
    }

    try {
      contentB = await fs.readFile(pathB, "utf-8");
    } catch {
      return NextResponse.json(
        { error: `File not found: ${fileB}` },
        { status: 404 }
      );
    }

    const dataA: JobResultFile = JSON.parse(contentA);
    const dataB: JobResultFile = JSON.parse(contentB);

    // Rule 1: Check compatibility
    const compatibility = checkMergeCompatibility(dataA, dataB);
    if (!compatibility.canMerge) {
      return NextResponse.json(
        {
          error: compatibility.reason || "Files cannot be merged",
          conflictingProviders: compatibility.conflictingProviders,
        },
        { status: 400 }
      );
    }

    // Rule 2 & 3: Merge from older to newer
    const { olderFile, newerFile } = compatibility;
    const mergeResult = mergeResultFiles(olderFile, newerFile, {
      includeUnmatchedFromOld: !!includeUnmatchedFromOld,
    });

    // Save updated newer file
    const newFilePath = path.join(RESULTS_DIR, mergeResult.updatedNewFile.filename);
    await fs.writeFile(
      newFilePath,
      JSON.stringify(mergeResult.updatedNewFile, null, 2),
      "utf-8"
    );

    // If all data was moved from older file -> delete it (Rule 3)
    const oldFilePath = path.join(RESULTS_DIR, olderFile.filename);
    if (mergeResult.isOldFileDeleted) {
      try {
        await fs.unlink(oldFilePath);
      } catch (err) {
        console.warn(`Could not remove source file ${olderFile.filename}:`, err);
      }
    } else if (mergeResult.updatedOldFile) {
      // Save retained older file with remaining entries and recalculated summary
      await fs.writeFile(
        oldFilePath,
        JSON.stringify(mergeResult.updatedOldFile, null, 2),
        "utf-8"
      );
    }

    return NextResponse.json({
      success: true,
      targetFile: mergeResult.updatedNewFile.filename,
      sourceFile: olderFile.filename,
      isOldFileDeleted: mergeResult.isOldFileDeleted,
      movedProviders: mergeResult.movedProviders,
      mergedInputsCount: mergeResult.mergedInputsCount,
      unmatchedInputsRetained: mergeResult.unmatchedInputsRetained,
      summary: mergeResult.updatedNewFile.summary,
    });
  } catch (error) {
    console.error("Error merging result files:", error);
    const msg = error instanceof Error ? error.message : "Failed to merge result files";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

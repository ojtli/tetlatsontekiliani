import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export interface ResultFileInfo {
  filename: string;
  startedAt?: string;
  completedAt?: string;
  providers: string[];
  totalResults: number;
  sizeBytes: number;
}

const RESULTS_DIR = path.join(process.cwd(), "data", "results");

export async function GET() {
  try {
    // Ensure data/results exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });

    const entries = await fs.readdir(RESULTS_DIR);
    const jsonFiles = entries.filter((f) => f.endsWith(".json"));

    const files: ResultFileInfo[] = [];

    for (const file of jsonFiles) {
      try {
        const fullPath = path.join(RESULTS_DIR, file);
        const [stat, content] = await Promise.all([
          fs.stat(fullPath),
          fs.readFile(fullPath, "utf-8"),
        ]);

        const data = JSON.parse(content);
        files.push({
          filename: file,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          providers: data.providers || [],
          totalResults: Array.isArray(data.results) ? data.results.length : 0,
          sizeBytes: stat.size,
        });
      } catch (err) {
        console.warn(`Failed to parse result file ${file}:`, err);
      }
    }

    // Sort newest first (descending by completedAt or filename)
    files.sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return b.filename.localeCompare(a.filename);
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error("Error listing result files:", error);
    return NextResponse.json(
      { error: "Failed to list result files" },
      { status: 500 }
    );
  }
}

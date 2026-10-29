import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const RESULTS_DIR = path.join(process.cwd(), "data", "results");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);

    // Security check: prevent directory traversal
    const safeFilename = path.basename(decoded);
    if (!safeFilename.endsWith(".json")) {
      return NextResponse.json(
        { error: "Invalid result filename" },
        { status: 400 }
      );
    }

    const filePath = path.join(RESULTS_DIR, safeFilename);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: `Result file "${safeFilename}" not found` },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Error fetching result file:", error);
    return NextResponse.json(
      { error: "Failed to fetch result file" },
      { status: 500 }
    );
  }
}

import { Suspense } from "react";
import RunJobPanel from "../components/RunJobPanel";

export const metadata = {
  title: "Run Job — Tetlatsontekiliani",
  description: "Configure providers and execute geocoding benchmark batch jobs.",
};

export default function RunJobPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading runner…</div>}>
      <RunJobPanel />
    </Suspense>
  );
}

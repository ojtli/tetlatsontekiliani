import TestProviderCard from "../components/TestProviderCard";

export const metadata = {
  title: "Lab — Tetlatsontekiliani",
  description: "Interactive geocoding provider tester with live coordinate inspection and model selection.",
};

export default function LabPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <TestProviderCard />
    </div>
  );
}

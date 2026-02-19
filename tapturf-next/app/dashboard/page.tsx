import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-16 text-center"><p className="text-sm text-gray-500">Loading...</p></div>}>
      <DashboardClient />
    </Suspense>
  );
}

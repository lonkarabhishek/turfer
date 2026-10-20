import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Live score not found", robots: { index: false, follow: true } };

export default function LiveNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-primary-900 mb-2">Live score not found</h1>
      <p className="text-primary-600 mb-6">This live link is not right. Check that you have the whole link, or ask the scorer to send it again.</p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Link href="/tools/cricket-live-scorer" className="press-tight inline-flex items-center justify-center h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-semibold hover:bg-accent-600 transition-colors">
          Score your own match, free
        </Link>
        <Link href="/sport/box-cricket" className="press-tight inline-flex items-center justify-center h-12 px-6 rounded-full border-2 border-primary-200 text-[15px] font-semibold text-primary-800 hover:border-primary-400 transition-colors">
          Find a box cricket turf
        </Link>
      </div>
    </div>
  );
}

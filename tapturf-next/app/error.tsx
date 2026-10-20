"use client";

import Link from "next/link";

// Shown when a page fails to render, for example when the database is
// down and the page has no cached copy yet (20 Oct). Pages that do have
// one keep serving it; this only replaces a bare 500 for the rest.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-24 text-center">
      <p className="text-6xl mb-4">🏟️</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">This page is taking a break</h1>
      <p className="text-gray-600 mb-6">We could not load it just now. Please try again in a minute.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Try again
        </button>
        <Link
          href="/turfs"
          className="inline-flex items-center justify-center border border-gray-300 hover:bg-gray-50 text-gray-900 font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Browse Turfs
        </Link>
      </div>
    </div>
  );
}

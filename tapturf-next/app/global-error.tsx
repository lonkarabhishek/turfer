"use client";

// Last resort when the root layout itself fails (it reads the live city
// list for the footer), so a visitor never gets a bare 500. It replaces
// the whole layout, so it carries its own markup and inline styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#fff", color: "#1D1D1F" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "96px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 32px" }}>
            Tap<span style={{ color: "#16A34A" }}>Turf</span>
          </p>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>This page is taking a break</h1>
          <p style={{ color: "#6E6E73", margin: "0 0 24px" }}>We could not load it just now. Please try again in a minute.</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#111113", color: "#fff", border: 0, borderRadius: 12, padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
          <p style={{ marginTop: 16 }}>
            {/* A plain link: the app's router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/turfs" style={{ color: "#16A34A", fontWeight: 600 }}>
              Browse Turfs
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}

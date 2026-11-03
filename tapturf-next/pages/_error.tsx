import Head from "next/head";
import type { NextPageContext } from "next";
import { isUnavailable, UNAVAILABLE_HEADERS, UNAVAILABLE_HTML } from "@/lib/cache/unavailable";

// Next renders this when a page fails, before (and, on a status other than
// 500, instead of) the static 500 page (pages/500.tsx), with the error.
//
// A read the page needed failed with no copy young enough to stand in
// (Unavailable, lib/cache/unavailable.ts): the answer is 503 with
// Retry-After, no-store and noindex, written here and ended, so neither
// Vercel's CDN nor ISR keeps it and a crawler comes back. That is a first
// render: a regeneration that fails keeps the last good page and never
// gets here. It is written at once because on Vercel (Next's minimal mode)
// Next renders this first and then sends the static 500 page in its place;
// a response already sent is left as it is.
//
// Anything else keeps Next's own status (500 for a failed page, then the
// static 500 page), as before. Plain, noindex, a plain link home, like
// pages/500.tsx. app/not-found.tsx stays the 404.

type Props = { statusCode: number };

function ErrorPage({ statusCode }: Props) {
  return (
    <>
      <Head>
        <title>Something went wrong | TapTurf</title>
        <meta name="robots" content="noindex, follow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main
        style={{
          padding: "96px 16px",
          background: "#fff",
          color: "#1D1D1F",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 32px" }}>
            Tap<span style={{ color: "#16A34A" }}>Turf</span>
          </p>
          <h1 style={{ fontSize: 24, lineHeight: 1.3, margin: "0 0 8px" }}>This page is taking a break</h1>
          <p style={{ color: "#6E6E73", margin: "0 0 24px", lineHeight: 1.5 }}>
            We could not load it just now (error {statusCode}). Please try again in a minute.
          </p>
          {/* A plain link: the app's router may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{ display: "inline-block", background: "#111113", color: "#fff", borderRadius: 12, padding: "12px 24px", fontSize: 16, fontWeight: 600, textDecoration: "none" }}
          >
            Go to TapTurf home
          </a>
        </div>
      </main>
    </>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): Props => {
  if (res && isUnavailable(err)) {
    if (!res.headersSent) {
      res.statusCode = 503;
      for (const [name, value] of Object.entries(UNAVAILABLE_HEADERS)) res.setHeader(name, value);
      res.end(UNAVAILABLE_HTML);
    }
    return { statusCode: 503 };
  }
  return { statusCode: res?.statusCode ?? err?.statusCode ?? 500 };
};

export default ErrorPage;

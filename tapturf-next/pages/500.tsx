import Head from "next/head";
import type { GetStaticProps } from "next";

// The page a visitor gets when a page fails to render and Next falls
// back to its 500 page. Every other route is the app router's (app/);
// pages/_error.tsx is the only other page here (it answers 503 when the
// failure is a read with no copy to serve), and app/not-found.tsx stays
// the 404.
//
// Until 3 Nov there was no such page: Next 16 copied its built-in
// "500: Internal Server Error." (app/_global-error) to pages/500.html and
// pointed the pages manifest at that file, which Vercel serves from its
// CDN and leaves out of the functions. A function that rendered the error
// itself then found no file ("Failed to load static file for page: /500
// ENOENT pages/500.html", 772 times in the week to 2 Nov) and sent nothing,
// leaving the answer to the platform. With getStaticProps the build still
// writes pages/500.html (the CDN's copy), and the manifest names this
// module, so a function renders the page from code and never needs the file.
// Vercel leaves this module out of the app router's functions too ("Cannot
// find module .../pages/500.js", 4 Nov): `npm run build` adds it and the
// files it loads to every app route's trace (lib/build/errorPages.ts).
//
// Plain on purpose: no layout, data or app code that could be what
// failed; inline styles (the app's CSS is the root layout's); a plain
// link home. Status 500 (Next sets it for /500) and noindex.
//
// With a pages/ folder, Next types usePathname, useSearchParams and
// useParams as possibly null (next/navigation-types/compat, referenced
// from next-env.d.ts): the app's client code reads them null-safe.
export const getStaticProps: GetStaticProps = async () => ({ props: {} });

const GREEN = "#16A34A";

export default function ServerErrorPage() {
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
            Tap<span style={{ color: GREEN }}>Turf</span>
          </p>
          <h1 style={{ fontSize: 24, lineHeight: 1.3, margin: "0 0 8px" }}>This page is taking a break</h1>
          <p style={{ color: "#6E6E73", margin: "0 0 24px", lineHeight: 1.5 }}>
            We could not load it just now. Please try again in a minute.
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

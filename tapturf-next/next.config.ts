import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build renders about 3,500 pages against Supabase, whose public
  // role cancels statements after 3 s. Eight pages at once per worker
  // made the full turf-list reads time out under load and failed three
  // builds on 19 Oct; four at once, with a page retried before the
  // build gives up, rides that out. One retry, not two: each retry
  // re-ran a failed page's reads against a database that was already
  // struggling (fetchAllRows also retries a page once while building).
  // The value is attempts, not retries (next/dist/export/worker.js runs
  // `while (attempt < maxAttempts)`): 2 is one try plus one retry.
  experimental: {
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 2,
  },
  // Old marketing URLs that never had a matching route were served as
  // soft-404s (HTTP 200 with a "City not found" body) via the [city]
  // catch-all. 301 them to the canonical city URL so we keep whatever
  // link equity they carry and Google stops recording soft-404s.
  async redirects() {
    return [
      { source: "/turf-in-nashik", destination: "/nashik", permanent: true },
      { source: "/turf-in-pune",   destination: "/pune",   permanent: true },
      { source: "/turf-in-mumbai", destination: "/mumbai", permanent: true },
      { source: "/turf-in-nagpur", destination: "/nagpur", permanent: true },
      { source: "/turf-in-hyderabad", destination: "/hyderabad", permanent: true },
      // Common spellings of the "turf near me" page.
      { source: "/turfs-near-me", destination: "/turf-near-me", permanent: true },
      { source: "/near-me",       destination: "/turf-near-me", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/thumbnail/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "hwfsbpzercuoshodmnuf.supabase.co",
        pathname: "/storage/**",
      },
      {
        protocol: "https",
        hostname: "kridabhumi.com",
        pathname: "/**",
      },
      // Some turf covers are hosted on Yappe (open India business directory).
      // Not decorative — they're real venue photos, e.g. Turf 10 Wakad.
      {
        protocol: "https",
        hostname: "files.yappe.in",
        pathname: "/place/**",
      },
    ],
  },
};

export default nextConfig;

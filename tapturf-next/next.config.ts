import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old marketing URLs that never had a matching route were served as
  // soft-404s (HTTP 200 with a "City not found" body) via the [city]
  // catch-all. 301 them to the canonical city URL so we keep whatever
  // link equity they carry and Google stops recording soft-404s.
  async redirects() {
    return [
      { source: "/turf-in-nashik", destination: "/nashik", permanent: true },
      { source: "/turf-in-pune",   destination: "/pune",   permanent: true },
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
    ],
  },
};

export default nextConfig;

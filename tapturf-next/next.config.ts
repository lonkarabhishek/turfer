import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

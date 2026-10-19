import type { Metadata } from "next";

// myTapturf, the owner side. Private pages: never indexed.
export const metadata: Metadata = {
  title: "myTapturf for turf owners",
  description: "See how many players view and call your turf on TapTurf, and keep your prices, hours and facilities up to date.",
  robots: { index: false, follow: false },
};

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

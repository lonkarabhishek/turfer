import type { Metadata, Viewport } from "next";
import { Inter, Bebas_Neue, Space_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AuthWrapper } from "@/components/auth/AuthWrapper";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Bebas Neue = condensed sport-broadcast headline face
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Space Mono = scoreboard/tabular numerals
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TapTurf - Find & Book Turf in Nashik",
    template: "%s | TapTurf",
  },
  description:
    "Find and book sports turfs in Nashik. Compare prices, check ratings, and book instantly.",
  metadataBase: new URL("https://www.tapturf.in"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TapTurf",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

/**
 * viewportFit: "cover" is the only reliable way to make iOS Safari
 * populate env(safe-area-inset-*) in standalone / Add-to-Home-Screen
 * mode. Without it the bottom nav stretches under the home indicator.
 */
export const viewport: Viewport = {
  themeColor: "#16A34A",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bebas.variable} ${spaceMono.variable} antialiased`}>
        <AuthWrapper>
          <Header />
          {/* pb accounts for MobileNav (h-14 = 56px) + iOS home indicator */}
          <main
            className="min-h-screen md:pb-0"
            style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
          >
            {children}
          </main>
          <div className="hidden md:block">
            <Footer />
          </div>
        </AuthWrapper>
      </body>
    </html>
  );
}

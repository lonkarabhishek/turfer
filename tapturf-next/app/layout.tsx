import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { CITY_LIST_AND, CITY_LIST_SHORT } from "@/lib/city";
import { Footer } from "@/components/layout/Footer";
import { AskProvider } from "@/components/ask/AskProvider";
import { AskLauncher } from "@/components/ask/AskLauncher";
import { AskPanel } from "@/components/ask/AskPanel";
import { AppMain } from "@/components/layout/AppMain";
import { AuthWrapper } from "@/components/auth/AuthWrapper";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PWALifecycle } from "@/components/pwa/PWALifecycle";
import { RouteProgress } from "@/components/nav/RouteProgress";
import { CityPrePaint } from "@/components/city/CityPrePaint";
import { CitySync } from "@/components/city/CitySync";
import { CityPicker } from "@/components/city/CityPicker";
import "./globals.css";
import { VisitTracker } from "@/components/analytics/VisitTracker";
import { CookieBanner } from "@/components/consent/CookieBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `TapTurf: Find & Book Turfs in ${CITY_LIST_SHORT}`,
    template: "%s | TapTurf",
  },
  description:
    `Find and book football, box cricket and sports turfs in ${CITY_LIST_AND}. Compare prices, check ratings, call or WhatsApp to book.`,
  metadataBase: new URL("https://www.tapturf.in"),
  // Default share image for pages that don't set their own.
  openGraph: {
    siteName: "TapTurf",
    locale: "en_IN",
    type: "website",
    images: [{ url: "/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
  },
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
  // Keyboard shrinks the layout viewport, so 100dvh sheets (Ask chat)
  // keep their composer above the keys instead of being pushed around.
  // Android Chrome only: iOS Safari and in-app browsers (WhatsApp,
  // Instagram) ignore it and lay the keys over the page, so every sheet
  // with a field sits in components/ui/ViewportOverlay, which follows
  // window.visualViewport there.
  interactiveWidget: "resizes-content",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: CityPrePaint sets data-city-* on <html>
    // before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* First: mirrors the tt_city cookie onto <html> before any paint. */}
        <CityPrePaint />
        {/* Turf cover images are served from Google Drive → googleusercontent
            after a redirect. Warming the DNS + TLS handshake to both hosts
            trims a few hundred ms off the LCP image on cold visits. */}
        <link rel="preconnect" href="https://drive.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://drive.google.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {/* First in the page so the keyboard reaches it first; it shows itself only
            after hydration, when no cookie choice is stored (lib/consent.ts). */}
        <CookieBanner />
        {/* Google Analytics and the visit note wait for Accept on that banner. */}
        <GoogleAnalytics />
        <VisitTracker />
        <PWALifecycle />
        <RouteProgress />
        <AuthWrapper>
          <AskProvider>
            <CitySync />
            <Header />
            {/* pb accounts for MobileNav (h-14 = 56px) + iOS home indicator */}
            <AppMain>{children}</AppMain>
            <div className="hidden md:block">
              <Footer />
            </div>
            <AskLauncher />
            <AskPanel />
            <CityPicker />
          </AskProvider>
        </AuthWrapper>
      </body>
    </html>
  );
}

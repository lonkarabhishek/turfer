import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AuthWrapper } from "@/components/auth/AuthWrapper";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthWrapper>
          <Header />
          <main className="min-h-screen pb-16 md:pb-0">{children}</main>
          <div className="hidden md:block">
            <Footer />
          </div>
        </AuthWrapper>
      </body>
    </html>
  );
}

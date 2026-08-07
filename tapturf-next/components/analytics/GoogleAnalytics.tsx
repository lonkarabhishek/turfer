"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const GA_ID = "G-KRDVP16TSM";

/**
 * Google Analytics 4 (gtag.js) wiring for the Next.js App Router.
 *
 * Two pieces:
 *  1. <Script> tags that load gtag.js once, afterInteractive so they
 *     don't block first paint. This handles the initial page view.
 *  2. A tiny effect that re-fires config on every client-side route
 *     change — App Router does client-side navigation without a full
 *     reload, so GA would otherwise only see the first URL.
 *
 * Split into a Suspense boundary because useSearchParams() must be
 * wrapped in Suspense at the layout level.
 */
export function GoogleAnalytics() {
  // Only load in production so localhost dev traffic doesn't pollute GA.
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: true });
        `}
      </Script>
      <Suspense fallback={null}>
        <RouteTracker />
      </Suspense>
    </>
  );
}

function RouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag !== "function") return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    // Fire a page_view for every SPA navigation.
    w.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

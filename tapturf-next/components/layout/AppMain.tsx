"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * <main> wrapper that reserves space at the bottom for MobileNav on
 * every page EXCEPT the landing route ("/"), where the bottom nav
 * is hidden and no padding is needed.
 */
export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <main
      className="min-h-screen md:pb-0"
      style={
        isLanding
          ? undefined
          : { paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }
      }
    >
      {children}
    </main>
  );
}

"use client";

import type { ReactNode } from "react";

/**
 * <main> wrapper that reserves space at the bottom for MobileNav
 * (h-14 = 56px plus the iOS home indicator) on every route. Desktop
 * has no bottom nav, so md:pb-0 removes it there.
 */
export function AppMain({ children }: { children: ReactNode }) {
  return (
    <main
      className="min-h-screen md:pb-0"
      style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      {children}
    </main>
  );
}

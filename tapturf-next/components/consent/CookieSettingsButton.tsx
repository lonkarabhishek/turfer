"use client";

import type { ReactNode } from "react";
import { openCookieSettings } from "@/lib/consent";

/** "Cookie settings": opens the cookie banner again to change the choice (lib/consent.ts). */
export function CookieSettingsButton({ className, children = "Cookie settings" }: { className?: string; children?: ReactNode }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {children}
    </button>
  );
}

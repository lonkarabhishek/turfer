"use client";

import { BadgeCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useHydrated, useVerified } from "./useVerified";

/** What the tick says, to a screen reader and as a tooltip. */
export const TICK_LABEL = "Phone and email verified";

/**
 * The verified tick next to a name: a solid blue badge with a white
 * check, so it never reads as the outline "Managed by the owner" badge
 * on turfs. It says only that this person confirmed both a phone number
 * and an email, never either one, or which one is missing.
 */
export function VerifiedTick({ size = "sm", className = "" }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <span role="img" aria-label={TICK_LABEL} title={TICK_LABEL} className={`inline-flex shrink-0 items-center ${className}`}>
      <BadgeCheck className={`${size === "lg" ? "w-6 h-6" : "w-4 h-4"} fill-sky-600 text-white`} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

/**
 * The tick for an account id, when it has one. The signed-in person's
 * own tick comes from their profile (fresh after a link or a number
 * change); anyone else's from the public read (useVerified).
 */
export function VerifiedTickFor({ id, size, className }: { id: string | null | undefined; size?: "sm" | "lg"; className?: string }) {
  const { user } = useAuth();
  const hydrated = useHydrated();
  const own = hydrated && !!id && user?.id === id && typeof user.verified === "boolean" ? user.verified : null;
  const others = useVerified(own === null ? id : null);
  return (own ?? others) ? <VerifiedTick size={size} className={className} /> : null;
}

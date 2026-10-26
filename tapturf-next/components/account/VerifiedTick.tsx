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
export function VerifiedTick({
  size = "sm",
  className = "",
  decorative = false,
}: {
  size?: "sm" | "lg";
  className?: string;
  /** Inside a control whose own words say it (the admin's "Verified only"): hidden from screen readers. */
  decorative?: boolean;
}) {
  const named = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": TICK_LABEL, title: TICK_LABEL };
  return (
    <span {...named} className={`inline-flex shrink-0 items-center ${className}`}>
      <BadgeCheck className={`${size === "lg" ? "w-6 h-6" : "w-4 h-4"} fill-sky-600 text-white`} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

/** A last word longer than this may wrap inside itself, so the tick is not glued to it. */
const GLUE_MAX = 16;

/**
 * A name with the tick right after its last word, the two kept on one
 * line: a name that wraps in a narrow column never leaves the tick alone
 * on the line below (a separate flex item after the name did). Plain text
 * when there is no tick. Put it inside the name's own element.
 */
export function NameWithTick({ name, ticked }: { name: string; ticked: boolean }) {
  if (!ticked) return <>{name}</>;
  const tick = <VerifiedTick className="ml-1 align-[-0.15em]" />;
  const trimmed = name.trimEnd();
  const at = trimmed.search(/\S+$/);
  const last = at >= 0 ? trimmed.slice(at) : "";
  if (!last || last.length > GLUE_MAX) {
    return (
      <>
        {trimmed}
        {tick}
      </>
    );
  }
  return (
    <>
      {trimmed.slice(0, at)}
      <span className="whitespace-nowrap">
        {last}
        {tick}
      </span>
    </>
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

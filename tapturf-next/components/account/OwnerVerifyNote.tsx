"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { tickStepHref, tickSteps } from "@/lib/account/verified";
import { useHydrated } from "./useVerified";

/**
 * On your own public profile, without the tick: one quiet line on how to
 * get it, shown only to you (the page itself is the same for everyone).
 * Nothing when the missing step can't be done from this sign-in.
 */
export function OwnerVerifyNote({ username }: { username: string }) {
  const { user, signedInWith } = useAuth();
  const hydrated = useHydrated();
  if (!hydrated || !user || user.username !== username) return null;
  const steps = tickSteps(user, signedInWith);
  if (!steps?.action) return null;
  return (
    <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-center text-[13px] text-sky-900 leading-snug">
      {steps.action === "email"
        ? "Only you see this: add your email with Google to get the verified tick."
        : "Only you see this: add your phone number to get the verified tick."}{" "}
      <Link href={tickStepHref(steps.action)} className="font-semibold underline underline-offset-2">
        Go to your profile
      </Link>
    </p>
  );
}

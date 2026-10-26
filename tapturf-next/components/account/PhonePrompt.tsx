"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { oauthAgeS } from "@/lib/account/client";
import { spacedPhone } from "@/lib/account/display";
import { askHere, busy, claimPrompt } from "@/lib/account/prompts";
import { askAnswered, askWaits, phoneAskFresh, readAskedRecords, tickStepHref, tickSteps, type AskedRecord } from "@/lib/account/verified";
import { useInApp } from "@/lib/auth/useInApp";
import { Sheet } from "./Sheet";
import { usernameAskedBefore } from "./UsernamePrompt";

/**
 * What this device did with the phone ask, per account: done (the main
 * button), or put off (Not now, a tap outside, Escape). Put off once, it
 * comes back once, a week later; then never.
 */
const ASKED_KEY = "tapturf_phone_asked_v1";
const ASKED_KEPT = 20;
const askedHere = new Set<string>();

function readAsked(): Record<string, AskedRecord> {
  try {
    return readAskedRecords(localStorage.getItem(ASKED_KEY));
  } catch {
    return {};
  }
}

function markAsked(id: string, how: "done" | "later") {
  askedHere.add(id);
  try {
    const all = readAsked();
    all[id] = askAnswered(all[id], how, Date.now());
    const keys = Object.keys(all).slice(-ASKED_KEPT);
    localStorage.setItem(ASKED_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]]))));
  } catch {
    /* storage blocked: this tab's set still holds */
  }
}

/**
 * Asks a Google sign-in whose email is proved to add (or confirm) its
 * number, for the verified tick. Only in the first 5 minutes after the
 * Google sign-in (the number form then needs no second trip to Google),
 * after the username ask, never in the same visit as another ask, never
 * over a dialog, never inside an app's own browser. The button goes to
 * the profile's number form, which sends the OTP.
 */
export function PhonePrompt() {
  const { user, profileFresh, signedInWith, getToken, notice } = useAuth();
  const path = usePathname() ?? "";
  const router = useRouter();
  const inApp = useInApp();
  const [open, setOpen] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const eligible =
    !!user &&
    signedInWith === "google" &&
    profileFresh &&
    tickSteps(user, signedInWith)?.action === "phone" &&
    !inApp &&
    askHere(path) &&
    !notice &&
    (!!user.username || usernameAskedBefore(user.id));

  useEffect(() => {
    if (!eligible || !userId || open) return;
    let live = true;
    const t = setTimeout(async () => {
      if (askedHere.has(userId) || askWaits(readAsked()[userId], Date.now()) || busy()) return;
      const tok = await getToken();
      if (!live || !("token" in tok) || !phoneAskFresh(oauthAgeS(tok.token))) return;
      if (busy() || !claimPrompt("phone")) return;
      setOpen(userId);
    }, 3000);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [eligible, userId, open, getToken]);

  if (!(open !== null && open === userId && eligible && user)) return null;

  const later = () => {
    markAsked(open, "later");
    setOpen(null);
  };
  const go = () => {
    markAsked(open, "done");
    setOpen(null);
    // The number step as the profile's own button opens it (on /dashboard too: the tab follows the address).
    router.push(tickStepHref("phone"));
  };

  return (
    <Sheet labelledBy="phone-prompt-title" describedBy="phone-prompt-body" onClose={later}>
      <span className="w-11 h-11 rounded-full bg-sky-50 inline-flex items-center justify-center" aria-hidden>
        <BadgeCheck className="w-6 h-6 fill-sky-600 text-white" strokeWidth={2.25} />
      </span>
      <h2 id="phone-prompt-title" className="mt-3 font-display text-2xl text-primary-900 leading-tight">
        Get the verified tick
      </h2>
      <p id="phone-prompt-body" className="mt-2 text-[14px] text-primary-600 leading-snug">
        {user.phone ? `Confirm ${spacedPhone(user.phone)} with an OTP.` : "Add your phone number with an OTP."} Players then see a {"✓"} next to your
        name, and the number logs you in too. Only you see it.
      </p>
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={later} className="flex-1 h-12 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer">
          Not now
        </button>
        <button type="button" onClick={go} className="flex-[1.4] h-12 rounded-full bg-primary-900 text-white font-bold text-[15px] cursor-pointer">
          {user.phone ? "Confirm number" : "Add number"}
        </button>
      </div>
      <p className="mt-4 text-[12px] text-primary-500 text-center">Change or remove it any time in your profile.</p>
    </Sheet>
  );
}

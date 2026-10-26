"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { patchMe, profileOf } from "@/lib/account/client";
import { FOCUSABLE, askHere, busy, claimPrompt } from "@/lib/account/prompts";
import { useInApp } from "@/lib/auth/useInApp";
import { GoogleMark, useGoogleLink } from "./GoogleLinkActions";
import { usernameAskedBefore } from "./UsernamePrompt";

/**
 * What this device did with the ask, per account: "done" (Continue with
 * Google or No thanks: never again here, whatever the server says), or a
 * time when it was put off (a tap outside, Escape). Put off once, it
 * comes back once, a week later. v3: the ask is now to add Google; the
 * old typed-email answers (v2) don't count for it.
 */
const ASKED_KEY = "tapturf_email_asked_v3";
const ASKED_KEPT = 20;
const LATER_MS = 7 * 86_400_000;
const askedHere = new Set<string>();
type Asked = Record<string, "done" | { later: number; times: number }>;

function readAsked(): Asked {
  try {
    const v = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Asked) : {};
  } catch {
    return {};
  }
}

function askedBefore(id: string, now: number): boolean {
  if (askedHere.has(id)) return true;
  const a = readAsked()[id];
  if (!a) return false;
  if (a === "done") return true;
  return a.times >= 2 || now - a.later < LATER_MS;
}

function markAsked(id: string, how: "done" | "later") {
  askedHere.add(id);
  try {
    const all = readAsked();
    const prev = all[id];
    all[id] = how === "done" ? "done" : { later: Date.now(), times: (prev && prev !== "done" ? prev.times : 0) + 1 };
    const keys = Object.keys(all).slice(-ASKED_KEPT);
    localStorage.setItem(ASKED_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]]))));
  } catch {
    /* storage blocked: the server's answer stops it anyway */
  }
}

/**
 * Asks a phone account with no email, once, to add its Google account:
 * then Google or the phone number both open it. Only after the server
 * said they have not answered (ask_google, profileFresh), after the
 * username ask, never in the same visit as another ask, never over a
 * dialog and never inside an app's own browser (Google sign-in fails
 * there). No thanks ends it on every device; so does any try to add
 * Google (the server stops asking once one started). The profile keeps
 * the button.
 */
export function EmailPrompt() {
  const { user, profileFresh, signedInWith, applyProfile, getToken, notice } = useAuth();
  const path = usePathname() ?? "";
  const inApp = useInApp();
  const link = useGoogleLink();
  const [open, setOpen] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const userId = user?.id ?? null;
  const eligible =
    !!user &&
    signedInWith === "phone" &&
    profileFresh &&
    user.askGoogle === true &&
    user.googleLinkable === true &&
    !user.googleEmail &&
    !user.email &&
    !inApp &&
    askHere(path) &&
    !notice &&
    (!!user.username || usernameAskedBefore(user.id));

  useEffect(() => {
    if (!eligible || !userId || open) return;
    const t = setTimeout(() => {
      if (askedBefore(userId, Date.now()) || busy() || !claimPrompt("email")) return;
      lastFocus.current = document.activeElement as HTMLElement | null;
      setOpen(userId);
    }, 3000);
    return () => clearTimeout(t);
  }, [eligible, userId, open]);

  const shown = open !== null && open === userId && eligible;

  useEffect(() => {
    if (shown) titleRef.current?.focus();
  }, [shown]);

  const close = () => {
    setOpen(null);
    lastFocus.current?.focus?.();
  };

  // A tap outside or Escape: later, on this device only (one more ask, a week on).
  const later = () => {
    if (userId) markAsked(userId, "later");
    close();
  };

  // No thanks: answered, on every device.
  const noThanks = () => {
    if (userId) markAsked(userId, "done");
    close();
    void (async () => {
      const tok = await getToken();
      if (!("token" in tok)) return;
      const p = profileOf(await patchMe(tok.token, { skipEmail: true }));
      if (p) applyProfile(p);
    })();
  };

  // Continue with Google: off to Google (or first a code to their number); back on this page after.
  const continueWithGoogle = () => {
    if (userId) markAsked(userId, "done");
    close();
    void link.start(window.location.pathname + window.location.search);
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return later();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === firstEl || !inside)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The code sheet (and a refusal) outlive the ask itself.
  const after = (
    <>
      {link.sheet}
      {link.error && !link.sheet && (
        <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[66] mx-auto max-w-md rounded-2xl bg-primary-900 px-4 py-3 text-[14px] text-white shadow-elevated flex items-start gap-3" role="alert">
          <p className="flex-1 leading-snug">{link.error}</p>
          <button type="button" onClick={link.clearError} className="shrink-0 h-8 px-3 rounded-full bg-white/15 text-[13px] font-semibold cursor-pointer">
            OK
          </button>
        </div>
      )}
      {link.busy && !link.sheet && (
        <div className="fixed inset-0 z-[66] flex items-center justify-center bg-white/70" aria-live="polite">
          <p className="inline-flex items-center gap-2 font-semibold text-primary-800">
            <Loader2 className="w-5 h-5 animate-spin" /> Opening Google…
          </p>
        </div>
      )}
    </>
  );

  if (!shown) return after;

  return (
    <>
      <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-primary-900/40" onClick={later} aria-hidden />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-prompt-title"
          aria-describedby="email-prompt-body"
          className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <span className="w-11 h-11 rounded-full bg-primary-50 inline-flex items-center justify-center" aria-hidden>
            <GoogleMark />
          </span>
          <h2 id="email-prompt-title" ref={titleRef} tabIndex={-1} style={{ outline: "none" }} className="mt-3 font-display text-2xl text-primary-900 leading-tight">
            Add your email with Google?
          </h2>
          <p id="email-prompt-body" className="mt-2 text-[14px] text-primary-600 leading-snug">
            Then you can log in with Google or this phone number. Both open this same account. No spam, and we never show your email to other players or turfs.
          </p>

          <div className="mt-5 flex gap-3">
            <button type="button" onClick={noThanks} className="flex-1 h-12 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer">
              No thanks
            </button>
            <button type="button" onClick={continueWithGoogle} className="flex-[1.4] h-12 rounded-full bg-primary-900 text-white font-bold text-[15px] cursor-pointer">
              Continue with Google
            </button>
          </div>

          <p className="mt-4 text-[12px] text-primary-500 text-center">
            Add or remove it any time in your profile.{" "}
            <Link href="/privacy#email" className="underline underline-offset-2" onClick={() => userId && markAsked(userId, "later")}>
              Privacy
            </Link>
          </p>
        </div>
      </div>
      {after}
    </>
  );
}

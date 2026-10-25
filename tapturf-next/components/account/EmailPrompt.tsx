"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, patchMe, profileOf } from "@/lib/account/client";
import { cleanEmail, emailProblem, emailTypo } from "@/lib/account/emails";
import { FOCUSABLE, askHere, busy, claimPrompt } from "@/lib/account/prompts";
import { usernameAskedBefore } from "./UsernamePrompt";

/** User ids this device has asked, so a failed No thanks never asks again here. */
const ASKED_KEY = "tapturf_email_asked_v1";
const ASKED_KEPT = 20;
const askedHere = new Set<string>();

function askedBefore(id: string): boolean {
  if (askedHere.has(id)) return true;
  try {
    const list = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "[]");
    return Array.isArray(list) && list.includes(id);
  } catch {
    return false;
  }
}

function markAsked(id: string) {
  askedHere.add(id);
  try {
    const list = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "[]");
    const next = (Array.isArray(list) ? list.filter((x) => x !== id) : []).concat(id).slice(-ASKED_KEPT);
    localStorage.setItem(ASKED_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the server's answer stops it anyway */
  }
}

const SAVE_ERROR: Record<string, string> = {
  email: "That email doesn't look right.",
  limit: "You've changed your email a few times today. Try again tomorrow.",
  unavailable: "Couldn't reach TapTurf. Check your connection and try again.",
};

/**
 * Asks a phone account with no email for one, once: turf deals and game
 * invites. Only after the server said they have not answered (ask_email,
 * profileFresh), after the username ask, never in the same visit as
 * another ask and never over a dialog. Save or No thanks ends it on every
 * device; the profile keeps the field.
 */
export function EmailPrompt() {
  const { user, profileFresh, getToken, applyProfile, notice } = useAuth();
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const userId = user?.id ?? null;
  const eligible =
    !!user && profileFresh && user.askEmail === true && !user.email && !user.contactEmail && askHere(path) && !notice && (!!user.username || usernameAskedBefore(user.id));

  useEffect(() => {
    if (!eligible || !userId || open) return;
    const t = setTimeout(() => {
      if (askedBefore(userId) || busy() || !claimPrompt("email")) return;
      lastFocus.current = document.activeElement as HTMLElement | null;
      setEmail("");
      setError("");
      setOpen(userId);
    }, 3000);
    return () => clearTimeout(t);
  }, [eligible, userId, open]);

  const shown = open !== null && open === userId && eligible;

  useEffect(() => {
    if (shown) inputRef.current?.focus();
  }, [shown]);

  // No thanks, the backdrop or Escape: answered, on every device.
  const noThanks = () => {
    if (userId) markAsked(userId);
    setOpen(null);
    lastFocus.current?.focus?.();
    void (async () => {
      const tok = await getToken();
      if (!("token" in tok)) return;
      const p = profileOf(await patchMe(tok.token, { skipEmail: true }));
      if (p) applyProfile(p);
    })();
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return noThanks();
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

  if (!shown) return null;

  const save = async () => {
    const problem = emailProblem(email);
    const clean = cleanEmail(email);
    if (problem || !clean) return setError(problem ?? SAVE_ERROR.email);
    setError("");
    setSaving(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) {
        if ("unknown" in tok) setError(SAVE_ERROR.unavailable);
        else noThanks();
        return;
      }
      const a = await patchMe(tok.token, { email: clean, emailSource: "prompt" });
      const p = profileOf(a);
      const e = errorOf(a);
      if (e) {
        if (p) applyProfile(p);
        setError(SAVE_ERROR[e] ?? "Couldn't save. Please try again.");
        return;
      }
      if (userId) markAsked(userId);
      setOpen(null);
      lastFocus.current?.focus?.();
      if (p) applyProfile(p);
    } finally {
      setSaving(false);
    }
  };

  const typo = !error ? emailTypo(email) : null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-primary-900/40" onClick={noThanks} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-prompt-title"
        aria-describedby="email-prompt-body"
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <span className="w-11 h-11 rounded-full bg-accent-50 text-accent-700 inline-flex items-center justify-center" aria-hidden>
          <Mail className="w-5 h-5" />
        </span>
        <h2 id="email-prompt-title" className="mt-3 font-display text-2xl text-primary-900 leading-tight">
          Want turf deals and game invites?
        </h2>
        <p id="email-prompt-body" className="mt-2 text-[14px] text-primary-600 leading-snug">
          Add your email and we&rsquo;ll send you offers from turfs and invites to games near you. No spam. Only you can see it.
        </p>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving) void save();
          }}
        >
          <label htmlFor="email-prompt-input" className="sr-only">Email</label>
          <input
            ref={inputRef}
            id="email-prompt-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            value={email}
            placeholder="you@gmail.com"
            aria-describedby="email-prompt-status"
            onChange={(e) => {
              setError("");
              setEmail(e.target.value);
            }}
            className="w-full px-4 py-3 min-h-[48px] border-2 border-primary-200 rounded-xl text-base text-primary-800 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
          />
          <p id="email-prompt-status" aria-live="polite" className="mt-1.5 text-[12px] min-h-4 text-hot-600">
            {error}
          </p>
          {typo && (
            <button type="button" onClick={() => setEmail(typo)} className="text-[12px] font-semibold text-accent-700 underline underline-offset-2">
              Did you mean {typo}?
            </button>
          )}

          <div className="mt-4 flex gap-3">
            <button type="button" onClick={noThanks} className="flex-1 h-12 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer">
              No thanks
            </button>
            <button type="submit" disabled={saving || !email.trim()} className="flex-1 h-12 rounded-full bg-primary-800 text-white font-bold text-[15px] disabled:opacity-40 cursor-pointer">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-[12px] text-primary-500 text-center">
          Change or remove it any time in your profile.{" "}
          <Link href="/privacy#email" className="underline underline-offset-2" onClick={() => userId && markAsked(userId)}>
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}

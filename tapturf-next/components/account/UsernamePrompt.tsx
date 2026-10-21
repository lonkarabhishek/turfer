"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, patchMe, profileOf, suggestUsername } from "@/lib/account/client";
import { AVAILABILITY_TEXT, useUsernameCheck, usernameSavable } from "./useUsernameCheck";
import { TagSwitch } from "./TagSwitch";

/** User ids this device has asked already, newest last. Asked once, whatever the answer. */
const ASKED_KEY = "tapturf_username_asked_v1";
const ASKED_KEPT = 20;
/** Asked in this tab, kept even when storage is blocked, so Later is never answered by a new prompt. */
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
    /* storage blocked: may ask again next visit */
  }
}

/** Browsing pages only: never mid sign-in, mid game creation or on the scoring tools. */
function askHere(path: string): boolean {
  if (path === "/" || path === "/dashboard" || path === "/turfs" || path === "/games") return true;
  if (path.startsWith("/c/") || path.startsWith("/turf/")) return true;
  return /^\/game\/[^/]+$/.test(path) && path !== "/game/create";
}

const SAVE_ERROR: Record<string, string> = {
  taken: "Someone already has this username.",
  reserved: "This username is not allowed.",
  bad: "3 to 20 letters, digits or _, starting with a letter.",
  limit: "You can't change your username right now.",
};

/** Something else has the person's attention: another dialog, or a field they are typing in. */
function busy(): boolean {
  if (document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Asks a signed-in person without a username to pick one, once per
 * device, prefilled with a free one made from their name. Only after the
 * server confirmed there is none (profileFresh), and never over another
 * dialog. This is also where people first hear about tagging.
 */
export function UsernamePrompt() {
  const { user, profileFresh, getToken, applyProfile, notice } = useAuth();
  const path = usePathname() ?? "";
  // The account it was opened for: a sign-in in another tab closes it.
  const [open, setOpen] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [taggable, setTaggable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const availability = useUsernameCheck(username, null, getToken);

  // Not while a sign-in notice is up: closing that must not close this.
  const eligible = !!user && profileFresh && !user.username && askHere(path) && !notice;
  const userId = user?.id ?? null;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Wait a moment after the page settles, then ask (unless a dialog is open or this device asked before).
  useEffect(() => {
    if (!eligible || !userId || open) return;
    let live = true;
    const t = setTimeout(async () => {
      if (!live || askedBefore(userId) || busy()) return;
      const tok = await getToken();
      if (!live || !("token" in tok)) return;
      const a = await suggestUsername(tok.token);
      if (!live || errorOf(a)) return;
      const suggestion = (a.body as { username?: string | null }).username ?? "";
      if (busy()) return;
      lastFocus.current = document.activeElement as HTMLElement | null;
      setUsername(suggestion);
      setError("");
      setOpen(userId);
    }, 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [eligible, userId, open, getToken]);

  // Someone else's sign-in, or a username set elsewhere: close.
  const shown = open !== null && open === userId && eligible;

  useEffect(() => {
    if (!shown) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [shown]);

  const close = () => {
    if (userId) markAsked(userId);
    setOpen(null);
    lastFocus.current?.focus?.();
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      // Keep Tab inside the dialog.
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
    setError("");
    setSaving(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) {
        if ("unknown" in tok) setError("Couldn't reach TapTurf. Check your connection and try again.");
        else close();
        return;
      }
      const a = await patchMe(tok.token, { username: username.trim(), taggable });
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

  const status = AVAILABILITY_TEXT[availability];
  const canSave = !saving && !!username.trim() && (availability === "idle" || usernameSavable(availability));

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-primary-900/40" onClick={close} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-prompt-title"
        aria-describedby="username-prompt-body"
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <h2 id="username-prompt-title" className="font-display text-2xl text-primary-900 leading-tight">
          Pick your TapTurf username
        </h2>
        <p id="username-prompt-body" className="mt-2 text-[14px] text-primary-600 leading-snug">
          Your username, name and photo show on your public profile. Friends who score live matches can find you and tag
          you, and the tag links to your profile.
        </p>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) void save();
          }}
        >
          <label htmlFor="username-prompt-input" className="sr-only">Username</label>
          <div className="relative">
            <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
            <input
              ref={inputRef}
              id="username-prompt-input"
              type="text"
              value={username}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="username-prompt-status"
              onChange={(e) => {
                setError("");
                setUsername(e.target.value.replace(/\s/g, "").toLowerCase());
              }}
              className="w-full pl-10 pr-4 py-3 min-h-[48px] border-2 border-primary-200 rounded-xl text-base text-primary-800 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
          </div>
          <p
            id="username-prompt-status"
            aria-live="polite"
            className={`mt-1.5 text-[12px] min-h-4 ${error || (availability !== "ok" && availability !== "checking") ? "text-hot-600" : availability === "ok" ? "text-accent-700" : "text-primary-500"}`}
          >
            {error || status}
          </p>

          <div className="mt-2">
            <TagSwitch on={taggable} onChange={setTaggable} detail="Off also hides your profile page." />
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={close}
              className="flex-1 h-12 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer"
            >
              Later
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex-1 h-12 rounded-full bg-primary-800 text-white font-bold text-[15px] disabled:opacity-40 cursor-pointer"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-[12px] text-primary-500 text-center">
          Change this any time in your profile.{" "}
          <Link href="/privacy#usernames" className="underline underline-offset-2" onClick={close}>
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}

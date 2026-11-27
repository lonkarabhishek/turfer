"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AtSign, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, keepUsername, profileIn } from "@/lib/account/client";
import { ASSIGNED_WORDS as W, SNOOZE_KEY, keepError, snoozeValue, snoozed } from "@/lib/account/assigned";
import { setAssigned, useAssignedUsername } from "./useAssignedUsername";

function readSnooze(): string | null {
  try {
    return localStorage.getItem(SNOOZE_KEY);
  } catch {
    return null;
  }
}

/** Not now, in this tab too when storage is blocked. */
const hiddenHere = new Set<string>();

/** Whether the card is showing for this account on this device (a name was given, and Not now is not hiding it). */
export function assignedCardShown(userId: string | null | undefined, assigned: string | null): boolean {
  return !!userId && !!assigned && !hiddenHere.has(userId) && !snoozed(readSnooze(), userId, Date.now());
}

/**
 * "Your username is @asha_rao": the username TapTurf gave this account,
 * with Keep it and Change (lib/account/assigned.ts has every word and the
 * rule). A card in the page, never a dialog: nothing waits on it. Keep it
 * is the person's own tap, and the only thing here that makes a profile
 * public. Not now hides it for 7 days on this device and changes nothing.
 * Nothing is drawn for someone who chose a username already.
 */
export function AssignedUsernameCard({ onChange, className = "" }: { onChange: () => void; className?: string }) {
  const { user, getToken, applyProfile } = useAuth();
  const { assigned } = useAssignedUsername();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The username they just kept: the card says so until the page is left.
  const [kept, setKept] = useState<{ id: string; username: string } | null>(null);
  const [, redraw] = useState(0);
  const userId = user?.id ?? null;

  if (kept && kept.id === userId) {
    return (
      <section role="status" className={`rounded-2xl border border-accent-500/40 bg-accent-50 px-4 py-3.5 text-left ${className}`} data-username-card="kept">
        <p className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-primary-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden />
          <span className="min-w-0 break-words">{W.keptTitle(kept.username)}</span>
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-primary-600">{W.kept}</p>
        <Link href={`/u/${kept.username}`} className="mt-1 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-accent-700 underline underline-offset-2">
          {W.seeProfile}
        </Link>
      </section>
    );
  }
  if (!userId || !assigned || !assignedCardShown(userId, assigned)) return null;

  const keep = async () => {
    setError("");
    setBusy(true);
    try {
      const tok = await getToken();
      if (!("token" in tok)) return setError("unknown" in tok ? W.offline : W.signIn);
      const a = await keepUsername(tok.token);
      const e = errorOf(a);
      const p = profileIn(a);
      if (!e && p?.username) {
        setKept({ id: userId, username: p.username });
        applyProfile(p);
        return;
      }
      if (e === "taken") {
        // It went to someone else a moment ago: the server is keeping another one now.
        const next = (a.body as { assigned?: string | null }).assigned ?? null;
        setAssigned(userId, next);
        return setError(next ? W.moved(next) : W.failed);
      }
      setError(keepError(e));
    } finally {
      setBusy(false);
    }
  };

  const notNow = () => {
    hiddenHere.add(userId);
    try {
      localStorage.setItem(SNOOZE_KEY, snoozeValue(readSnooze(), userId, Date.now()));
    } catch {
      /* storage blocked: hidden for this visit */
    }
    redraw((n) => n + 1);
  };

  return (
    <section aria-labelledby={titleId} className={`rounded-2xl border border-accent-500/40 bg-accent-50/70 px-4 py-3.5 text-left ${className}`} data-username-card="offer">
      <h2 id={titleId} className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-primary-900">
        <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden />
        <span className="min-w-0 break-words">{W.title(assigned)}</span>
      </h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void keep()}
          disabled={busy}
          className="inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary-900 px-3 text-[14px] font-bold text-white disabled:opacity-60 focus-neon cursor-pointer"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? W.keeping : W.keep}
        </button>
        <button
          type="button"
          onClick={onChange}
          disabled={busy}
          className="inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-full border-2 border-primary-200 bg-white px-3 text-[14px] font-semibold text-primary-800 hover:border-primary-300 disabled:opacity-60 focus-neon cursor-pointer"
        >
          {W.change}
        </button>
      </div>
      <p className="mt-2.5 text-[13px] leading-snug text-primary-600">{W.line}</p>
      {error && (
        <p className="mt-2 text-[13px] font-medium leading-snug text-hot-600" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={notNow} disabled={busy} className="-mb-2 mt-0.5 inline-flex min-h-[44px] items-center text-[13px] font-semibold text-primary-600 underline underline-offset-2 cursor-pointer">
        {W.notNow}
      </button>
    </section>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, profileIn, removeGoogle, startGoogleLink } from "@/lib/account/client";
import { istWhen } from "@/lib/account/display";
import { chromeIntent } from "@/lib/auth/inApp";
import { useInApp } from "@/lib/auth/useInApp";
import type { AccountError } from "@/lib/account/types";
import { PhoneProofSheet } from "./PhoneProofSheet";

/**
 * Adding, changing or removing the Google account of a phone account,
 * from a phone sign-in (the profile, and the one-time ask). Every change
 * needs a phone OTP from the last 5 minutes: when the sign-in is older
 * the server answers reauth and "Confirm it's you" sends a fresh code to
 * the account's own number. Then the server hands over Google's page and
 * the browser goes there; /account/link takes it from there.
 */

const LOGIN_ENDED = "Your login ended. Please log in again.";
const UNREACHABLE = "Couldn't reach TapTurf. Check your connection and try again.";

/** What to say for a refused start, change or remove. */
export function linkErrorText(e: AccountError | null, until?: string | null): string {
  switch (e) {
    case "limit": {
      const when = istWhen(until ?? null);
      return when ? `Too many tries. Try again after ${when}.` : "Too many tries. Try again in an hour.";
    }
    case "slow":
      return "Too many tries. Wait a minute and try again.";
    case "conflict":
      return "We need to check this account. Email info@tapturf.in and we'll sort it out.";
    case "not_allowed":
      return "This account already has an email.";
    case "sign_in":
    case "new":
      return LOGIN_ENDED;
    case "bad":
      return "Log in with your phone number to add Google.";
    default:
      return UNREACHABLE;
  }
}

type SheetFor = { why: "add" | "change" | "remove"; note?: string; then: string };

/**
 * Start adding (or changing) Google: start(then, why). The proof sheet,
 * when one is needed, is in `sheet`: render it wherever the caller is.
 */
export function useGoogleLink(opts: { onRemoved?: () => void } = {}) {
  const { user, getToken, applyProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<SheetFor | null>(null);

  /** Proof needed: a fresh code to the account's own number, with a note when the last one didn't count. */
  const askProof = (s: SheetFor, e: AccountError | null) => {
    if (e === "used") return setSheet({ ...s, note: "That code was already used. We'll send a new one." });
    if (e === "proof") return setSheet({ ...s, note: "That OTP has expired. Send a new one." });
    setSheet(s);
  };

  const token = async (): Promise<string | null> => {
    const t = await getToken();
    if ("token" in t) return t.token;
    setError("unknown" in t ? UNREACHABLE : LOGIN_ENDED);
    return null;
  };

  const start = async (then: string, why: "add" | "change" = "add", proof?: string) => {
    setError("");
    setBusy(true);
    let leaving = false;
    try {
      const tok = await token();
      if (!tok) return setSheet(null);
      const a = await startGoogleLink(tok, then, proof);
      const b = a.body as { url?: unknown; until?: string };
      if (typeof b.url === "string" && b.url) {
        leaving = true;
        setSheet(null);
        window.location.assign(b.url);
        return;
      }
      const e = errorOf(a);
      if (e === "reauth" || e === "used" || e === "proof") return askProof({ why, then }, e);
      setSheet(null);
      setError(linkErrorText(e, b.until));
    } finally {
      // Leaving for Google: stay busy, so a second tap can't start another try.
      if (!leaving) setBusy(false);
    }
  };

  /** Take the Google account off (with a fresh code when the sign-in is older). True when it's off. */
  const remove = async (proof?: string): Promise<boolean> => {
    setError("");
    setBusy(true);
    try {
      const tok = await token();
      if (!tok) {
        setSheet(null);
        return false;
      }
      const a = await removeGoogle(tok, proof);
      const p = profileIn(a);
      if (p) {
        setSheet(null);
        applyProfile(p);
        opts.onRemoved?.();
        return true;
      }
      const e = errorOf(a);
      if (e === "reauth" || e === "used" || e === "proof") {
        askProof({ why: "remove", then: "" }, e);
        return false;
      }
      setSheet(null);
      setError(e === "not_allowed" ? "To change or remove this Google account, log in with your phone number." : linkErrorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sheetNode: ReactNode =
    sheet && user?.phone ? (
      <PhoneProofSheet
        phone={user.phone}
        why={sheet.why}
        note={sheet.note}
        onClose={() => setSheet(null)}
        onProof={async (proof) => {
          if (sheet.why === "remove") await remove(proof);
          else await start(sheet.then, sheet.why, proof);
        }}
      />
    ) : null;

  return { start, remove, busy, error, clearError: () => setError(""), sheet: sheetNode };
}

const btnPrimary =
  "press-tight inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-5 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold disabled:opacity-50 cursor-pointer";
const btnQuiet =
  "inline-flex items-center justify-center h-11 px-4 rounded-full border-2 border-primary-200 text-primary-800 text-[14px] font-semibold hover:border-primary-400 disabled:opacity-50 cursor-pointer";

export function GoogleMark() {
  return (
    <span className="w-6 h-6 shrink-0 rounded-full bg-white flex items-center justify-center" aria-hidden>
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    </span>
  );
}

/** Google sign-in fails inside apps' own browsers: say so, and how to get to a real one. */
export function InAppGoogleNote({ app, os }: { app: string | null; os: "android" | "ios" }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4" role="note">
      <p className="text-[14px] text-amber-900 leading-snug">
        Google sign-in doesn&rsquo;t work inside {app ?? "this app"}. Open TapTurf in {os === "android" ? "Chrome" : "Safari"}, log in with your phone number
        there, then add Google from your profile.
      </p>
      {os === "android" ? (
        <a href={chromeIntent("/login?next=%2Fdashboard%3Ftab%3Dprofile")} className="press-tight mt-3 inline-flex h-11 items-center rounded-full bg-primary-900 px-5 text-[14px] font-semibold text-white">
          Open in Chrome
        </a>
      ) : (
        <p className="mt-2 text-[13px] text-amber-900/80">Tap the ··· menu and choose Open in Safari.</p>
      )}
    </div>
  );
}

/**
 * The profile's Google actions for a phone sign-in.
 *   add     "Add email with Google" ("Log in with Google too" when they typed an email before)
 *   linked  "Use a different Google account" and "Remove", each behind a confirm
 * disabled: the profile has unsaved changes (going to Google would lose them).
 */
export function GoogleLinkActions({
  mode,
  then,
  googleEmail,
  typedEmail,
  disabled = false,
  onRemoved,
}: {
  mode: "add" | "linked";
  then: string;
  googleEmail?: string;
  typedEmail?: string;
  disabled?: boolean;
  onRemoved?: () => void;
}) {
  const [confirm, setConfirm] = useState<"swap" | "remove" | null>(null);
  const link = useGoogleLink({
    onRemoved: () => {
      setConfirm(null);
      onRemoved?.();
    },
  });
  const inApp = useInApp();

  const errorLine = link.error && (
    <p className="mt-2 text-[13px] font-medium text-hot-600" role="alert">
      {link.error}
    </p>
  );
  const saveFirst = disabled && <p className="mt-2 text-[13px] text-primary-500">Save your changes first.</p>;

  if (mode === "add") {
    if (inApp) return <InAppGoogleNote app={inApp.app} os={inApp.os} />;
    return (
      <div>
        <button type="button" onClick={() => void link.start(then, "add")} disabled={disabled || link.busy} className={btnPrimary}>
          {link.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
          {link.busy ? "Opening Google…" : typedEmail ? "Log in with Google too" : "Add email with Google"}
        </button>
        {saveFirst}
        <p className="mt-2 text-[13px] text-primary-600 leading-snug">
          {typedEmail ? "Adds your Google email so Google also opens this account." : "Then Google or your phone number both open this same account."}
        </p>
        <p className="mt-1 text-[12px] text-primary-500">Google shares your name, email and photo with us. Nothing else.</p>
        {errorLine}
        {link.sheet}
      </div>
    );
  }


  return (
    <div>
      {confirm === "swap" ? (
        <ConfirmBox
          text={`${googleEmail ?? "Your Google account"} will stop opening this account. If you log in with it later, we'll ask you to use your phone number. Pick the new Google account on the next screen.`}
          yes="Continue"
          busy={link.busy}
          onYes={() => void link.start(then, "change")}
          onNo={() => setConfirm(null)}
        />
      ) : confirm === "remove" ? (
        <ConfirmBox
          text={`Remove ${googleEmail ?? "your Google account"}? Google won't open this account any more. If you log in with it later, we'll ask you to use your phone number. Your games and history stay as they are.`}
          yes="Remove"
          danger
          busy={link.busy}
          onYes={() => void link.remove()}
          onNo={() => setConfirm(null)}
        />
      ) : inApp ? (
        <InAppGoogleNote app={inApp.app} os={inApp.os} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirm("swap")} disabled={disabled || link.busy} className={btnQuiet}>
            Use a different Google account
          </button>
          <button type="button" onClick={() => setConfirm("remove")} disabled={disabled || link.busy} className={`${btnQuiet} text-hot-600`}>
            Remove
          </button>
        </div>
      )}
      {saveFirst}
      {errorLine}
      {link.sheet}
    </div>
  );
}

function ConfirmBox({ text, yes, danger = false, busy, onYes, onNo }: { text: string; yes: string; danger?: boolean; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4" role="group" aria-label="Confirm">
      <p className="text-[14px] text-primary-800 leading-snug break-words">{text}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onYes}
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-white text-[14px] font-semibold disabled:opacity-50 cursor-pointer ${danger ? "bg-hot-600 hover:bg-hot-700" : "bg-primary-900 hover:bg-primary-800"}`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {yes}
        </button>
        <button type="button" onClick={onNo} disabled={busy} className={btnQuiet}>
          Cancel
        </button>
      </div>
    </div>
  );
}

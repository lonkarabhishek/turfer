"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleMark, useGoogleLink } from "@/components/account/GoogleLinkActions";
import { cancelGoogleLink, completeGoogleLink, errorOf, getMe, googleLinkStatus, newGoogleLeg, profileIn, profileOf } from "@/lib/account/client";
import { istDate, PROFILE_PATH, spacedPhone } from "@/lib/account/display";
import { safeNext } from "@/lib/auth/next";
import type { AccountError } from "@/lib/account/types";

/**
 * /account/link: where a phone account adding its Google account lands
 * after Google (through /api/account/link/google/callback, which never
 * makes a session). It asks the server where the attempt stands (the
 * attempt's secret is in an httpOnly cookie) and shows that: the confirm
 * screen, a refusal, or why nothing came back. Every exit goes to `then`
 * (the profile, or the page the ask was on), checked by safeNext.
 */

type View =
  | { kind: "checking" }
  | { kind: "attached"; email: string; otherEmpty: boolean; otherMadeOn: string | null }
  | { kind: "working" }
  | { kind: "opening" }
  | { kind: "done"; email: string }
  | { kind: "already"; email: string }
  | { kind: "has_account"; empty: boolean; madeOn: string | null }
  | { kind: "other_account" }
  | { kind: "unverified" }
  | { kind: "denied" }
  | { kind: "google" }
  | { kind: "expired" }
  | { kind: "cancelled" }
  | { kind: "mismatch" }
  | { kind: "phone_gone" }
  | { kind: "lost" }
  | { kind: "not_allowed" }
  | { kind: "limit" }
  | { kind: "unavailable"; retry: "status" | "complete" | "leg" };

type Status = {
  state?: string;
  googleEmail?: string | null;
  problem?: string;
  otherEmpty?: boolean;
  otherMadeOn?: string;
  outcome?: string;
};

/** A refusal (from the status, or from the confirm) as the screen for it. */
function refusalView(problem: string | undefined, b: { otherEmpty?: boolean; otherMadeOn?: string | null }): View {
  switch (problem) {
    case "has_account":
      return { kind: "has_account", empty: b.otherEmpty === true, madeOn: b.otherMadeOn ?? null };
    case "other_account":
      return { kind: "other_account" };
    case "unverified":
      return { kind: "unverified" };
    case "mismatch":
      return { kind: "mismatch" };
    case "not_allowed":
      return { kind: "not_allowed" };
    case "cancelled":
      return { kind: "cancelled" };
    case "expired":
    case "gave_up":
    case "replaced":
      return { kind: "expired" };
    default:
      return { kind: "google" };
  }
}

function LinkInner() {
  const params = useSearchParams();
  const then = safeNext(params?.get("then") || PROFILE_PATH);
  const err = params?.get("err") ?? null;
  const toProfile = then === PROFILE_PATH;
  const { user, loading, signedInWith, getToken, applyProfile } = useAuth();
  const [view, setView] = useState<View>({ kind: "checking" });
  // Starting again from here when the attempt is gone (after a refused confirm): the same as the profile's button.
  const restart = useGoogleLink();
  const ran = useRef(false);

  const exit = useCallback(() => window.location.replace(then), [then]);

  /** The phone sign-in's token; null with the screen to show instead. */
  const phoneToken = useCallback(async (retry: "status" | "complete" | "leg"): Promise<string | null> => {
    if (signedInWith !== "phone") {
      setView({ kind: "phone_gone" });
      return null;
    }
    const t = await getToken();
    if ("token" in t) return t.token;
    setView("none" in t ? { kind: "phone_gone" } : { kind: "unavailable", retry });
    return null;
  }, [signedInWith, getToken]);

  const status = useCallback(async () => {
    setView({ kind: "checking" });
    const tok = await phoneToken("status");
    if (!tok) return;
    const a = await googleLinkStatus(tok);
    if (a.status === 401) return setView({ kind: "phone_gone" });
    const e = errorOf(a);
    if (e) return setView(e === "slow" ? { kind: "limit" } : { kind: "unavailable", retry: "status" });
    const b = a.body as Status;
    switch (b.state) {
      case "attached":
        return setView({ kind: "attached", email: b.googleEmail ?? "", otherEmpty: b.otherEmpty === true, otherMadeOn: b.otherMadeOn ?? null });
      case "waiting":
        return setView(err === "denied" ? { kind: "denied" } : err === "unavailable" ? { kind: "unavailable", retry: "leg" } : { kind: "google" });
      case "refused":
        return setView(refusalView(b.problem, b));
      case "closed":
        if (b.outcome === "linked") return setView(b.googleEmail ? { kind: "already", email: b.googleEmail } : { kind: "expired" });
        return setView(refusalView(b.outcome, b));
      default: {
        // No attempt in this browser: already done (a Back after Done), lost on the way, or run out.
        const me = profileOf(await getMe(tok));
        if (me?.google_email) return setView({ kind: "already", email: me.google_email });
        return setView(err === "lost" ? { kind: "lost" } : { kind: "expired" });
      }
    }
  }, [phoneToken, err]);

  useEffect(() => {
    if (loading || ran.current) return;
    const t = setTimeout(() => {
      ran.current = true;
      void status();
    }, 0);
    return () => clearTimeout(t);
  }, [loading, status]);

  const add = async () => {
    setView({ kind: "working" });
    const tok = await phoneToken("complete");
    if (!tok) return;
    const a = await completeGoogleLink(tok);
    const p = profileIn(a);
    if (p) {
      applyProfile(p);
      const email = p.google_email ?? (view.kind === "attached" ? view.email : "");
      return setView({ kind: "done", email });
    }
    const e = errorOf(a);
    if (a.status === 401) return setView({ kind: "phone_gone" });
    if (e === "unavailable" || e === null) return setView({ kind: "unavailable", retry: "complete" });
    const b = a.body as { otherEmpty?: boolean; otherMadeOn?: string };
    setView(refusalView(e, b));
  };

  /** Another Google round trip on this attempt; when the attempt is gone, a new one (which may ask for a code first). */
  const again = async () => {
    setView({ kind: "opening" });
    const tok = await phoneToken("leg");
    if (!tok) return;
    const a = await newGoogleLeg(tok);
    const b = a.body as { url?: unknown; until?: string };
    if (typeof b.url === "string" && b.url) return window.location.assign(b.url);
    const e: AccountError | null = errorOf(a);
    if (a.status === 401) return setView({ kind: "phone_gone" });
    if (e === "expired") {
      await restart.start(then, "add");
      // Still here: the code sheet is open, or the start was refused (its line says why).
      return setView({ kind: "google" });
    }
    if (e === "mismatch") return setView({ kind: "mismatch" });
    if (e === "limit" || e === "slow") return setView({ kind: "limit" });
    setView({ kind: "unavailable", retry: "leg" });
  };

  const cancel = async () => {
    setView({ kind: "working" });
    await cancelGoogleLink();
    exit();
  };

  const exitButton = <Btn onClick={exit} quiet>{toProfile ? "Back to profile" : "Continue"}</Btn>;
  const tryDifferent = <Btn onClick={() => void again()}>Try a different Google account</Btn>;
  const tryAgain = <Btn onClick={() => void again()}>Try again</Btn>;
  const phone = user?.phone ? spacedPhone(user.phone) : "";

  let screen: ReactNode;
  switch (view.kind) {
    case "checking":
      screen = <Busy title="One second…" />;
      break;
    case "working":
      screen = <Busy title="Adding your Google account…" />;
      break;
    case "opening":
      screen = <Busy title="Opening Google…" />;
      break;
    case "attached":
      screen = (
        <Screen title="Add this Google account?" icon="google">
          <p className="text-[17px] font-semibold text-primary-900 break-all">{view.email}</p>
          <p>
            After this, you can log in with Google or with your phone number{phone ? ` ${phone}` : ""}. Both open this same TapTurf account.
          </p>
          {view.otherEmpty && (
            <p className="rounded-xl bg-primary-50 px-3 py-2 text-[14px] text-primary-700">
              This Google account also has an empty TapTurf account{view.otherMadeOn ? `, made on ${istDate(view.otherMadeOn)}` : ""}. It stays as it is, with nothing in it, and Google opens this account from now on.
            </p>
          )}
          <p className="text-[13px] text-primary-500">Google shares your name, email and photo with us. Nothing else.</p>
          <Actions>
            <Btn onClick={() => void add()}>Add Google account</Btn>
            <Btn onClick={() => void again()} quiet>
              Use a different Google account
            </Btn>
            <Btn onClick={() => void cancel()} quiet>
              Cancel
            </Btn>
          </Actions>
        </Screen>
      );
      break;
    case "done":
      screen = (
        <Screen title="Done!" icon="ok">
          <p>
            <span className="font-semibold text-primary-900 break-all">{view.email || "Your Google account"}</span> is added. Next time, log in with Google or your phone
            number. Both open this account.
          </p>
          <Actions>
            <Btn onClick={exit}>{toProfile ? "Back to profile" : "Continue"}</Btn>
          </Actions>
        </Screen>
      );
      break;
    case "already":
      screen = (
        <Screen title="Your Google account is already added" icon="ok">
          <p>
            <span className="font-semibold text-primary-900 break-all">{view.email}</span> opens this account. Log in with Google or your phone number.
          </p>
          <Actions>
            <Btn onClick={exit}>{toProfile ? "Back to profile" : "Continue"}</Btn>
          </Actions>
        </Screen>
      );
      break;
    case "has_account":
      screen = view.empty ? (
        <Screen title="This Google account has an empty TapTurf account">
          <p>
            It was made{view.madeOn ? ` on ${istDate(view.madeOn)}` : ""} and has nothing in it, but we can&rsquo;t add it here or join the two. Pick a different Google
            account, or email info@tapturf.in and we&rsquo;ll help.
          </p>
          <Actions>
            {tryDifferent}
            <a href="mailto:info@tapturf.in" className={quietClass}>
              Email us
            </a>
            {exitButton}
          </Actions>
        </Screen>
      ) : (
        <Screen title="This Google account already has its own TapTurf account">
          <p>We can&rsquo;t add it here, and we never join two accounts. Pick a different Google account, or log out and log in with Google to use that other account.</p>
          <Actions>
            {tryDifferent}
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    case "other_account":
      screen = (
        <Screen title="This Google account is already added to another TapTurf account">
          <p>Pick a different Google account.</p>
          <Actions>
            {tryDifferent}
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    case "unverified":
      screen = (
        <Screen title="Google didn't confirm this email">
          <p>Pick a different Google account.</p>
          <Actions>
            {tryDifferent}
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    case "denied":
      screen = (
        <Screen title="Google sign-in was cancelled">
          <p>Nothing changed.</p>
          <Actions>
            {tryAgain}
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    case "google":
      screen = (
        <Screen title="Google didn't finish">
          <p>Nothing changed. Try again.</p>
          <Actions>
            {tryAgain}
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    case "expired":
    case "cancelled":
      screen = (
        <Screen title={view.kind === "cancelled" ? "Adding Google was cancelled" : "That took too long"}>
          <p>Nothing changed. Start again from your profile.</p>
          <Actions>{exitButton}</Actions>
        </Screen>
      );
      break;
    case "mismatch":
      screen = (
        <Screen title="Your phone login changed">
          <p>Log in with your phone number again, then add Google from your profile.</p>
          <Actions>{exitButton}</Actions>
        </Screen>
      );
      break;
    case "phone_gone":
      screen = (
        <Screen title="Your phone login ended">
          <p>Log in with your phone number, then add Google from your profile.</p>
          <Actions>
            <Link href="/login?next=%2Fdashboard%3Ftab%3Dprofile" className={primaryClass}>
              Log in
            </Link>
          </Actions>
        </Screen>
      );
      break;
    case "lost":
      screen = (
        <Screen title="We couldn't finish here">
          <p>Google opened in a different browser or app. Go back to TapTurf where you started and try again from your profile.</p>
          <Actions>
            <Link href="/" className={primaryClass}>
              Go to TapTurf
            </Link>
          </Actions>
        </Screen>
      );
      break;
    case "not_allowed":
      screen = (
        <Screen title="This account already has an email">
          <Actions>{exitButton}</Actions>
        </Screen>
      );
      break;
    case "limit":
      screen = (
        <Screen title="Too many tries">
          <p>Start again from your profile in a few minutes.</p>
          <Actions>{exitButton}</Actions>
        </Screen>
      );
      break;
    case "unavailable": {
      const retry = view.retry;
      screen = (
        <Screen title="Couldn't reach TapTurf">
          <p>Check your connection and try again.</p>
          <Actions>
            <Btn onClick={() => void (retry === "complete" ? add() : retry === "leg" ? again() : status())}>Try again</Btn>
            {exitButton}
          </Actions>
        </Screen>
      );
      break;
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-start md:items-center justify-center px-4 py-10 md:py-20">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="press-tight inline-flex items-center gap-2 mb-8">
          <Logo height={56} priority />
        </Link>
        {screen}
        {restart.error && (
          <p className="mt-4 text-[14px] font-medium text-hot-600" role="alert">
            {restart.error}
          </p>
        )}
        {restart.sheet}
      </div>
    </div>
  );
}

const primaryClass =
  "press-tight inline-flex w-full items-center justify-center gap-2 h-12 px-5 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold disabled:opacity-50 cursor-pointer";
const quietClass =
  "press-tight inline-flex w-full items-center justify-center h-12 px-5 rounded-full border-2 border-primary-200 text-primary-800 text-[15px] font-semibold hover:border-primary-400 cursor-pointer";

function Btn({ onClick, quiet = false, children }: { onClick: () => void; quiet?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={quiet ? quietClass : primaryClass}>
      {children}
    </button>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="pt-3 flex flex-col gap-2.5">{children}</div>;
}

function Screen({ title, icon = "alert", children }: { title: string; icon?: "alert" | "ok" | "google"; children: ReactNode }) {
  return (
    <section aria-live="polite">
      <span
        className={`w-12 h-12 rounded-full inline-flex items-center justify-center mb-4 ${icon === "ok" ? "bg-accent-50 text-accent-700" : icon === "google" ? "bg-primary-50" : "bg-amber-50 text-amber-700"}`}
        aria-hidden
      >
        {icon === "ok" ? <CheckCircle2 className="w-6 h-6" /> : icon === "google" ? <GoogleMark /> : <AlertCircle className="w-6 h-6" />}
      </span>
      <h1 className="font-display tracking-tight text-primary-900 text-3xl leading-[1.05] mb-3">{title}</h1>
      <div className="space-y-3 text-[15px] text-primary-600 leading-snug">{children}</div>
    </section>
  );
}

function Busy({ title }: { title: string }) {
  return (
    <section className="py-6 text-center" aria-live="polite">
      <Loader2 className="w-8 h-8 text-accent-500 animate-spin mx-auto mb-4" />
      <p className="font-display text-primary-900 text-xl">{title}</p>
    </section>
  );
}

export default function AccountLinkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LinkInner />
    </Suspense>
  );
}

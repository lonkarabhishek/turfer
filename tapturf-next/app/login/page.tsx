"use client";

import { useEffect, useRef, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { PhoneOTPForm } from "@/components/auth/PhoneOTPForm";
import { loginErrorText } from "@/lib/auth/callback";
import { chromeIntent, inAppBrowser, type InApp } from "@/lib/auth/inApp";
import { safeNext } from "@/lib/auth/next";

// The in-app browser this page is open in (read once, on the client only).
const noSubscribe = () => () => {};
let inAppSeen: InApp | null | undefined;
const readInApp = () => {
  if (inAppSeen !== undefined) return inAppSeen;
  // Added to the home screen (as NotificationsPrompt checks): a real browser, not an app's.
  const standalone = (navigator as { standalone?: boolean }).standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches;
  return (inAppSeen = inAppBrowser(navigator.userAgent, standalone));
};

/**
 * Dedicated /login page. Replaces the fragile modal-based flow with a
 * real, bookmarkable route. Rebuilding auth on its own page fixes:
 *   - Modal state getting nuked mid-flow by route changes.
 *   - The OAuth return leg competing with the huge home render.
 *   - Ambiguous "where do I go after login" (uses ?next=).
 *
 * Also warm-loads Firebase in the background so the phone OTP click is
 * instant instead of triggering a 300KB chunk fetch on tap.
 */
function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const nextParam = params?.get("next") || "/";
  const errParam = params?.get("error");
  // A Google sign-in that opens no TapTurf account right now (the callback ended its session).
  const accountWhy = errParam === "account" ? params?.get("why") : null;
  const replaced = accountWhy === "replaced";
  const [askFresh, setAskFresh] = useState(false);
  // From a live score the heading and the line under it change. live: turning on a link; follow: keeping up with one.
  const via = params?.get("via");
  const live = via === "live" || via === "follow";

  const [googleBusy, setGoogleBusy] = useState(false);
  // One Google start at a time: a second tap would write a new verifier over the first.
  const starting = useRef(false);
  const [errMsg, setErrMsg] = useState<string | null>(loginErrorText(errParam, params?.get("why")));
  // Google refuses sign-ins inside apps like Instagram: say so, and put the phone first.
  const inApp = useSyncExternalStore(noSubscribe, readInApp, () => null);

  // Warm-preload Firebase so the phone-OTP click doesn't trigger a
  // ~300KB chunk fetch on tap.
  useEffect(() => {
    import("@/lib/firebase/client").catch(() => {});
  }, []);

  // Already signed in? Bounce back to `next` immediately. Not with an account message: it is
  // about the Google account just tried, and a phone login kept on this device must not hide it.
  useEffect(() => {
    if (!authLoading && user && !accountWhy) {
      router.replace(safeNext(nextParam));
    }
  }, [authLoading, user, accountWhy, nextParam, router]);

  /** "Log in with your phone number": to the phone form, keyboard up. */
  const focusPhone = () => {
    const el = document.querySelector<HTMLInputElement>("#login-phone input[type=tel]");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus();
  };

  const handleGoogle = async () => {
    if (starting.current) return;
    starting.current = true;
    setGoogleBusy(true);
    setErrMsg(null);
    try {
      const supabase = createClient();
      // Deliberately do NOT signOut() first — it adds latency and, on
      // the singleton client, is unnecessary. signInWithOAuth replaces
      // any existing session anyway.
      const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeNext(nextParam))}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // No access_type offline: the app never uses Google's own tokens, so it doesn't ask for them.
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        setErrMsg(error.message || "Sign-in failed. Try again.");
        setGoogleBusy(false);
        starting.current = false;
      }
      // On success, the browser leaves this page for Google. No cleanup.
    } catch {
      setErrMsg("Something went wrong. Try again.");
      setGoogleBusy(false);
      starting.current = false;
    }
  };

  const here = `/login?next=${encodeURIComponent(safeNext(nextParam))}`;
  const inAppNotice = inApp && (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4" role="note">
      <p className="text-[14px] text-amber-900 leading-snug">
        Google sign-in doesn&rsquo;t work inside {inApp.app ?? "this app"}.{" "}
        {inApp.os === "android" ? "Open TapTurf in Chrome to use Google, or log in with your phone number below." : "Tap the ··· menu and choose Open in Safari, or log in with your phone number below."}
      </p>
      {inApp.os === "android" && (
        <a href={chromeIntent(here)} className="press-tight mt-3 inline-flex h-11 items-center rounded-full bg-primary-900 px-5 text-[14px] font-semibold text-white">
          Open in Chrome
        </a>
      )}
    </div>
  );

  // A Google account taken off a phone account: only a choice made here, on this site, makes it a new
  // account (the callback reads this cookie; a link from another site can't set it).
  const makeNewWithGoogle = () => {
    try {
      document.cookie = `tt_g_new=1; Max-Age=600; Path=/api/auth; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      /* cookies blocked: the sign-in then gives the same message again */
    }
    setAskFresh(false);
    void handleGoogle();
  };
  const replacedChoices = replaced && (
    <div className="mb-5 space-y-3">
      <button
        type="button"
        onClick={focusPhone}
        className="press-tight w-full h-12 rounded-full border-2 border-primary-200 text-primary-900 text-[15px] font-semibold hover:border-primary-400 cursor-pointer"
      >
        Log in with your phone number
      </button>
      {askFresh ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4" role="group" aria-label="Make a new account">
          <p className="text-[14px] text-primary-800 leading-snug">This gives this Google login a TapTurf account of its own, separate from your old one. Your old account stays as it is and opens with your phone number.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={makeNewWithGoogle} disabled={googleBusy} className="h-11 px-4 rounded-full bg-primary-900 text-white text-[14px] font-semibold disabled:opacity-50 cursor-pointer">
              Make a new account
            </button>
            <button type="button" onClick={() => setAskFresh(false)} className="h-11 px-4 rounded-full border-2 border-primary-200 text-primary-800 text-[14px] font-semibold cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAskFresh(true)} className="block mx-auto text-[13px] font-semibold text-primary-500 underline underline-offset-2 hover:text-primary-800 cursor-pointer">
          Make a new TapTurf account with Google
        </button>
      )}
    </div>
  );

  const phoneSection = (
    <section id="login-phone" className="rounded-3xl border border-primary-200 bg-white p-5 mb-5">
      <p className="text-[11px] font-bold text-primary-500 mb-3">
        Sign in with phone
      </p>
      <PhoneOTPForm
        autoFocusPhone={false}
        onSuccess={() => router.replace(safeNext(nextParam))}
      />
    </section>
  );
  const orDivider = (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-primary-200" />
      <span className="text-[11px] font-mono text-primary-400">
        or
      </span>
      <div className="flex-1 h-px bg-primary-200" />
    </div>
  );
  // The main way in: one tap with the Google account already on the phone.
  const googleButton = (
    <button
      onClick={handleGoogle}
      disabled={googleBusy}
      className="press-tight w-full flex items-center justify-center gap-3 bg-primary-900 hover:bg-primary-800 text-white rounded-full py-3.5 min-h-[56px] px-4 text-[16px] font-semibold shadow-elevated disabled:opacity-60"
    >
      {googleBusy ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-white/80" />
          <span>Opening Google…</span>
        </>
      ) : (
        <>
          <span className="w-7 h-7 shrink-0 rounded-full bg-white flex items-center justify-center" aria-hidden>
          <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          </span>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-white flex items-start md:items-center justify-center px-4 py-10 md:py-20">
      <div className="w-full max-w-[420px]">
        {/* Wordmark */}
        <Link
          href="/"
          className="press-tight inline-flex items-center gap-2 mb-8"
        >
          <Logo height={72} priority />
        </Link>

        {/* Title */}
        <h1 className="font-display tracking-tight text-primary-900 text-4xl md:text-5xl leading-[0.95] mb-2">
          {via === "follow" ? "Log in to follow the live score" : live ? "Log in to share a live link" : "Sign in"}
        </h1>
        <p className="text-primary-600 text-[15px] mb-8">
          {via === "follow"
            ? "Free, and quick with Google or your phone. You come straight back to the score."
            : live
              ? "Your match stays saved on this phone. You log in once; friends log in on their own phones to follow."
              : "Book turfs. Host games. Find a squad."}
        </p>

        {/* Error banner — always visible above the CTAs so it's noticed. */}
        {errMsg && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-hot-500/10 border border-hot-500/30 rounded-2xl">
            <AlertCircle className="w-5 h-5 text-hot-600 shrink-0 mt-0.5" />
            <p className="text-[14px] text-hot-700">{errMsg}</p>
          </div>
        )}

        {replacedChoices}
        {accountWhy && user && (
          <p className="mb-5 text-[14px] text-primary-600">
            You&rsquo;re still logged in with your phone number.{" "}
            <Link href={safeNext(nextParam)} className="font-semibold text-accent-700 underline underline-offset-2">
              Carry on
            </Link>
          </p>
        )}

        {/* Google first everywhere, phone right under it. The phone form is
            shown directly (not behind a "use phone" tap): that extra tap was
            itself a friction point. Inside an app's own browser Google can't
            work, so the phone comes first there. */}
        {inAppNotice}
        {inApp ? (
          <>
            {phoneSection}
            {orDivider}
            {googleButton}
          </>
        ) : (
          <>
            {googleButton}
            {orDivider}
            {phoneSection}
          </>
        )}

        <p className="text-center text-[11px] text-primary-400 mt-6">
          By continuing you agree to our <Link href="/terms" className="underline hover:text-primary-600">terms</Link> and{" "}
          <Link href="/privacy" className="underline hover:text-primary-600">privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LoginInner />
    </Suspense>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSessionCookie } from "@/lib/auth/callback";
import { safeNext } from "@/lib/auth/next";

const PROJECT_REF = "hwfsbpzercuoshodmnuf";

/**
 * Lightweight OAuth handoff page. The /api/auth/callback route lands
 * here after successfully exchanging the OAuth code for a Supabase
 * session; this page's only job is to wait for AuthProvider to publish
 * `user`, then push the user onwards to `next`.
 *
 * Why not go straight home? The home page fetches turfs for two cities
 * and renders a lot. Doing that concurrently with the OAuth handshake
 * caused the "sign-in feels slow / sometimes doesn't finish" behavior.
 * A tiny purpose-built page lets the auth handshake finish first, then
 * a clean router.replace hands off.
 */
function CompleteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, accountProblem } = useAuth();
  const nextParam = params?.get("next") || "/";
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading && user && !accountProblem) {
      router.replace(safeNext(nextParam));
    }
  }, [user, loading, accountProblem, nextParam, router]);

  // This Google account opens no TapTurf account right now (being added to a phone account, or
  // taken off one): its session is already ended; /login says why and what to do.
  useEffect(() => {
    if (accountProblem) router.replace(`/login?error=account&why=${accountProblem}&next=${encodeURIComponent(safeNext(nextParam))}`);
  }, [accountProblem, nextParam, router]);

  // Safety bailout: still not signed in after 6s means the callback
  // probably failed silently (cookies blocked, provider error post-code).
  // With a session cookie the sign-in worked and the phone is just slow:
  // wait up to 15s, saying so. Then back to /login with a clear error
  // rather than spinning forever.
  useEffect(() => {
    if (user) return;
    let session = false;
    try {
      session = hasSessionCookie(document.cookie.split(";").map((c) => c.split("=")[0].trim()), PROJECT_REF);
    } catch {
      /* no cookies: treat as no session */
    }
    const t1 = setTimeout(() => (session ? setSlow(true) : setFailed(true)), 6000);
    const t2 = session ? setTimeout(() => setFailed(true), 15000) : null;
    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [user]);

  useEffect(() => {
    if (failed && !user && !accountProblem) {
      const url = `/login?error=callback&why=slow&next=${encodeURIComponent(safeNext(nextParam))}`;
      router.replace(url);
    }
  }, [failed, user, accountProblem, nextParam, router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-[320px] text-center">
        {failed ? (
          <>
            <div className="w-12 h-12 rounded-full bg-hot-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-hot-600" />
            </div>
            <p className="font-display text-primary-900 text-xl mb-1">
              Something got stuck
            </p>
            <p className="text-sm text-primary-500">Sending you back to try again…</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 text-accent-500 animate-spin mx-auto mb-4" />
            <p className="font-display text-primary-900 text-xl mb-1">
              {slow ? "Still signing you in…" : "Signing you in"}
            </p>
            <p className="text-sm text-primary-500">{slow ? "Your connection is slow. Hang on a few more seconds." : "One second, taking you home…"}</p>
            {slow && (
              <button type="button" onClick={() => window.location.reload()} className="mt-4 h-10 px-5 rounded-full border border-primary-200 text-[14px] font-semibold text-primary-800">
                Reload
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <CompleteInner />
    </Suspense>
  );
}

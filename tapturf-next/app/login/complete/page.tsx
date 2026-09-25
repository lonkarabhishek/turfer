"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

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
  const { user, loading } = useAuth();
  const nextParam = params?.get("next") || "/";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(safeNext(nextParam));
    }
  }, [user, loading, nextParam, router]);

  // Safety bailout: if we're still not signed in after 6s the callback
  // probably failed silently (cookies blocked, provider error post-code).
  // Send the user back to /login with a clear error rather than spinning
  // forever.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!user) setFailed(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    if (failed) {
      const url = `/login?error=callback&next=${encodeURIComponent(safeNext(nextParam))}`;
      router.replace(url);
    }
  }, [failed, nextParam, router]);

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
              Signing you in
            </p>
            <p className="text-sm text-primary-500">One second, taking you home…</p>
          </>
        )}
      </div>
    </div>
  );
}

function safeNext(next: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next === "/login" || next.startsWith("/login/")) return "/";
  return next;
}

export default function LoginCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <CompleteInner />
    </Suspense>
  );
}

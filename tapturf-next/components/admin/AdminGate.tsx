"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase/client";

// Same name as ADMIN_TOKEN_COOKIE in lib/admin/auth.ts (server file).
const COOKIE = "tt_fid";

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|; )tt_fid=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Shown by /admin pages when the server could not confirm the owner.
 * Phone-OTP sign-ins have no server session, so this hands the server
 * the browser's Firebase ID token (short-lived, signed by Google) and
 * reloads once. The server verifies it; nothing here grants access.
 * Loads the Firebase SDK only on /admin.
 */
export function AdminGate() {
  const router = useRouter();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await getFirebaseAuth();
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) throw new Error("no firebase user");
        const token = await user.getIdToken();
        // Already sent this exact token and the server said no.
        if (readCookie() === token) throw new Error("rejected");
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=3600; SameSite=Lax${secure}`;
        if (!cancelled) router.refresh();
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      {denied ? (
        <>
          <h1 className="font-display text-3xl text-primary-900">Page not found</h1>
          <p className="mt-3 text-[15px] text-primary-500">
            This page doesn&apos;t exist, or you need to sign in with the owner account.
          </p>
          <Link
            href="/login?next=/admin"
            className="mt-6 inline-flex h-11 items-center rounded-full bg-primary-900 px-6 text-[15px] font-semibold text-white"
          >
            Sign in
          </Link>
        </>
      ) : (
        <p className="text-[15px] text-primary-500">Checking access…</p>
      )}
    </div>
  );
}

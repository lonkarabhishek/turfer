import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { errorCode, firebaseConfig, friendlyOtpError, logOtpSend } from "@/lib/firebase/client";

/**
 * A code to a turf's listed number, to claim it at once (myTapturf).
 *
 * Runs on its own Firebase instance that keeps nothing (in-memory
 * persistence), so the person's own TapTurf sign-in never changes: a
 * Google user stays the Google user, a phone user keeps their number.
 * The code proves the number; the ID token it gives goes to
 * owner_claim_verified, which checks it with Google and that the number
 * is on the listing. Then this instance signs out.
 */

const APP_NAME = "claim-verify";
let _authP: Promise<Auth> | null = null;

async function claimAuth(): Promise<Auth> {
  if (_authP) return _authP;
  _authP = (async () => {
    const [{ initializeApp, getApps }, { initializeAuth, getAuth, inMemoryPersistence }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(firebaseConfig, APP_NAME);
    let auth: Auth;
    try {
      auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
      auth = getAuth(app); // already set up in this tab
    }
    auth.languageCode = "en";
    return auth;
  })();
  _authP.catch(() => {
    _authP = null;
  });
  return _authP;
}

export type ClaimCode = { confirm: (code: string) => Promise<{ proof: string } | { error: string }> };

const E2E = process.env.NEXT_PUBLIC_E2E_AUTH === "1";

/** Sends a code to +91 phone10. The reCAPTCHA renders into a fresh child of containerId. */
export async function sendClaimCode(phone10: string, containerId: string, previous?: RecaptchaVerifier | null): Promise<({ code: ClaimCode; verifier: RecaptchaVerifier | null }) | { error: string }> {
  // Local end-to-end builds only (next.config.ts refuses the flag on Vercel): no SMS, a fixed code.
  if (E2E) {
    return {
      verifier: null,
      code: { confirm: async (c) => (c === "123456" ? { proof: `e2e-proof:${phone10}` } : { error: friendlyOtpError("auth/invalid-verification-code", "That code didn't work.") }) },
    };
  }
  try {
    const auth = await claimAuth();
    const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
    try {
      previous?.clear();
    } catch {
      /* already cleared */
    }
    const box = document.getElementById(containerId);
    let target: HTMLElement | string = containerId;
    if (box) {
      box.innerHTML = "";
      const fresh = document.createElement("div");
      box.appendChild(fresh);
      target = fresh;
    }
    const verifier = new RecaptchaVerifier(auth, target, { size: "invisible" });
    let confirmation: ConfirmationResult;
    try {
      confirmation = await signInWithPhoneNumber(auth, `+91${phone10}`, verifier);
    } catch (e) {
      logOtpSend(false, `claim:${errorCode(e) ?? "unknown"}`, phone10);
      try {
        verifier.clear();
      } catch {
        /* ignore */
      }
      return { error: friendlyOtpError(errorCode(e), "Couldn't send the code. Try again in a minute.") };
    }
    logOtpSend(true, null, phone10);
    return {
      verifier,
      code: {
        confirm: async (c) => {
          try {
            const result = await confirmation.confirm(c);
            const proof = await result.user.getIdToken();
            // The proof is in hand: this instance needs no session.
            void auth.signOut().catch(() => {});
            return { proof };
          } catch (e) {
            return { error: friendlyOtpError(errorCode(e), "That code didn't work. Try again.") };
          }
        },
      },
    };
  } catch {
    return { error: "Couldn't start the check. Refresh the page and try again." };
  }
}

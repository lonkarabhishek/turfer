import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { errorCode, firebaseConfig, friendlyOtpError, logOtpSend } from "@/lib/firebase/client";

/**
 * A code to a phone number that proves it, without changing anyone's
 * sign-in. Each use runs its own Firebase instance that keeps nothing
 * (in-memory persistence): the default app, its phone sign-in and
 * lib/account/client.ts firebaseToken() never see it. On a correct code
 * the instance hands over the ID token (the proof) and signs out.
 *
 *   claim-verify  a turf's listed number, to claim it at once (myTapturf)
 *   link-proof    the account's own number, before adding or removing its Google account
 *   phone-add     a number a Google account adds, confirms or changes to
 */

type AppName = "claim-verify" | "link-proof" | "phone-add";

const auths = new Map<AppName, Promise<Auth>>();

async function proofAuth(name: AppName): Promise<Auth> {
  const had = auths.get(name);
  if (had) return had;
  const p = (async () => {
    const [{ initializeApp, getApps }, { initializeAuth, getAuth, inMemoryPersistence }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app = getApps().find((a) => a.name === name) ?? initializeApp(firebaseConfig, name);
    let auth: Auth;
    try {
      auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
      auth = getAuth(app); // already set up in this tab
    }
    auth.languageCode = "en";
    return auth;
  })();
  auths.set(name, p);
  // A failed load (offline, a blocked chunk) is not kept: the next call tries again.
  p.catch(() => auths.delete(name));
  return p;
}

export type ProofCode = { confirm: (code: string) => Promise<{ proof: string } | { error: string }> };
export type ProofSend = { code: ProofCode; verifier: RecaptchaVerifier | null } | { error: string };

/** The old name, for myTapturf. */
export type ClaimCode = ProofCode;

const E2E = process.env.NEXT_PUBLIC_E2E_AUTH === "1";

/**
 * Sends a code to +91 phone10 on the named instance. The reCAPTCHA
 * renders into a fresh child of containerId. In local end-to-end builds
 * (next.config.ts refuses the flag on Vercel) no SMS goes out: 123456 is
 * the code, and e2eProof() the proof it gives.
 */
export async function sendProofCode(
  appName: AppName,
  phone10: string,
  containerId: string,
  previous: RecaptchaVerifier | null | undefined,
  e2eProof: () => string | null,
): Promise<ProofSend> {
  if (E2E) {
    return {
      verifier: null,
      code: {
        confirm: async (c) => {
          const proof = c === "123456" ? e2eProof() : null;
          return proof ? { proof } : { error: friendlyOtpError("auth/invalid-verification-code", "That code didn't work.") };
        },
      },
    };
  }
  try {
    const auth = await proofAuth(appName);
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
      logOtpSend(false, `${appName === "claim-verify" ? "claim" : appName}:${errorCode(e) ?? "unknown"}`, phone10);
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

/** The proof a local end-to-end test put in place for the next code (lib/account flows). */
function e2eStoredProof(): string | null {
  try {
    return localStorage.getItem("tt_e2e_fb_proof");
  } catch {
    return null;
  }
}

/** A code to a turf's listed number (myTapturf). Unchanged: its end-to-end proof names the number. */
export const sendClaimCode = (phone10: string, containerId: string, previous?: RecaptchaVerifier | null) =>
  sendProofCode("claim-verify", phone10, containerId, previous, () => `e2e-proof:${phone10}`);

/** A code to the account's own number, before adding, changing or removing its Google account. */
export const sendLinkProofCode = (phone10: string, containerId: string, previous?: RecaptchaVerifier | null) =>
  sendProofCode("link-proof", phone10, containerId, previous, e2eStoredProof);

/** A code to the number a Google account adds, confirms or changes to. */
export const sendPhoneAddCode = (phone10: string, containerId: string, previous?: RecaptchaVerifier | null) =>
  sendProofCode("phone-add", phone10, containerId, previous, e2eStoredProof);

/**
 * Why a Google sign-in did not finish, in words people can act on. The
 * callback (app/api/auth/callback/route.ts) works out a reason and sends
 * it to /login as ?why=; /login shows the matching line right above the
 * Google button. Relative imports only (npm run test:account).
 */

export type Why = "denied" | "again" | "google" | "lost" | "used" | "expired" | "slow" | "other" | "linking" | "replaced";

const WHYS: readonly Why[] = ["denied", "again", "google", "lost", "used", "expired", "slow", "other", "linking", "replaced"];

/** Supabase sent ?error= back instead of a code. */
export function providerWhy(error: string | null, errorCode: string | null, description: string | null): Why {
  if (error === "access_denied") return "denied";
  if (errorCode === "bad_oauth_state" || errorCode === "flow_state_not_found") return "used";
  // Two returns for one new account at once: the first one made it, a second tap finishes.
  if (/saving new user/i.test(description ?? "")) return "again";
  return "google";
}

/** The code could not be swapped for a session. */
export function exchangeWhy(e: unknown): Why {
  if (!e || typeof e !== "object") return "other";
  const { name, code, message } = e as { name?: unknown; code?: unknown; message?: unknown };
  const n = typeof name === "string" ? name : "";
  const c = typeof code === "string" ? code : "";
  const m = typeof message === "string" ? message : "";
  // The verifier lives in a cookie in the browser that started the sign-in.
  if (n === "AuthPKCECodeVerifierMissingError" || c === "pkce_code_verifier_not_found" || c === "bad_code_verifier") return "lost";
  if (c === "flow_state_expired") return "expired";
  if (c === "flow_state_not_found" || /no valid flow state/i.test(m)) return "used";
  return "other";
}

/** A Supabase session cookie for this project (not the sign-in's verifier cookie). */
export function hasSessionCookie(names: readonly string[], ref: string): boolean {
  const re = new RegExp(`^sb-${ref.replace(/[^a-z0-9]/gi, "")}-auth-token(\\.\\d+)?$`);
  return names.some((n) => re.test(n));
}

export function readWhy(x: string | null | undefined): Why | null {
  return WHYS.includes(x as Why) ? (x as Why) : null;
}

const TEXT: Record<Why, string> = {
  denied: "Google sign-in was cancelled. Tap Continue with Google to try again.",
  again: "Almost done. Tap Continue with Google once more. If it still doesn't work, log in with your phone number below.",
  google: "Google couldn't sign you in just now. Try again, or log in with your phone number below.",
  lost: "Google said yes, but this browser lost the sign-in on the way back. Tap Continue with Google again and stay in this browser until it finishes.",
  used: "That sign-in was already used. Tap Continue with Google to sign in again.",
  expired: "That sign-in took too long and ran out. Tap Continue with Google to try again.",
  slow: "Signing in is taking longer than usual. Tap Continue with Google to try again.",
  other: "Couldn't finish signing you in. Tap Continue with Google to try again.",
  // error=account: the sign-in worked, but this Google account opens no TapTurf account right now.
  linking:
    "You were adding this Google account to a TapTurf account that logs in with a phone number. Finish it on that phone, or wait 10 minutes and try again.",
  replaced:
    "This Google account was taken off your TapTurf account. Log in with your phone number, or add it again from your profile.",
};

/** The line /login shows for ?error= and ?why=, or null. */
export function loginErrorText(error: string | null | undefined, why: string | null | undefined): string | null {
  if (error !== "oauth" && error !== "callback" && error !== "account") return null;
  return TEXT[readWhy(why) ?? (error === "oauth" ? "denied" : "other")];
}

import { hasSignIn, signInKnown, signInToken } from "@/lib/account/client";
import type { LiveToken } from "./live";

/** As long as a cold Google session may take to be read on a page load. */
const KNOWN_WAIT_MS = 5_000;

/**
 * This device's sign-in for a live link's code and each send (useLiveSync's
 * token), read fresh every time and quietly (it never signs anyone out).
 * Right after a page load AuthProvider may not know yet: a send then waits
 * for it rather than going out as signed out, and is tried again later if
 * it still does not know. Kept out of ./live.ts, whose tests compile it on
 * its own.
 */
export async function liveToken(): Promise<LiveToken> {
  if (hasSignIn() === null) await signInKnown(KNOWN_WAIT_MS);
  if (hasSignIn() === null) return { unknown: true };
  return signInToken();
}

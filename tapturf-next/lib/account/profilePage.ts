import { revalidatePath } from "next/cache";
import type { AccountProfile } from "./types";

/**
 * After a change that can give or take the verified tick (Google added
 * or removed, a number added, confirmed, changed or removed): the public
 * profile page shows the tick and is cached for a minute, so it is
 * refreshed now. Only for a page that is shown (a username, tagging on)
 * and a database that has the tick. Never throws. Relative imports only
 * (npm run test:account).
 */
export function refreshTickPage(p: AccountProfile): void {
  if (!p.username || !p.taggable || p.verified === null) return;
  try {
    revalidatePath(`/u/${p.username}`);
  } catch (e) {
    console.warn("account: profile page refresh failed", e);
  }
}

/**
 * After a change to what the public profile page shows (the photo): it is
 * cached for a minute, so it is refreshed now. Only for a page that is
 * shown (a username, tagging on). Never throws.
 */
export function refreshProfilePage(p: AccountProfile): void {
  if (!p.username || !p.taggable) return;
  try {
    revalidatePath(`/u/${p.username}`);
  } catch (e) {
    console.warn("account: profile page refresh failed", e);
  }
}

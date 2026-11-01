import { buildPassport, publicPassport, type PublicPassport } from "./passport";
import { profileOwner, readHistory } from "./server";

/**
 * The numbers, medals and reviewed turfs on a public profile (/u/<username>):
 * publicPassport only, so never where or when they played, or who with.
 * Null before 20261101_played_with.sql (the page can't tell whose games are
 * whose) or when a read fails: the page then shows the profile without
 * them rather than failing. Server only.
 */
export async function loadPublicPassport(username: string): Promise<PublicPassport | null> {
  try {
    const owner = await profileOwner(username);
    if (!("ok" in owner) || !owner.ok) return null;
    const history = await readHistory(owner.ok);
    return publicPassport(buildPassport({ userId: owner.ok, ...history, since: null, now: Date.now() }));
  } catch (e) {
    console.warn("profile: passport read failed", e);
    return null;
  }
}

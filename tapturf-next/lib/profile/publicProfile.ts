import { createReadOnlyClient } from "../supabase/server";
import type { PublicPassport } from "./passport";
import { publicPassportOf } from "./publicPassport";
import { profileOwner, readHistory, readRosters } from "./server";

/** A public profile as profile_get gives it: only for people who left "Let others find and tag me" on. */
export type PublicProfile = { u: string; name: string; photo: string | null; since: string | null; verified: boolean };
/** The profile; where an old username points now; null when there is none to show. */
export type FoundProfile = { profile: PublicProfile } | { movedTo: string } | null;

/**
 * Who /u/<username> is, and whether there is a public profile at all: the
 * one check behind the page (app/u/[username]/page.tsx) and the medals'
 * story picture (GET /api/og/medals/<username>), so the picture is served
 * exactly where the page is. Throws when the database cannot be read, so
 * an outage is never cached as "no such player". Server only.
 */
export async function readPublicProfile(raw: string): Promise<FoundProfile> {
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(raw)) return null;
  const { data, error } = await createReadOnlyClient().rpc("profile_get", { p_username: raw.toLowerCase() });
  if (error) throw new Error(`profile_get failed: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.moved_to === "string") return { movedTo: d.moved_to };
  if (typeof d.u !== "string" || typeof d.name !== "string") return null;
  return {
    profile: {
      u: d.u,
      name: d.name,
      photo: typeof d.photo === "string" ? d.photo : null,
      since: typeof d.since === "string" ? d.since : null,
      verified: d.verified === true,
    },
  };
}

/**
 * The numbers, medals and reviewed turfs on a public profile (/u/<username>):
 * publicPassport only, so never where or when they played, or who with
 * (their Turfers is a count). Null before 20261101_played_with.sql (the
 * page can't tell whose games are whose) or when a read fails: the page
 * then shows the profile without them rather than failing. Server only.
 */
export async function loadPublicPassport(username: string): Promise<PublicPassport | null> {
  try {
    const owner = await profileOwner(username);
    if (!("ok" in owner) || !owner.ok) return null;
    return await publicPassportOf(owner.ok, { history: readHistory, rosters: readRosters, now: Date.now });
  } catch (e) {
    console.warn("profile: passport read failed", e);
    return null;
  }
}

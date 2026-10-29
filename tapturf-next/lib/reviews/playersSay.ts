import { mentionsBookingApp, scrubBookingApps } from "../utils/bookingApps";

/** turfs.review_summary as the page and Ask read it (lib/queries/turfs.ts toPlayersSay). */
export type PlayersSay = { summary: string; likes: string[]; gripes: string[]; based_on: number; sources: string[] };

/**
 * "What players say" as the turf page shows it and Ask reads it: the
 * summary of the written reviews without any booking app (the reviews it
 * was made from can name one), or null when nothing is left. Pure.
 */
export function playersSayOf(s: PlayersSay | null | undefined): PlayersSay | null {
  if (!s) return null;
  const out = {
    ...s,
    summary: scrubBookingApps(s.summary) ?? "",
    likes: s.likes.filter((l) => !mentionsBookingApp(l)),
    gripes: s.gripes.filter((g) => !mentionsBookingApp(g)),
  };
  return out.summary || out.likes.length || out.gripes.length ? out : null;
}

import type { StoreEntry } from "../tournament/store";
import type { MineItem } from "../tournament/types";

/**
 * "My tournaments" on the Me tab's Matches: the live tournaments kept
 * with this account (GET /api/tournament/mine), then any this phone runs
 * that are not kept with it yet (lib/tournament/store.ts), newest first.
 * Each opens its page; on a phone that does not hold a tournament's key
 * the page is asked to manage it from here (?manage=1). The same rows the
 * list had under every tab before it moved here. Pure, relative imports
 * only (npm run test:matches).
 */

const FORMAT: Record<MineItem["format"], string> = { league: "League", bilateral: "Series", tri: "Tri-series" };

export type TournamentRow = { code: string; name: string; sub: string; here: boolean; href: string };

export const TOURNAMENTS_MAX = 12;

/** list null: the account's can't be read (signed out, offline, before the database has them); this phone's still show. */
export function tournamentRows(list: readonly MineItem[] | null, here: Record<string, StoreEntry>): TournamentRow[] {
  const out: TournamentRow[] = (list ?? []).map((t) => {
    const held = !!here[t.code];
    return { code: t.code, name: t.name, sub: `${FORMAT[t.format]} · ${t.teams} teams · ${t.played} of ${t.fixtures} played`, here: held, href: `/tournament/${t.code}${held ? "" : "?manage=1"}` };
  });
  for (const [code, e] of Object.entries(here).sort((a, b) => b[1].at - a[1].at)) {
    if (!out.some((r) => r.code === code)) out.push({ code, name: e.name || "Tournament", sub: "Run from this phone", here: true, href: `/tournament/${code}` });
  }
  return out.slice(0, TOURNAMENTS_MAX);
}

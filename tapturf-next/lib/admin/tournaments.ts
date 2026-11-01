/**
 * Live tournaments for the admin (admin_tournaments, owner only,
 * 20261102_live_tournaments.sql): one row per tournament with what it is,
 * its counts, matches being scored live now, its views and the account it
 * is kept with when the organiser was signed in; and the totals the admin
 * home's Tournaments line shows. Pure; relative imports only, tested in
 * tournaments.test.ts (npm run test:tournament).
 */

export type AdminTournament = {
  code: string;
  name: string;
  /** "League + semi-finals", "Tri-series", "Bilateral series". */
  format: string;
  status: "on" | "removed";
  teams: number;
  fixtures: number;
  played: number;
  liveNow: number;
  views: number;
  viewers: number;
  /** The account it is kept with (for /admin?person=<id>), null for one made signed out. */
  organiser: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const count = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The format and playoffs in the admin's words. */
export function adminFormat(format: unknown, playoffs: unknown): string {
  const base = format === "bilateral" ? "Bilateral series" : format === "tri" ? "Tri-series" : "League";
  return playoffs === "semis" ? `${base} + semi-finals` : playoffs === "final" ? `${base} + final` : base;
}

export function toAdminTournament(r: Record<string, unknown>): AdminTournament {
  const id = typeof r.organiser_id === "string" && UUID.test(r.organiser_id) ? r.organiser_id.toLowerCase() : null;
  const views = count(r.views);
  return {
    code: String(r.code ?? ""),
    name: str(r.name) ?? "",
    format: adminFormat(r.format, r.playoffs),
    status: r.status === "removed" ? "removed" : "on",
    teams: count(r.teams),
    fixtures: count(r.fixtures),
    played: count(r.played),
    liveNow: count(r.live_now),
    views,
    viewers: Math.min(count(r.viewers), views),
    organiser: id ? { id, name: str(r.organiser_name) } : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

/** The admin home's line: how many (and this week), matches live now, views, kept with an account. */
export function tournamentTotals(list: AdminTournament[], now: number): { total: number; last7: number; liveNow: number; views: number; viewers: number; signedIn: number } {
  let last7 = 0;
  let liveNow = 0;
  let views = 0;
  let viewers = 0;
  let signedIn = 0;
  for (const t of list) {
    const at = Date.parse(t.createdAt);
    if (Number.isFinite(at) && now - at < 7 * 86_400_000) last7++;
    liveNow += t.status === "on" ? t.liveNow : 0;
    views += t.views;
    viewers += t.viewers;
    if (t.organiser) signedIn++;
  }
  return { total: list.length, last7, liveNow, views, viewers, signedIn };
}

/**
 * Who started each live scoreboard link, for /admin/live and the admin
 * home's latest link (admin_live_links2, 20261029_live_link_starts.sql):
 * the account that turned it on, as the server verified it on the link's
 * first write. Links from before that, and every link while the file is
 * not applied, say "Not recorded": nothing here guesses from times or
 * sign-ins. Pure; relative imports only (npm run test:live).
 */

export type LiveStarter = {
  /** The account, for the admin's people list (/admin?person=<id>#people). */
  id: string;
  name: string | null;
  username: string | null;
  method: "google" | "phone" | null;
  /** When it was recorded. */
  at: string | null;
};

/** One link as admin_live_links returns it (admin_live_links2 adds the starter_* columns). */
export type AdminLiveLink = {
  code: string;
  status: string;
  sport: string | null;
  team_a: string | null;
  team_b: string | null;
  title: string | null;
  venue: string | null;
  events: number;
  writes: number;
  created_at: string;
  updated_at: string;
  /** null: not recorded. */
  starter: LiveStarter | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A row of either read; one without a starter (admin_live_links, or a link with none recorded) gets null. */
export function toAdminLiveLink(row: Record<string, unknown>): AdminLiveLink {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const id = typeof row.starter_id === "string" && UUID.test(row.starter_id) ? row.starter_id.toLowerCase() : null;
  const username = str(row.starter_username);
  const method = row.starter_method === "google" || row.starter_method === "phone" ? row.starter_method : null;
  return {
    code: String(row.code ?? ""),
    status: String(row.status ?? ""),
    sport: str(row.sport),
    team_a: str(row.team_a),
    team_b: str(row.team_b),
    title: str(row.title),
    venue: str(row.venue),
    events: n(row.events),
    writes: n(row.writes),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    starter: id ? { id, name: str(row.starter_name), username: username && USERNAME.test(username) ? username : null, method, at: str(row.started_at) } : null,
  };
}

export const methodLabel = (m: LiveStarter["method"]): string => (m === "google" ? "Google" : m === "phone" ? "Phone" : "Sign-in");

/** Who started it, in a word or two. */
export const starterName = (s: LiveStarter | null): string => (s ? s.name || (s.username ? `@${s.username}` : "No name on the account") : "Not recorded");

/**
 * A starter recorded this long after the link began came from a later
 * signed-in write: a link from before the check, or one that began before
 * 20261029_live_link_starts.sql was applied (recording waited for it).
 */
const LATER_MS = 10 * 60_000;

/** Whether the starter was recorded well after the link began, by a later signed-in write from the browser holding its secret. */
export function recordedLater(link: Pick<AdminLiveLink, "created_at" | "starter">): boolean {
  const a = Date.parse(link.created_at);
  const b = link.starter?.at ? Date.parse(link.starter.at) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b - a > LATER_MS;
}

/** The line under the latest link's name on the admin home: what it is, how it stands, and how it was signed in. */
export function latestLinkSub(link: AdminLiveLink, ago: string): string {
  const what = link.sport ? (link.sport === "cricket" ? "Cricket" : link.sport.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())) : null;
  const state = link.status === "live" ? "live now" : link.status === "done" ? "finished" : link.status;
  const who = link.starter ? [link.starter.username ? `@${link.starter.username}` : null, methodLabel(link.starter.method)].filter(Boolean).join(" · ") : null;
  return [what, state, `started ${ago}`, who].filter(Boolean).join(" · ");
}

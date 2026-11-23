import { SPORT_LIST } from "../board/sports";
import { LIVE_IDLE_CLOSE_MS } from "../live/types";
import { MEDALS, isToolMedal } from "../profile/medals";
import { tally } from "../turfSession/tally";
import type { Session } from "../turfSession/types";
import { linkState, sidesTitle, type MineLink } from "./links";

/**
 * The rest of the Me tab's Matches (the site owner, 23 Nov 2026): what
 * this phone holds that is not in the account (a Live Cricket Scorer
 * match, a Live Scoreboard, a turf session), which of the server's live
 * links this phone can go on scoring, the tab's count, the empty state's
 * choice and the shortcuts into the tools. The stores are read by their
 * own readers in the browser (components/dashboard/useMatches.ts); this
 * file only works on what they hand over. Pure, relative imports only,
 * tested in matches.test.ts (npm run test:matches).
 */

/** A match as the scorers' own lists have it (components/tools/scorer/storage.ts MatchMeta, board/storage.ts BoardMeta). */
export type SavedMatch = { id: string; teamA: string; teamB: string; headline: string; status: "live" | "done"; updatedAt: number; sport?: string };
/** A live link's record on this phone (lib/live/types.ts LiveLinkRecord), by the match's id. */
export type LinkRecords = Record<string, { code: string; on: boolean }>;

export type PhoneStores = {
  scorer: readonly SavedMatch[];
  boards: readonly SavedMatch[];
  sessions: readonly Session[];
  links: LinkRecords;
};

export const EMPTY_STORES: PhoneStores = { scorer: [], boards: [], sessions: [], links: {} };

/** Which tool a thing on this phone opens in, and the store whose "current" brings it up there. */
export type PhoneKind = "cricket" | "board" | "session";

export const PHONE_HREF: Record<PhoneKind, string> = {
  cricket: "/tools/cricket-live-scorer",
  board: "/tools/live-scoreboard",
  session: "/tools/turf-session",
};

export type PhoneItem = {
  kind: PhoneKind;
  id: string;
  /** "Titans vs Royals". */
  title: string;
  /** The score line or result as the tool's own list has it; null when there is none to say. */
  line: string | null;
  /** "Cricket", "Football", "Turf session · 3 matches". */
  what: string;
  /** Still to be finished. */
  open: boolean;
  /** "In progress" or "Finished" ("Ended" for a session). */
  state: string;
  updatedAt: number;
  href: string;
};

/** At most this many are listed; the tools keep the rest (25 matches each, 10 sessions). */
export const PHONE_MAX = 10;

const boardSport = (sport: string | undefined): string => {
  const s = SPORT_LIST.find((x) => x.sport === sport);
  return s && s.sport !== "other" ? s.label : "Scoreboard";
};

/** The live link codes this phone holds a key to that are on, by code: which saved match each belongs to. */
function heldCodes(stores: PhoneStores): Map<string, { kind: "cricket" | "board"; id: string }> {
  const scorer = new Set(stores.scorer.map((m) => m.id));
  const boards = new Set(stores.boards.map((m) => m.id));
  const out = new Map<string, { kind: "cricket" | "board"; id: string }>();
  for (const [id, rec] of Object.entries(stores.links)) {
    if (!rec || !rec.on || typeof rec.code !== "string") continue;
    if (boards.has(id)) out.set(rec.code, { kind: "board", id });
    else if (scorer.has(id)) out.set(rec.code, { kind: "cricket", id });
  }
  return out;
}

/**
 * The saved match on this phone that a live link is the link of, when this
 * phone holds the link's key and still has the match: "Continue scoring"
 * opens it. null on any other phone.
 */
export function heldMatch(code: string, stores: PhoneStores): { kind: "cricket" | "board"; id: string } | null {
  return heldCodes(stores).get(code) ?? null;
}

/**
 * What this phone holds that the server's list does not show: every saved
 * scorer match and board whose live link (if it has one) is not in
 * `shown`, and every turf session. A session's own matches are the
 * session's, not listed again. Unfinished first, each group by its last
 * change, newest first; PHONE_MAX at most.
 */
export function phoneItems(stores: PhoneStores, shown: ReadonlySet<string>, max = PHONE_MAX): { items: PhoneItem[]; more: number } {
  const ofSessions = new Set(stores.sessions.flatMap((s) => s.matches.map((m) => m.matchId).filter((id): id is string => !!id)));
  const onServer = (id: string) => {
    const rec = stores.links[id];
    return !!rec && rec.on && shown.has(rec.code);
  };
  const all: PhoneItem[] = [];
  for (const m of stores.scorer) {
    if (ofSessions.has(m.id) || onServer(m.id)) continue;
    all.push({ kind: "cricket", id: m.id, title: sidesTitle(m.teamA ?? "", m.teamB ?? "", "Cricket match"), line: lineOf(m), what: "Cricket", open: m.status === "live", state: m.status === "live" ? "In progress" : "Finished", updatedAt: m.updatedAt, href: PHONE_HREF.cricket });
  }
  for (const b of stores.boards) {
    if (onServer(b.id)) continue;
    const what = boardSport(b.sport);
    all.push({ kind: "board", id: b.id, title: sidesTitle(b.teamA ?? "", b.teamB ?? "", `${what} match`), line: lineOf(b), what, open: b.status === "live", state: b.status === "live" ? "In progress" : "Finished", updatedAt: b.updatedAt, href: PHONE_HREF.board });
  }
  for (const s of stores.sessions) {
    const t = tally(s);
    const n = s.matches.length;
    all.push({
      kind: "session",
      id: s.id,
      title: sidesTitle(s.sides.a.name, s.sides.b.name, "Turf session"),
      line: t.played ? t.line : null,
      what: `Turf session · ${n} ${n === 1 ? "match" : "matches"}`,
      open: s.ended === null,
      state: s.ended === null ? "In progress" : "Ended",
      updatedAt: s.updatedAt,
      href: PHONE_HREF.session,
    });
  }
  all.sort((x, y) => Number(y.open) - Number(x.open) || y.updatedAt - x.updatedAt || (x.id < y.id ? -1 : 1));
  return { items: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** A saved match's line: its score or result, unless it only repeats the two sides (nothing scored yet). */
function lineOf(m: SavedMatch): string | null {
  const line = typeof m.headline === "string" ? m.headline.trim() : "";
  return line && line !== sidesTitle(m.teamA ?? "", m.teamB ?? "", "") ? line : null;
}

/** Being scored on this phone right now: unfinished, and changed within the 2 hours a live link itself stays open. */
export function phoneLive(items: readonly Pick<PhoneItem, "open" | "updatedAt">[], now: number): number {
  return items.filter((i) => i.open && now - i.updatedAt < LIVE_IDLE_CLOSE_MS).length;
}

/**
 * The tab's count: only what is live right now (a link taking updates, or
 * a match being scored on this phone that the list above does not show),
 * never a total. 0 shows no badge.
 */
export function liveNow(links: readonly Pick<MineLink, "status" | "updatedAt" | "code">[] | null, stores: PhoneStores, now: number): number {
  const live = (links ?? []).filter((l) => linkState(l, now) === "live");
  const shown = new Set((links ?? []).map((l) => l.code));
  return live.length + phoneLive(phoneItems(stores, shown, Infinity).items, now);
}

/** loading: nothing is said yet. empty: nothing of theirs anywhere, so the tools are offered. full: the lists, then the shortcuts. */
export type MatchesShape = "loading" | "empty" | "full";

/**
 * What the tab shows. The server's two lists may still be on their way
 * (undefined) or not readable (null: before the migration too, or
 * offline); a list that can't be read counts as none, so the tab is never
 * blank and never fails.
 */
export function matchesShape(x: { links: readonly unknown[] | null | undefined; tournaments: number | undefined; phone: number }): MatchesShape {
  const any = (x.links?.length ?? 0) + (x.tournaments ?? 0) + x.phone > 0;
  if (any) return "full";
  return x.links === undefined || x.tournaments === undefined ? "loading" : "empty";
}

/** The ways in: the same four in the empty state (with their lines) and, compact, at the foot of a full tab. */
export const SHORTCUTS = [
  { key: "score", label: "Score a match", line: "Cricket, ball by ball, with a live link to share.", href: "/tools/cricket-live-scorer" },
  { key: "tournament", label: "Run a tournament", line: "Fixtures, a points table and live scores on one page.", href: "/tournament/new" },
  { key: "toss", label: "Toss", line: "Flip a coin for who bats first.", href: "/tools/cricket-toss" },
  { key: "teams", label: "Split teams", line: "Fair sides from a list of names.", href: "/tools/cricket-team-generator" },
] as const;

/** Football, badminton and the rest are scored on the Live Scoreboard; said once, under the shortcuts. */
export const OTHER_SPORTS = { label: "Live Scoreboard", href: "/tools/live-scoreboard" } as const;

const TOOL_MEDALS = MEDALS.filter(isToolMedal);

/** "3 of 11": how many of the tool medals are among the earned ones (lib/profile/medals.ts; the total is never typed in). */
export function toolMedalCount(earned: readonly string[]): { earned: number; of: number } {
  const have = new Set(earned);
  return { earned: TOOL_MEDALS.filter((m) => have.has(m.id)).length, of: TOOL_MEDALS.length };
}

/** The pointer to the Passport's medals: "3 of 11 medals from the free tools". */
export function toolMedalWords(earned: readonly string[]): string {
  const c = toolMedalCount(earned);
  return `${c.earned} of ${c.of} medals from the free tools`;
}

export const TOOL_MEDALS_HREF = "/dashboard?tab=passport#medals";

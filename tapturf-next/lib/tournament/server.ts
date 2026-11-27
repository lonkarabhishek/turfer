import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { createReadOnlyClient } from "../supabase/server";
import { derive } from "../cricket/scoring";
import { getLive, liveWriteClient, liveWriteKey, type LiveRow } from "../live/server";
import { isLiveBoard, sanitizeLive } from "../live/match";
import { liveIdleClosed } from "../live/types";
import { toViewCount, type ViewCount } from "../live/views";
import { MAX_TRACKED, windowCounter } from "../limits";
import { accountRpcIfThere } from "../account/server";
import { later } from "../account/route";
import { ACTIVITY_UNKNOWN, pollActivity, toActivityRead, type ActivityRead } from "./activity";
import { mintTournamentCode } from "./codes";
import { HOST_UNKNOWN, hostCopyFresh, toHostRead, type HostRead } from "./host";
import { liveNowOf, liveResultOf, sameLiveResult } from "./live";
import { opData, toMine, toTournament } from "./read";
import { toLiveTournament, type LiveTournament } from "./scorecard";
import type { CreateInput } from "./payload";
import type { LiveNow, LiveResult, MineItem, Op, Tournament, TournamentError, TournamentGetResponse } from "./types";

/**
 * Server side of live tournaments: the reads followers share (the data
 * cache, purged by every change), the live scorecards of fixtures scored
 * live, the change and account calls, and a finished live scorecard's
 * result going onto its fixtures. Every call carries a server key
 * (20261102_live_tournaments.sql says which); the live write key also tags
 * the codes (lib/tournament/codes.ts). Relative imports only.
 */

/** The key the tournament functions check: the live write key. Unset means live tournaments are off. */
export const tournamentKey = (): string | null => liveWriteKey();

/** PostgREST's (and Postgres's) "no such function": the migration is not applied yet. */
export const missingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

/* ------------------------------------------------------------------ */
/* Ready                                                               */
/* ------------------------------------------------------------------ */

let readyAt = 0;
let readyWas = false;

/**
 * Whether live tournaments can be used here: the key is set and the
 * database has the functions (20261102_live_tournaments.sql). Remembered
 * 5 minutes when yes, 1 minute when no. Never throws.
 */
export async function tournamentsReady(): Promise<boolean> {
  const key = tournamentKey();
  if (!key) return false;
  if (Date.now() < readyAt) return readyWas;
  let yes = false;
  try {
    const { error } = await createReadOnlyClient().rpc("tournament_get", { p_key: key, p_code: null });
    yes = !error;
    if (error && !missingFn(error.code)) console.warn("tournament: ready check failed", error.code, error.message);
  } catch (e) {
    console.warn("tournament: ready check threw", e);
  }
  readyWas = yes;
  readyAt = Date.now() + (yes ? 5 : 1) * 60_000;
  return yes;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readTournament(code: string): Promise<Tournament | null> {
  const key = tournamentKey();
  if (!key) throw new Error("tournament read: no key");
  const { data, error } = await createReadOnlyClient().rpc("tournament_get", { p_key: key, p_code: code });
  // Thrown, so the data cache keeps its last copy instead of caching "not found" (lib/live/server.ts readLive).
  if (error) throw new Error(`tournament read failed: ${error.code} ${error.message}`);
  return toTournament(data);
}

const inflight = new Map<string, Promise<Tournament | null>>();

/**
 * One tournament as followers see it, from Next's data cache: every change
 * purges its tag (purgeTournament), so the database sees about one read
 * per change however many people follow (and the organiser's own read
 * after it, tournamentView fresh); 30 s caps how long a copy read
 * just before a change can outlive the purge. Throws when it could not be
 * read; null: no such tournament.
 */
export function getTournament(code: string): Promise<Tournament | null> {
  let p = inflight.get(code);
  if (!p) {
    p = unstable_cache(() => readTournament(code), ["tournament", code], { revalidate: 30, tags: [`tournament:${code}`] })().finally(() => {
      inflight.delete(code);
    });
    inflight.set(code, p);
  }
  return p;
}

export function purgeTournament(code: string): void {
  try {
    revalidateTag(`tournament:${code}`, { expire: 0 });
  } catch (e) {
    console.warn(`revalidateTag(tournament:${code}) failed`, e);
  }
}

/** Before 20261123_tournament_host.sql the function is not there: left alone a minute per instance. */
let hostOffUntil = 0;

/**
 * Who started it, straight from the database (public.tournament_host):
 * someone only when the organiser was signed in and has a public profile
 * at this moment. Never throws: a database without the function, a
 * refusal or a failed read is "could not be asked", which names nobody,
 * so a name is never shown on the strength of a read that didn't happen.
 */
async function readHost(code: string): Promise<HostRead> {
  const key = tournamentKey();
  if (!key || Date.now() < hostOffUntil) return HOST_UNKNOWN;
  try {
    const { data, error } = await createReadOnlyClient().rpc("tournament_host", { p_key: key, p_code: code });
    if (error) {
      if (missingFn(error.code)) hostOffUntil = Date.now() + 60_000;
      else console.warn("tournament: host read failed", code, error.code, error.message);
      return HOST_UNKNOWN;
    }
    return toHostRead(data);
  } catch (e) {
    console.warn("tournament: host read threw", code, e);
    return HOST_UNKNOWN;
  }
}

/**
 * The same from Next's data cache, beside the tournament's own copy: 30 s,
 * and the tournament's tag, so the organiser's changes (and the account
 * keeping it) refresh it. The switch that makes a profile public is asked
 * by every read and nothing purges this copy when it is turned off, so
 * the copy's age is the promise: the cache hands back a copy past its 30 s
 * while it fetches another behind it, however long nobody asked, and one
 * older than HOST_COPY_MAX_MS is never shown; the database is asked there
 * and then instead. While a page is being followed that is one read per
 * 30 s; after a quiet spell, one extra.
 */
export async function getTournamentHost(code: string): Promise<HostRead> {
  const read = async () => ({ ...(await readHost(code)), at: Date.now() });
  try {
    const copy = await unstable_cache(read, ["tournament-host", code], { revalidate: 30, tags: [`tournament:${code}`] })();
    if (hostCopyFresh(copy.at, Date.now())) return { known: copy.known === true, host: copy.host ?? null };
  } catch (e) {
    console.warn("tournament: host copy failed", code, e);
  }
  return readHost(code);
}

/** Before 20261128_tournament_activity.sql the function is not there: left alone a minute per instance. */
let activityOffUntil = 0;

/**
 * The tournament's log of changes, straight from the database
 * (public.tournament_activity): what followers could already see, noted as
 * it happened. Throws on a read that failed, so the data cache keeps its
 * last copy; a database without the function is "could not be asked".
 */
async function readActivity(code: string): Promise<ActivityRead> {
  const key = tournamentKey();
  if (!key || Date.now() < activityOffUntil) return ACTIVITY_UNKNOWN;
  const { data, error } = await createReadOnlyClient().rpc("tournament_activity", { p_key: key, p_code: code });
  if (error) {
    if (missingFn(error.code)) {
      activityOffUntil = Date.now() + 60_000;
      return ACTIVITY_UNKNOWN;
    }
    throw new Error(`tournament activity read failed: ${error.code} ${error.message}`);
  }
  return toActivityRead(data);
}

/**
 * The same from Next's data cache, beside the tournament's own copy: 30 s
 * and the tournament's tag, so every change that could add a line (the
 * organiser's, a finished live scorecard's result) purges it with the
 * tournament. fresh: past the shared copy, for the organiser's read right
 * after a change. Never throws: a failed read is "could not be asked",
 * and the tab shows what the page can work out.
 */
export async function getTournamentActivity(code: string, fresh = false): Promise<ActivityRead> {
  try {
    return fresh ? await readActivity(code) : await unstable_cache(() => readActivity(code), ["tournament-activity", code], { revalidate: 30, tags: [`tournament:${code}`] })();
  } catch (e) {
    console.warn("tournament: activity read failed", code, e);
    return ACTIVITY_UNKNOWN;
  }
}

/* ------------------------------------------------------------------ */
/* A live scorecard's tournament                                       */
/* ------------------------------------------------------------------ */

/** Before 20261123_tournament_host.sql the function is not there: not asked again for 10 minutes per instance, and never kept as "no tournament". */
let bannerOffUntil = 0;
class BannerOff extends Error {}

async function readLiveTournament(liveCode: string): Promise<LiveTournament | null> {
  const key = tournamentKey();
  if (!key || Date.now() < bannerOffUntil) throw new BannerOff();
  const { data, error } = await createReadOnlyClient().rpc("live_tournament", { p_key: key, p_live_code: liveCode });
  if (error) {
    if (missingFn(error.code)) {
      bannerOffUntil = Date.now() + 10 * 60_000;
      throw new BannerOff();
    }
    // Thrown, so the data cache keeps its last copy instead of "no tournament" (readTournament does the same).
    throw new Error(`live tournament read failed: ${error.code} ${error.message}`);
  }
  if ((data as { r?: unknown } | null)?.r === "unavailable") throw new Error("live tournament read: unavailable");
  return toLiveTournament(data);
}

/**
 * The tournament a live scorecard is a match of (public.live_tournament),
 * for the banner on /live/<code>; null for a scorecard that is no
 * tournament's, and whenever it can't be said (no function yet, a failed
 * read): the scorecard then looks as it always did. Never throws.
 *
 * Read by the scorecard page's server render only (never by a poll), from
 * the data cache in two steps, so a page view is not a database read.
 * Which tournament, by the live code: 5 minutes, purged when a fixture is
 * linked to that code (updateTournament), so a scorecard that is no
 * tournament's costs one small read per 5 minutes it is opened in. Then
 * the answer itself under the tournament's own tag: 30 s, and purged by
 * every change to that tournament (a result, a rename, a fixture taken
 * out or unlinked, the tournament taken down) exactly as its page is.
 */
export async function getLiveTournament(liveCode: string): Promise<LiveTournament | null> {
  try {
    const read = () => readLiveTournament(liveCode);
    const first = await unstable_cache(read, ["live-tournament", liveCode], { revalidate: 300, tags: [`live-tournament:${liveCode}`] })();
    if (!first) return null;
    return await unstable_cache(read, ["live-tournament", liveCode, first.code], { revalidate: 30, tags: [`tournament:${first.code}`] })();
  } catch (e) {
    if (!(e instanceof BannerOff)) console.warn("tournament: live tournament read failed", liveCode, e);
    return null;
  }
}

/** A fixture was just linked to this live code: its scorecard's "no tournament" copy goes. */
function purgeLiveTournament(liveCode: string): void {
  try {
    revalidateTag(`live-tournament:${liveCode}`, { expire: 0 });
  } catch (e) {
    console.warn(`revalidateTag(live-tournament:${liveCode}) failed`, e);
  }
}

/** Live results this instance already sent for a code and rev, so a page read does not send one again on every poll. */
const healed = new Set<string>();

/**
 * A linked live scorecard as its fixture's card shows it, read through the
 * live links' own cache (each scorer write purges it). A finished one whose
 * result the fixture does not have yet (the scorer's write that finished
 * it could not pass it on) sends it, after the reply.
 */
export async function liveOf(t: Tournament, f: Tournament["fixtures"][number], now: number): Promise<LiveNow | null> {
  const code = f.live;
  if (!code) return null;
  const home = t.teams.find((x) => x.id === f.home)?.name ?? "";
  const away = t.teams.find((x) => x.id === f.away)?.name ?? "";
  let row: LiveRow | null;
  try {
    row = await getLive(code);
  } catch (e) {
    console.warn("tournament: live read failed", code, e);
    return null;
  }
  if (!row) return liveNowOf({ status: "waiting", closed: false, updatedAt: null }, null, home, away);
  const match = row.match == null ? null : sanitizeLive(row.match);
  if (!match || isLiveBoard(match) || (row.status !== "live" && row.status !== "done")) return liveNowOf({ status: "off", closed: false, updatedAt: row.updated_at }, null, home, away);
  const view = derive(match);
  const closed = liveIdleClosed(row.status, Date.parse(row.updated_at), now);
  const card = liveNowOf({ status: view.status, closed, updatedAt: row.updated_at }, view, home, away);
  const lr = card.result;
  const k = `${code}:${row.rev}`;
  if (lr && !sameLiveResult(lr, f.liveResult) && !healed.has(k)) {
    if (healed.size >= MAX_TRACKED) healed.clear();
    healed.add(k);
    later(() => sendLiveResult(code, lr, row.rev));
  }
  return card;
}

/** At most this many linked scorecards are read for one tournament's page: the newest in the organiser's order. */
const LIVE_READS = 40;

/**
 * What GET /api/tournament/<code> serves: the tournament, for each
 * fixture scored live without a hand result its scorecard as it stands,
 * and who started it when that can be said (getTournamentHost; not asked
 * for one taken down). The page's first render and every poll carry the
 * organiser, so an open page drops a name that is no longer public at its
 * next poll. And the newest of its log of changes, for the Activity tab
 * (getTournamentActivity), in the same answer: no request of its own.
 * fresh: the tournament straight from the database, not the shared copy or
 * a read already under way that may predate a change (the organiser's
 * read right after one). Throws when the tournament could not be read;
 * null for none.
 */
export async function tournamentView(code: string, fresh = false): Promise<TournamentGetResponse | null> {
  const t = fresh ? await readTournament(code) : await getTournament(code);
  if (!t) return null;
  const now = Date.now();
  const linked = t.fixtures.filter((f) => f.live && !f.result).slice(-LIVE_READS);
  // The organiser is read beside the live scorecards, only for a tournament that is on. It never rejects.
  const [pairs, host, activity] = await Promise.all([
    Promise.all(linked.map(async (f) => [String(f.id), await liveOf(t, f, now)] as const)),
    t.status === "on" ? getTournamentHost(code) : HOST_UNKNOWN,
    // Its log of changes rides in the same answer (the newest few; the rest are asked for only when "Show all" is tapped). It never rejects.
    t.status === "on" ? getTournamentActivity(code, fresh) : ACTIVITY_UNKNOWN,
  ]);
  const live: Record<string, LiveNow> = {};
  for (const [id, l] of pairs) if (l) live[id] = l;
  return { tournament: t, live, at: Date.now(), ...(host.known ? { host: host.host } : {}), ...(activity.known ? { activity: pollActivity(activity.log) } : {}) };
}

/** The same, once per render: the page's metadata and body share one. */
export const tournamentViewForPage = cache(tournamentView);

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

const R: readonly TournamentError[] = ["forbidden", "gone", "taken", "limit", "busy", "slow", "bad", "login", "unavailable"];
const asError = (r: unknown): TournamentError => (typeof r === "string" && (R as readonly string[]).includes(r) && r !== "slow" ? (r as TournamentError) : "unavailable");

/** HTTP status per answer (lib/tournament/types.ts TournamentError). */
export function tournamentStatus(r: TournamentError | "ok"): number {
  return { ok: 200, forbidden: 403, gone: 410, taken: 409, limit: 429, busy: 503, slow: 429, bad: 400, login: 401, unavailable: 503 }[r];
}

/**
 * A new tournament: a code minted here, the setup, teams and fixtures in
 * one call. A code already in use (about never) gets one more go with
 * another. With a code given (a game's own, gameTournamentCode), that code
 * only: one go, and taken when it is in use. Never throws.
 */
export async function createTournament(input: CreateInput, ipHash: string, fixed?: string): Promise<{ code: string } | { error: TournamentError }> {
  const key = tournamentKey();
  if (!key) return { error: "unavailable" };
  const data = { name: input.name, settings: input.settings, teams: input.teams, fixtures: input.fixtures };
  for (let i = 0; i < (fixed ? 1 : 2); i++) {
    const code = fixed ?? mintTournamentCode(key);
    try {
      const { data: out, error } = await liveWriteClient().rpc("tournament_create", { p_key: key, p_code: code, p_secret: input.secret, p_data: data, p_ip_hash: ipHash });
      if (error) {
        if (!missingFn(error.code)) console.warn("tournament: create failed", error.code, error.message);
        return { error: "unavailable" };
      }
      const r = (out as { r?: unknown } | null)?.r;
      if (r === "ok") return { code };
      if (r === "taken" && fixed) return { error: "taken" };
      if (r === "taken") continue;
      if (r === "busy") console.warn("tournament: site-wide create cap reached");
      if (r !== "limit" && r !== "busy" && r !== "bad") console.warn("tournament: unexpected create answer", out);
      return { error: asError(r) };
    } catch (e) {
      console.warn("tournament: create threw", e);
      return { error: "unavailable" };
    }
  }
  return { error: "unavailable" };
}

/** One change with the organiser's secret: the new rev, or why not. Purges the cached copy on ok. Never throws. */
export async function updateTournament(code: string, secret: string, op: Op): Promise<{ rev: number } | { error: TournamentError }> {
  const key = tournamentKey();
  if (!key) return { error: "unavailable" };
  try {
    const { data, error } = await liveWriteClient().rpc("tournament_update", { p_key: key, p_code: code, p_secret: secret, ...opData(op) });
    if (error) {
      if (!missingFn(error.code)) console.warn("tournament: update failed", code, error.code, error.message);
      return { error: "unavailable" };
    }
    const d = (data ?? {}) as { r?: unknown; rev?: unknown };
    if (d.r === "ok" && Number.isSafeInteger(d.rev)) {
      purgeTournament(code);
      if (op.op === "live_link") purgeLiveTournament(op.liveCode);
      return { rev: d.rev as number };
    }
    if (d.r === "unavailable" || !R.includes(d.r as TournamentError)) console.warn("tournament: unexpected update answer", code, data);
    return { error: asError(d.r) };
  } catch (e) {
    console.warn("tournament: update threw", code, e);
    return { error: "unavailable" };
  }
}

/* ------------------------------------------------------------------ */
/* Live results                                                        */
/* ------------------------------------------------------------------ */

/** Before the migration the function is not there: said once, then left alone 10 minutes per instance. */
let liveResultsOffUntil = 0;

async function sendLiveResult(liveCode: string, lr: LiveResult, rev: number): Promise<void> {
  const key = tournamentKey();
  if (!key || Date.now() < liveResultsOffUntil) return;
  try {
    const { data, error } = await liveWriteClient().rpc("tournament_live_result", { p_key: key, p_live_code: liveCode, p_result: lr, p_rev: rev });
    if (error) {
      if (missingFn(error.code)) liveResultsOffUntil = Date.now() + 10 * 60_000;
      else console.warn("tournament: live result failed", liveCode, error.code, error.message);
      return;
    }
    const d = (data ?? {}) as { r?: unknown; codes?: unknown };
    if (d.r === "ok" && Array.isArray(d.codes)) {
      for (const c of d.codes) if (typeof c === "string") purgeTournament(c);
    } else if (d.r !== "none") {
      console.warn("tournament: unexpected live result answer", liveCode, data);
    }
  } catch (e) {
    console.warn("tournament: live result threw", liveCode, e);
  }
}

/**
 * After the live scorecard route took a write of a finished cricket match:
 * its result onto every fixture linked to that scorecard (none for most
 * scorecards: one quick call). Run it after the reply; it never throws.
 */
export async function recordTournamentResult(liveCode: string, match: unknown, rev: number): Promise<void> {
  try {
    const m = sanitizeLive(match);
    if (!m || isLiveBoard(m)) return;
    const lr = liveResultOf(derive(m));
    if (lr) await sendLiveResult(liveCode, lr, rev);
  } catch (e) {
    console.warn("tournament: live result threw", liveCode, e);
  }
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

type Claim = { kept: true; device: boolean } | { error: TournamentError | "other" };

/**
 * Keep the tournament with this account, from a browser holding its
 * secret; or, for the account it is already kept with, take this browser's
 * new secret as another device's. Never throws.
 */
export async function claimTournament(code: string, secret: string, userId: string): Promise<Claim> {
  const attach = await accountRpcIfThere("tournament_attach", { p_code: code, p_secret: secret, p_user_id: userId });
  if ("missing" in attach || "unavailable" in attach) return { error: "unavailable" };
  const a = attach.data.r;
  // Newly kept with an account: who started it may be nameable now, so the shared copies are read again.
  if (a === "ok") purgeTournament(code);
  if (a === "ok" || a === "known") return { kept: true, device: false };
  if (a === "other") return { error: "other" };
  if (a !== "forbidden") return { error: asError(a) };
  const add = await accountRpcIfThere("tournament_device_add", { p_code: code, p_user_id: userId, p_secret: secret });
  if ("missing" in add || "unavailable" in add) return { error: "unavailable" };
  const r = add.data.r;
  if (r === "ok" || r === "known") {
    purgeTournament(code);
    return { kept: true, device: true };
  }
  return { error: asError(r) };
}

/** The account's tournaments, newest first; null when they can't be read (before the migration too). */
export async function myTournaments(userId: string): Promise<MineItem[] | null> {
  const res = await accountRpcIfThere("tournament_mine", { p_user_id: userId });
  if ("missing" in res || "unavailable" in res || res.data.r !== "ok") return null;
  return toMine(res.data);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

let viewsMissingSaid = false;
function viewsFailed(what: string, code: string, e: { code?: string; message?: string }): null {
  if (!missingFn(e.code) || !viewsMissingSaid) console.warn(`tournament: ${what} failed`, code, e.code, e.message);
  if (missingFn(e.code)) viewsMissingSaid = true;
  return null;
}

/** Count one view; null when it could not be counted, "none" for a tournament that is not on. Never throws. */
export async function addTournamentView(code: string, unique: boolean): Promise<ViewCount | "none" | null> {
  const key = tournamentKey();
  if (!key) return null;
  try {
    const { data, error } = await liveWriteClient().rpc("tournament_view_add", { p_key: key, p_code: code, p_unique: unique });
    if (error) return viewsFailed("view count", code, error);
    if ((data as { r?: unknown } | null)?.r === "none") return "none";
    return toViewCount(data);
  } catch (e) {
    console.warn("tournament: view count threw", code, e);
    return null;
  }
}

async function readViews(code: string): Promise<ViewCount | null> {
  const key = tournamentKey();
  if (!key) return null;
  try {
    const { data, error } = await createReadOnlyClient().rpc("tournament_view_count", { p_key: key, p_code: code });
    if (error) return viewsFailed("view read", code, error);
    return toViewCount(data);
  } catch (e) {
    console.warn("tournament: view read threw", code, e);
    return null;
  }
}

/** A tournament's counts, from the data cache for 30 s (a count may lag). Never throws. */
export function readTournamentViews(code: string): Promise<ViewCount | null> {
  return unstable_cache(() => readViews(code), ["tournament-views", code], { revalidate: 30 })().catch(() => null);
}

/* ------------------------------------------------------------------ */
/* Route limits                                                        */
/* ------------------------------------------------------------------ */

/** New tournaments per network per 10 minutes, per instance (the database allows 5 an hour, 20 a day). */
export const CREATES_PER_10_MIN = 10;
/** Changes per network per minute, per instance: entering a round of results is a dozen. */
export const CHANGES_PER_MIN = 60;

/** Per-instance soft limits, before any database call. The real limits are in the functions. */
export function createTournamentLimiter(now: () => number = Date.now) {
  const creates = windowCounter(CREATES_PER_10_MIN, 10 * 60_000, now);
  const changes = windowCounter(CHANGES_PER_MIN, 60_000, now);
  return { create: (net: string) => creates(net), change: (net: string) => changes(net) };
}

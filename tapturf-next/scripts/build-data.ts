/**
 * The build-data step. `npm run build` runs it before `next build`
 * (scripts/build.ts); `npm run build:data -- <folder>` runs it alone.
 *
 * It reads every row the prerendered pages share, once, and writes the
 * answers to the folder (lib/build/data.ts says what each file holds);
 * the pages then read the files, and page generation sends the database
 * nothing. Until 29 Oct each of the 3 build workers read the whole turf
 * list and every shared read again, up to about 20 requests at once, and
 * a read that timed out failed the deploy (3 of 60 builds in a day) while
 * the live site's reads on the same database timed out too.
 *
 * - The reads every page needs, one request at a time, waiting a slow or
 *   briefly unreachable database out for up to 6 minutes (patient fetch:
 *   lib/build/patient.ts). After that the step fails and production keeps
 *   the last deploy, as a failed build always did.
 * - An answer that cannot be right (no turfs, no cities where thousands
 *   exist) is read again; any other wrong answer fails the step at once and
 *   says what was wrong. Nothing partial is ever recorded.
 * - Then the turf facts, with 2 minutes of their own. Their read never
 *   failed a page (getTurfFacts), so it never fails the step: when it
 *   fails, the step notes that, and pages build without the facts and
 *   without a read of their own (snippets then leave out "Call or
 *   WhatsApp", as they did when the pages' own read failed).
 * - Production only: the turf pages to prerender, 3 at a time, for 4
 *   minutes. A key is recorded only with everything its page reads; one
 *   the step could not read renders on its first visit instead. A failed
 *   turf_managers read does not cost the key: the page builds as it
 *   renders when that read fails (no "Managed by" line, kept a minute). If
 *   the database is failing when the time is up (keys left unread and the
 *   last 5 tries failed), the step fails: a deploy then would leave those
 *   pages to render against a failing database. Keys that used up their
 *   tries before then (a turf whose read keeps failing) do not fail it.
 * - Then the list version once more, as patiently as the first reads: a
 *   database that went down at the very end is waited out (or fails the
 *   step), and a list rebuilt meanwhile is read again, so list pages go
 *   live with rows about as fresh as before.
 *
 * Rows are written to the folder only (scripts/build.ts removes it), never
 * printed: turf_page answers carry owners' numbers.
 */
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { headerOk, sameBuild, unusable, type ListMeta, type ListPart } from "../lib/cache/rowStore";
import {
  CARD_COLUMNS,
  istToday,
  PRERENDERED_TURF_PAGES,
  readAvailableGames,
  readCardRows,
  readCityCountRows,
  readGameTurfs,
  readOpenGames,
  readSitemapGames,
  readSitemapTurfs,
  readTrendingRows,
  readTurfFactRows,
  topTurfKeys,
  ymd,
} from "../lib/build/reads";
import { datasetFile, FAILED, isFailed, MANIFEST, type BuildDatasets, type DatasetName, type Manifest } from "../lib/build/data";
import { backoffMs, createPatientFetch, readEach, type PatientStats } from "../lib/build/patient";
import { turfFactsFrom } from "../lib/seo/turfFacts";
import { turfPagePayload } from "../lib/turfPage/shape";

type Row = Record<string, unknown>;
type Env = Record<string, string | undefined>;

/** How long the reads every page needs may take, and again the list's re-check. */
const REQUIRED_MS = 6 * 60_000;
/** How long the turf facts may take; after that pages build without them. */
const FACTS_MS = 2 * 60_000;
/** How long turf pages are read; keys not done by then render on their first visit. */
const TURF_PAGES_MS = 4 * 60_000;
const TURF_PAGE_READS = 3;
const TURF_PAGE_TRIES = 4;
/** List parts of two builds: read again from part 0 at most this often. */
const LIST_STARTS = 3;

const REDEPLOY = "production keeps the last deploy; redeploy when it is back.";
export const UNREACHABLE = `build data: the database did not answer for 6 min; ${REDEPLOY}`;

/** The step failed: the message is for the build log, and the build stops. */
export class StepFailed extends Error {}
/** An answer that cannot be right (no rows where thousands exist): read again. */
class Empty extends Error {}
/** List parts of two builds (rebuilt mid-read): start again from part 0. */
class Mismatch extends Error {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Ctx = { db: SupabaseClient; stats: PatientStats; deadline: number; now: () => number; log: (msg: string) => void; sleep: (ms: number) => Promise<void> };

/** read() until it answers, or fail the step: at once for a wrong answer, at the deadline for no answer. */
async function required<T>(ctx: Ctx, what: string, read: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    const gaveUp = ctx.stats.gaveUp;
    try {
      return await read();
    } catch (e) {
      if (e instanceof StepFailed) throw e;
      // The patient fetch tried until the deadline: no answer, not a wrong one.
      if (ctx.stats.gaveUp > gaveUp || ctx.now() >= ctx.deadline) throw new StepFailed(`${UNREACHABLE} (${what}: ${message(e)})`, { cause: e });
      if (!(e instanceof Empty)) throw new StepFailed(`build data: ${what} failed: ${message(e)}`, { cause: e });
      const wait = backoffMs(tries);
      if (ctx.now() + wait > ctx.deadline) throw new StepFailed(`${UNREACHABLE} (${what}: ${e.message})`, { cause: e });
      ctx.log(`build data: ${what}: ${e.message}; reading again in ${(wait / 1000).toFixed(1)} s`);
      await ctx.sleep(wait);
    }
  }
}

/** A PostgREST answer's rows, or a throw with its error. */
async function answer<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null) throw new Error(`${what}: no answer`);
  return data;
}

async function listMeta(db: SupabaseClient): Promise<ListMeta | null> {
  const { data, error } = await db.rpc("turf_list_version");
  if (error) throw new Error(`turf_list_version: ${error.message}`);
  if (data !== null && (typeof data !== "object" || typeof (data as ListMeta).v !== "number")) throw new Error(`turf_list_version sent ${typeof data}, not a version`);
  return data as ListMeta | null;
}

/**
 * The list as the row store would load it (lib/cache/rowStore.ts, same
 * checks): every part of the meta's one build, adding up to its rows; or,
 * when no snapshot is usable by the store's rule, the table's rows.
 */
async function readList(ctx: Ctx): Promise<BuildDatasets["list"]> {
  for (let start = 1; ; start++) {
    const meta = await listMeta(ctx.db);
    if (unusable(meta, CARD_COLUMNS)) {
      const rows = await readCardRows(ctx.db);
      if (rows.length === 0) throw new Empty("the turfs table read returned no active turfs");
      return { meta, parts: null, rows };
    }
    const m = meta!;
    if (!(m.n > 0)) throw new Empty(`turf list v${m.v} has no rows`);
    try {
      const parts: ListPart<Row>[] = [];
      for (let i = 0; i < m.parts; i++) {
        const { data, error } = await ctx.db.rpc("turf_list_part", { p_part: i });
        if (error) throw new Error(`turf_list_part ${i}: ${error.message}`);
        const p = data as ListPart<Row> | null;
        if (!sameBuild(p, m) || (i === 0 && !headerOk(p!))) throw new Mismatch(`turf list part ${i} is not from v${m.v}`);
        parts.push(p!);
      }
      const n = parts.reduce((sum, p) => sum + p.rows.length, 0);
      if (parts.length === 0 || n !== m.n) throw new Mismatch(`turf list v${m.v} has ${n} rows in ${parts.length} parts, not ${m.n} in ${m.parts}`);
      return { meta: m, parts, rows: null };
    } catch (e) {
      if (!(e instanceof Mismatch)) throw e;
      if (start >= LIST_STARTS) throw new StepFailed(`build data: the turf list kept changing while it was read (${e.message})`);
      ctx.log(`build data: ${e.message}; reading the list again`);
    }
  }
}

const listRows = (list: BuildDatasets["list"]): Row[] => list.rows ?? (list.parts ?? []).flatMap((p) => p.rows);

/** A list read again is needed when the version moved (or, read from the table, when the list was built again). */
function listMoved(was: ListMeta | null, now: ListMeta | null): boolean {
  const whyWas = unusable(was, CARD_COLUMNS);
  const whyNow = unusable(now, CARD_COLUMNS);
  if ((whyWas === null) !== (whyNow === null)) return true;
  if ((was?.v ?? 0) !== (now?.v ?? 0)) return true;
  return whyNow !== null && was?.built !== now?.built;
}

type GameRead = BuildDatasets["games"]["open"];

async function gamesWithTurfs(db: SupabaseClient, games: Row[], { card = false } = {}): Promise<GameRead> {
  const ids = [...new Set(games.map((g) => g.turf_id).filter((id): id is string => typeof id === "string" && !!id))];
  return { games, turfs: ids.length ? await answer(readGameTurfs(db, ids, { card }), "games' turfs") : [] };
}

type TurfPage = { data: unknown; turfId: string; managers?: unknown };

/**
 * One turf page's reads: its turf_page answer and, for a claimed turf,
 * turf_managers. null: no such turf (skipped, never a 404). turf_managers
 * never fails the page (lib/turfPage/managers.ts), so it never fails the
 * key either: an error is recorded as FAILED, and the page builds as it
 * renders when its own read fails (no line, kept a minute, not a day).
 */
async function readTurfPage(db: SupabaseClient, key: string, log: (msg: string) => void): Promise<TurfPage | null> {
  const { data, error } = await db.rpc("turf_page", { p_key: key });
  // The page's own rule: an error or a payload without a turf throws; only "found: false" is no turf.
  const payload = turfPagePayload({ data, error }, key);
  if (!payload) return null;
  const turfId = String((payload.turf as Row).id);
  if (payload.claimed !== true) return { data, turfId };
  const m = await db.rpc("turf_managers", { p_turf_id: turfId });
  if (!m.error) return { data, turfId, managers: m.data };
  // PGRST202: a database from before the function; the page shows no line, as it would.
  if (m.error.code === "PGRST202") return { data, turfId, managers: null };
  log(`build data: turf_managers failed for ${key} (${m.error.message}); its page is built without the line`);
  return { data, turfId, managers: FAILED };
}

export type StepOptions = {
  env?: Env;
  now?: () => number;
  log?: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
  /** The network under the patient fetch (tests). */
  fetchImpl?: typeof fetch;
};

export type StepSummary = { requests: number; retries: number; waitedMs: number; bytes: number; ms: number; turfPages: number; skipped: number; moved: boolean };

/** Reads everything into `dir` (which must exist) and writes manifest.json last. Throws StepFailed. */
export async function runBuildData(dir: string, o: StepOptions = {}): Promise<StepSummary> {
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now;
  const log = o.log ?? ((msg: string) => console.warn(msg));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new StepFailed("build data: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set (TAPTURF_BUILD_DATA=off builds without the step)");
  const t0 = now();

  // One client per phase, each with its own patient fetch and deadline.
  const phase = (ms: number, maxTries?: number): Ctx => {
    const deadline = now() + ms;
    const fetch = createPatientFetch({ deadline: () => deadline, maxTries, userAgent: "tapturf-build-data", fetchImpl: o.fetchImpl, now, sleep, log });
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch } });
    return { db, stats: fetch.stats, deadline, now, log, sleep };
  };
  const all: PatientStats[] = [];
  const begin = (ms: number, maxTries?: number) => {
    const ctx = phase(ms, maxTries);
    all.push(ctx.stats);
    return ctx;
  };

  // 1. What every page needs, one request at a time.
  const need = begin(REQUIRED_MS);
  let list = await required(need, "turf list", () => readList(need));
  const cities = await required(need, "city_turf_counts", async () => {
    const rows = await answer(readCityCountRows(need.db), "city_turf_counts");
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.city !== "string")) throw new Error("city_turf_counts sent no list of cities");
    if (rows.length === 0) throw new Empty("no live cities");
    return rows;
  });
  const sitemap = await required(need, "sitemap", async () => {
    const turfs = await readSitemapTurfs(need.db);
    if (turfs.length === 0) throw new Empty("no active turfs");
    return { turfs, games: await answer(readSitemapGames(need.db), "sitemap games") };
  });
  const trending = await required(need, "trending_turfs", () => answer(readTrendingRows(need.db, new Date(now())), "trending_turfs"));
  const games = await required(need, "games", async () => ({
    available: await gamesWithTurfs(need.db, await answer(readAvailableGames(need.db), "games"), { card: true }),
    open: await gamesWithTurfs(need.db, await answer(readOpenGames(need.db, ymd(istToday(new Date(now())))), "open games")),
  }));

  // 2. Turf facts, on their own clock, so a read that keeps failing cannot
  // use up the time the reads above and below have.
  const factsCtx = begin(FACTS_MS);
  const facts = await required(factsCtx, "turf facts", async () => {
    const rows = await readTurfFactRows(factsCtx.db);
    if (rows.length === 0) throw new Empty("no active turfs");
    return turfFactsFrom(rows);
  }).catch((e: unknown): BuildDatasets["turf-facts"] => {
    if (!(e instanceof StepFailed)) throw e;
    log(`build data: turf facts not recorded (${message(e.cause ?? e)}); pages build without them, as when their own read failed`);
    return FAILED;
  });

  // 3. Turf pages (production builds prerender them), 3 at a time.
  let turfPages: BuildDatasets["turf-pages"] | null = null;
  let skipped = 0;
  let turfRetries = 0;
  if (env.VERCEL_ENV === "production") {
    const pagesCtx = begin(TURF_PAGES_MS, 1);
    const keys = topTurfKeys(listRows(list), PRERENDERED_TURF_PAGES);
    const res = await readEach(keys, (k) => readTurfPage(pagesCtx.db, k, log), { concurrency: TURF_PAGE_READS, maxTries: TURF_PAGE_TRIES, deadline: pagesCtx.deadline, now, sleep });
    // The health gate: time ran out with the database failing. Keys that
    // used up their tries before then render on their first visit, and a
    // database down at the very end is the re-check's to wait out (4.).
    if (res.failingAtEnd && res.skipped.some((s) => s.why === "deadline")) {
      throw new StepFailed(`build data: the database stopped answering while turf pages were read (the last tries all failed); ${REDEPLOY}`);
    }
    turfPages = { keys: [], pages: {}, managers: {} };
    for (const k of keys) {
      const got = res.got.get(k);
      if (!got) continue;
      turfPages.keys.push(k);
      turfPages.pages[k] = got.data;
      if (got.managers !== undefined) turfPages.managers[got.turfId] = got.managers;
    }
    skipped = res.skipped.length;
    turfRetries = res.failures;
    const why = res.skipped.reduce<Record<string, number>>((m, s) => ((m[s.why] = (m[s.why] ?? 0) + 1), m), {});
    if (skipped) log(`build data: ${skipped} of ${keys.length} turf pages render on their first visit instead (${JSON.stringify(why)})`);
  }

  // 4. The list again, if it was rebuilt meanwhile.
  const again = begin(REQUIRED_MS);
  const latest = await required(again, "turf_list_version (again)", () => listMeta(again.db));
  const moved = listMoved(list.meta, latest);
  if (moved) list = await required(again, "turf list (again)", () => readList(again));

  // Each file under a temp name, then renamed; the manifest last.
  const datasets: Manifest["datasets"] = {};
  const write = (name: DatasetName, value: unknown) => {
    const text = JSON.stringify(value);
    const file = join(dir, datasetFile(name));
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
    datasets[name] = { bytes: Buffer.byteLength(text) };
  };
  write("list", list);
  write("cities", cities);
  write("turf-facts", facts);
  write("sitemap", sitemap);
  write("trending", trending);
  write("games", games);
  if (turfPages) write("turf-pages", turfPages);
  const manifest: Manifest = { db: url, createdAt: t0, v: list.parts ? list.meta?.v ?? null : null, datasets };
  writeFileSync(join(dir, `${MANIFEST}.tmp`), JSON.stringify(manifest));
  renameSync(join(dir, `${MANIFEST}.tmp`), join(dir, MANIFEST));

  const sum = (k: keyof PatientStats) => all.reduce((s, x) => s + x[k], 0);
  const bytes = Object.values(datasets).reduce((s, d) => s + (d?.bytes ?? 0), 0);
  const summary: StepSummary = { requests: sum("requests"), retries: sum("retries") + turfRetries, waitedMs: sum("waitedMs"), bytes, ms: now() - t0, turfPages: turfPages?.keys.length ?? 0, skipped, moved };
  const rows = listRows(list).length;
  const source = list.parts ? `v${list.meta!.v}, ${rows} rows in ${list.parts.length} parts` : `table (${unusable(list.meta, CARD_COLUMNS)}), ${rows} rows`;
  console.log(
    `build data: ${summary.requests} reads (${summary.retries} retried, ${(summary.waitedMs / 1000).toFixed(1)} s waiting); ` +
      `list ${source}${moved ? ", moved and read again" : ""}; ${cities.length} cities; ${isFailed(facts) ? "no turf facts; " : ""}` +
      `turf pages ${turfPages ? `${summary.turfPages} recorded, ${skipped} skipped` : "none (not production)"}; ` +
      `${(bytes / 1e6).toFixed(1)} MB in ${(summary.ms / 1000).toFixed(1)} s`,
  );
  return summary;
}

// npm run build:data -- <folder>: the step alone, into a folder that exists.
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: npm run build:data -- <folder>");
    process.exit(2);
  }
  // The same .env files, in the same order, as `next build`.
  loadEnvConfig(process.cwd(), false);
  runBuildData(dir).catch((e) => {
    console.error(e instanceof StepFailed ? e.message : e);
    process.exit(1);
  });
}

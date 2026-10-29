// What the build-data step (scripts/build-data.ts) records before `next
// build`, and how the pages read it while they prerender.
// No "@/" imports so the step and the unit tests compile it on their own.
// Server code only: it reads files (node:fs), which a client bundle cannot.
//
// 28-29 Oct: three production builds failed on a read timing out while
// they prerendered (3 workers, 4 pages each, every worker reading the whole
// turf list and the shared reads again), and during every build the live
// site's reads on the same database timed out too. Now one step reads what
// the pages share, one request at a time (3 at a time for turf pages),
// waiting out a slow database, and the pages read its files: page
// generation sends the database nothing.
//
// Rules:
// - Only while `next build` runs with the step's folder (lib/build/env.ts).
//   While serving buildData() is always undefined: every regeneration and
//   purge reads the live database, as before.
// - Each hook replaces the database answer inside the function that
//   unstable_cache wraps, never the wrapper, so every page keeps its tags,
//   revalidate times and checks (the row store checks recorded parts exactly
//   as it checks parts from the database).
// - A dataset the step did not record means a live read (and the tripwire
//   in lib/supabase/guard.ts says so). A malformed file, a manifest from
//   another database or one more than an hour old fails the build.
// - A read the step tried and lost (the turf facts, the sport bands, a
//   turf's managers) is recorded as FAILED: the page then does what it does
//   when its own read fails, and reads nothing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ListMeta, ListPart } from "../cache/rowStore";
import type { TurfFacts } from "../seo/turfFacts";
import type { SitemapGame, SitemapTurf, SportBandRow, TrendingRow } from "./reads";
import { buildDataDir } from "./env";

type Row = Record<string, unknown>;
type GameRead = { games: Row[]; turfs: Row[] };

export type BuildDatasets = {
  /**
   * turf_list_version and every part of that one build; when no snapshot
   * is usable by the row store's rule (lib/cache/rowStore.ts unusable), the
   * table's rows instead (parts null).
   */
  list: { meta: ListMeta | null; parts: ListPart<Row>[] | null; rows: Row[] | null };
  /** city_turf_counts as read (readCityCountRows). */
  cities: Row[];
  /** turfFactsFrom() of the facts read: ids and keys only, never a number. */
  "turf-facts": TurfFacts | Failed;
  /**
   * Production only (the sport pages prerender there): readSportBandRows
   * as read; the pages shape them as they shape their own read
   * (lib/queries/sportBands.ts).
   */
  "sport-bands": SportBandRow[] | Failed;
  sitemap: { turfs: SitemapTurf[]; games: SitemapGame[] };
  /** Picks whose window had not closed; pages take the ones live when they render (livePicks). */
  trending: TrendingRow[];
  /** /games (every open game) and the home's open games from that day, each with its turfs. */
  games: { available: GameRead; open: GameRead };
  /**
   * The turf pages to prerender (keys), each one's turf_page answer by key
   * and, for a claimed turf, its turf_managers answer by turf id (null: the
   * function is missing, as from a database before its migration; FAILED:
   * the read failed).
   */
  "turf-pages": { keys: string[]; pages: Record<string, unknown>; managers: Record<string, unknown> };
};

export type DatasetName = keyof BuildDatasets;

/** A read the step could not make (see Rules). */
export type Failed = { failed: true };
export const FAILED: Failed = { failed: true };
export const isFailed = (v: unknown): v is Failed => typeof v === "object" && v !== null && (v as Partial<Failed>).failed === true;

export type Manifest = {
  /** NEXT_PUBLIC_SUPABASE_URL the step read. */
  db: string;
  /** When the step started (epoch ms): its oldest answer. */
  createdAt: number;
  /** The list snapshot version recorded (null: none usable). */
  v: number | null;
  datasets: Partial<Record<DatasetName, { bytes: number }>>;
};

export const MANIFEST = "manifest.json";
/** A build starts prerendering within minutes of the step; an older folder is someone else's. */
export const MANIFEST_MAX_AGE_MS = 60 * 60_000;

export const datasetFile = (name: DatasetName) => `${name}.json`;

/** Why this build must not use the manifest, or null. */
export function manifestProblem(m: unknown, db: string | undefined, now: number): string | null {
  if (!m || typeof m !== "object") return "the manifest is not an object";
  const { db: from, createdAt, datasets } = m as Partial<Manifest>;
  if (typeof from !== "string" || typeof createdAt !== "number" || !datasets || typeof datasets !== "object") return "the manifest is malformed";
  // Every list cache key carries the database URL: rows of two databases must never mix.
  if (from !== (db ?? "")) return `recorded from ${from}, but this build reads ${db ?? "(no NEXT_PUBLIC_SUPABASE_URL)"}`;
  const age = now - createdAt;
  if (!(age >= -60_000 && age <= MANIFEST_MAX_AGE_MS)) return `recorded ${Math.round(age / 60_000)} min ago (at most ${MANIFEST_MAX_AGE_MS / 60_000})`;
  return null;
}

type Store = { dir: string; manifest: Manifest; parsed: Map<DatasetName, unknown> };
// On globalThis: the page and route-handler bundles in one worker share one parse.
const shared = globalThis as typeof globalThis & { __tapturfBuildData?: Store };

// turbopackIgnore: the folder is named at run time. Without it Turbopack's
// file tracing read join(dir, `${name}.json`) as "any .json file" and put
// package-lock.json, package.json and every tsconfig into each function
// (about 315 KB and 25 files a function on 29 Oct).
const readJson = (dir: string, file: string): unknown => JSON.parse(readFileSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, file), "utf8"));

/**
 * The step's answer for `name`, while `next build` prerenders from its
 * folder; undefined while serving, without the folder, or when the step
 * did not record it (the caller then reads the database). Read and parsed
 * once per worker, when first asked.
 */
export function buildData<K extends DatasetName>(name: K): BuildDatasets[K] | undefined {
  const dir = buildDataDir();
  if (!dir) return undefined;
  let store = shared.__tapturfBuildData;
  if (!store || store.dir !== dir) {
    const manifest = readJson(dir, MANIFEST) as Manifest;
    const problem = manifestProblem(manifest, process.env.NEXT_PUBLIC_SUPABASE_URL, Date.now());
    if (problem) throw new Error(`build data: ${problem}. Run the build with npm run build, or TAPTURF_BUILD_DATA=off.`);
    store = shared.__tapturfBuildData = { dir, manifest, parsed: new Map() };
  }
  if (!store.parsed.has(name)) {
    let value: unknown;
    if (store.manifest.datasets[name]) {
      value = readJson(dir, datasetFile(name));
      if (!value || typeof value !== "object") throw new Error(`build data: ${datasetFile(name)} is not an object`);
    }
    store.parsed.set(name, value);
  }
  return store.parsed.get(name) as BuildDatasets[K] | undefined;
}

/** The recorded value of `key` in a dataset's map, or undefined (own keys only: a turf slug is never "constructor"). */
export function recorded<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/**
 * How long a turf page prerendered from the step's files is kept before
 * its first refresh: 15, 20, 25 or 30 minutes, by its key. Turf purges are
 * revalidatePath calls, and those sent between the step and go-live reach
 * only the old deployment; one refresh soon after brings the page up to
 * date, and then it keeps its day. Spread over four marks so some 300
 * pages do not all refresh in the same minute.
 */
export const FIRST_LIFE_S = [900, 1200, 1500, 1800] as const;

export function firstLifeOf(key: string): (typeof FIRST_LIFE_S)[number] {
  // FNV-1a: stable across processes and deploys.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return FIRST_LIFE_S[(h >>> 0) % FIRST_LIFE_S.length];
}

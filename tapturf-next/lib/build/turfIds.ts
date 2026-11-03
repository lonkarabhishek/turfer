// The proxy's old-link map (lib/turfIds.ts): written by `npm run build`
// (scripts/build.ts) after the build-data step and before `next build`,
// from the step's own sitemap read (every active turf's id and slug), so it
// costs no database read. It goes into the project (lib/turfIds.json) because
// the proxy imports it and `next build` bundles it into the proxy; the file
// the commit holds ({}) is put back when the build ends, so a local build
// leaves the tree as it was. Ids and slugs only: both are public in URLs.
// No "@/" imports so the step and the unit tests compile it on their own.

import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { datasetFile, type BuildDatasets } from "./data";
import { turfIdMap } from "../turfIds";

/** The map the proxy imports, relative to the project. */
export const TURF_IDS_FILE = join("lib", "turfIds.json");
/** What the commit holds in it: no map (dev, tests and a build without the step redirect nothing at the proxy). */
export const TURF_IDS_EMPTY = "{}\n";

export type TurfIdsWritten = {
  /** Turfs whose old id link redirects at the proxy. */
  count: number;
  /** Size of the file as written. */
  bytes: number;
  /** turfIdsDigest of the map: the build log prints it, to compare with the database's. */
  md5: string;
  /** Active turfs with a slug the map left out (malformed or id-like): their old links go to the page, and the md5s then differ. */
  leftOut: number;
  /** Puts back the committed fallback ({}); safe to call twice. */
  restore: () => void;
};

const writeAtomic = (file: string, text: string) => {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
};

/**
 * md5 of the map as Postgres writes the same list: "id,slug" lines in id
 * order, joined by a newline. While no active turf's slug changed since
 * the build, it equals the production database's
 *   select md5(string_agg(id::text || ',' || slug, E'\n' order by id))
 *     from public.turfs where is_active and slug is not null;
 * (a uuid sorts by its bytes, which is the order of its lower-case text).
 * A different answer means the deploy's map is out of date: redeploy.
 */
export function turfIdsDigest(map: Readonly<Record<string, string>>): string {
  const lines = Object.keys(map)
    .sort()
    .map((id) => `${id},${map[id]}`);
  return createHash("md5").update(lines.join("\n"), "utf8").digest("hex");
}

/**
 * Puts the committed {} back when the file holds anything else: a map left
 * by a build that was killed before it could restore (SIGKILL, out of
 * memory), which dev and a build without the step would otherwise bundle.
 * True when it had to.
 */
export function resetTurfIds(projectDir: string): boolean {
  const file = join(projectDir, TURF_IDS_FILE);
  if (readFileSync(file, "utf8") === TURF_IDS_EMPTY) return false;
  writeAtomic(file, TURF_IDS_EMPTY);
  return true;
}

/** Writes `<projectDir>/lib/turfIds.json` from the sitemap dataset in the step's folder. */
export function writeTurfIds(stepDir: string, projectDir: string): TurfIdsWritten {
  const sitemap = JSON.parse(readFileSync(join(stepDir, datasetFile("sitemap")), "utf8")) as BuildDatasets["sitemap"];
  if (!sitemap || !Array.isArray(sitemap.turfs)) throw new Error("build data: sitemap.json has no turfs for the old-link map");
  const map = turfIdMap(sitemap.turfs);
  const count = Object.keys(map).length;
  const file = join(projectDir, TURF_IDS_FILE);
  const text = `${JSON.stringify(map)}\n`;
  writeAtomic(file, text);
  let restored = false;
  return {
    count,
    bytes: Buffer.byteLength(text),
    md5: turfIdsDigest(map),
    leftOut: sitemap.turfs.filter((t) => t?.slug != null).length - count,
    restore: () => {
      if (restored) return;
      restored = true;
      writeAtomic(file, TURF_IDS_EMPTY);
    },
  };
}

// The proxy's old-link map (lib/turfIds.ts): written by `npm run build`
// (scripts/build.ts) after the build-data step and before `next build`,
// from the step's own sitemap read (every active turf's id and slug), so it
// costs no database read. It goes into the project (lib/turfIds.json) because
// the proxy imports it and `next build` bundles it into the proxy; the file
// the commit holds ({}) is put back when the build ends, so a local build
// leaves the tree as it was. Ids and slugs only: both are public in URLs.
// No "@/" imports so the step and the unit tests compile it on their own.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { datasetFile, type BuildDatasets } from "./data";
import { turfIdMap } from "../turfIds";

/** The map the proxy imports, relative to the project. */
export const TURF_IDS_FILE = join("lib", "turfIds.json");

export type TurfIdsWritten = {
  /** Turfs whose old id link redirects at the proxy. */
  count: number;
  /** Size of the file as written. */
  bytes: number;
  /** Puts back the file as it was before (the committed fallback); safe to call twice. */
  restore: () => void;
};

const writeAtomic = (file: string, text: string) => {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
};

/** Writes `<projectDir>/lib/turfIds.json` from the sitemap dataset in the step's folder. */
export function writeTurfIds(stepDir: string, projectDir: string): TurfIdsWritten {
  const sitemap = JSON.parse(readFileSync(join(stepDir, datasetFile("sitemap")), "utf8")) as BuildDatasets["sitemap"];
  if (!sitemap || !Array.isArray(sitemap.turfs)) throw new Error("build data: sitemap.json has no turfs for the old-link map");
  const map = turfIdMap(sitemap.turfs);
  const file = join(projectDir, TURF_IDS_FILE);
  const before = readFileSync(file, "utf8");
  const text = `${JSON.stringify(map)}\n`;
  writeAtomic(file, text);
  let restored = false;
  return {
    count: Object.keys(map).length,
    bytes: Buffer.byteLength(text),
    restore: () => {
      if (restored) return;
      restored = true;
      writeAtomic(file, before);
    },
  };
}

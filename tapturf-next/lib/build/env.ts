// When `next build` prerenders from the build-data step's files
// (scripts/build-data.ts) instead of the database.
// No imports, so lib/supabase/guard.ts and the unit tests use it on their own.

type Env = Record<string, string | undefined>;

/**
 * The folder the step wrote, while `next build` runs with it (scripts/build.ts
 * sets TAPTURF_BUILD_DATA for the build it starts); null otherwise. Never set
 * while serving: Next sets NEXT_PHASE to the build phase only in the build
 * and its workers, so a deployment always reads the database.
 */
export function buildDataDir(env: Env = process.env): string | null {
  if (env.NEXT_PHASE !== "phase-production-build") return null;
  const dir = env.TAPTURF_BUILD_DATA?.trim();
  return dir && dir !== "off" ? dir : null;
}

/** Where the build tripwire (lib/supabase/guard.ts) notes paths, in the step's folder; scripts/build.ts reports them. */
export const TRIPWIRE_FILE = "tripwire.log";

/** Test builds and measurements: a page that reads the database fails the build instead of logging it. */
export function buildDataStrict(env: Env = process.env): boolean {
  return env.TAPTURF_BUILD_DATA_STRICT === "1";
}

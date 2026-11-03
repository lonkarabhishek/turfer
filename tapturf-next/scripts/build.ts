/**
 * `npm run build`: the build-data step (scripts/build-data.ts), then
 * `next build` reading the step's files instead of the database.
 *
 * - Env comes from the same .env files, in the same order, as `next build`
 *   loads them (@next/env), so the step reads the database the pages would.
 * - The step writes into a private folder under the system's temp dir:
 *   outside the project, so no file tracing can ship it with a function, and
 *   never shared by two builds. It is removed when the build ends, passed,
 *   failed or stopped (SIGINT and SIGTERM go on to `next build`): turf_page
 *   answers carry owners' numbers.
 * - A failed step fails the build (exit 1) before `next build` starts:
 *   production keeps the last deploy.
 * - From the step's sitemap read, the proxy's map of old id links
 *   (/turf/<uuid> -> /turf/<slug>) is written into lib/turfIds.json for
 *   `next build` to bundle (lib/build/turfIds.ts), and the committed file is
 *   put back when the build ends, as the folder is removed.
 * - TAPTURF_BUILD_DATA=off skips the step: `next build` reads the database
 *   itself, as before (a local build without a database), and the proxy's
 *   map stays empty (the turf page redirects old links itself).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { buildDataStrict, TRIPWIRE_FILE } from "../lib/build/env";
import { writeTurfIds } from "../lib/build/turfIds";
import { runBuildData, StepFailed } from "./build-data";

const SIGNALS = { SIGINT: 2, SIGTERM: 15 } as const;
type Signal = keyof typeof SIGNALS;

let child: ChildProcess | null = null;
let folder: string | null = null;
let restoreTurfIds: (() => void) | null = null;

function cleanup() {
  restoreTurfIds?.();
  restoreTurfIds = null;
  if (!folder) return;
  rmSync(folder, { recursive: true, force: true });
  folder = null;
}

for (const sig of Object.keys(SIGNALS) as Signal[]) {
  process.on(sig, () => {
    // `next build` stops and its exit ends the build below; before it starts, stop here.
    if (child) child.kill(sig);
    else {
      cleanup();
      process.exit(128 + SIGNALS[sig]);
    }
  });
}
process.on("exit", cleanup);

function nextBuild(env: NodeJS.ProcessEnv, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "build", ...args], { stdio: "inherit", env });
    child = proc;
    proc.on("error", (e) => {
      console.error("build: next build did not start", e);
      resolve(1);
    });
    proc.on("exit", (code, signal) => {
      child = null;
      resolve(code ?? 128 + (SIGNALS[signal as Signal] ?? 1));
    });
  });
}

/** Paths the build tripwire noted (lib/supabase/guard.ts), each once. */
function tripped(dir: string): string[] {
  const file = join(dir, TRIPWIRE_FILE);
  return existsSync(file) ? [...new Set(readFileSync(file, "utf8").split("\n").filter(Boolean))] : [];
}

async function main(): Promise<number> {
  loadEnvConfig(process.cwd(), false);
  const args = process.argv.slice(2);
  if (process.env.TAPTURF_BUILD_DATA?.trim() === "off") {
    console.log("build data: off (TAPTURF_BUILD_DATA=off): next build reads the database itself");
    return nextBuild(process.env, args);
  }
  const dir = (folder = mkdtempSync(join(tmpdir(), "tapturf-build-")));
  try {
    await runBuildData(dir);
  } catch (e) {
    if (!(e instanceof StepFailed)) throw e;
    console.error(e.message);
    return 1;
  }
  const ids = writeTurfIds(dir, process.cwd());
  restoreTurfIds = ids.restore;
  console.log(`build data: ${ids.count} old /turf/<id> links redirect at the proxy (${(ids.bytes / 1024).toFixed(0)} KB map)`);
  const code = await nextBuild({ ...process.env, TAPTURF_BUILD_DATA: dir }, args);
  const paths = tripped(dir);
  if (paths.length) console.warn(`build: pages read the database while building from the step's files: ${paths.join(", ")}`);
  if (code === 0 && paths.length && buildDataStrict()) {
    console.error("build: failed (TAPTURF_BUILD_DATA_STRICT=1): every read a page makes while building must come from the step");
    return 1;
  }
  return code;
}

main().then(
  (code) => {
    cleanup();
    process.exit(code);
  },
  (e) => {
    console.error(e);
    cleanup();
    process.exit(1);
  },
);

// A fetch for the read-only Supabase client that gives up on a slow
// database and stops calling a failing one for a while.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// On 19/20 Oct PostgREST queued requests for minutes (the 3 s statement
// timeout only covers execution), the site kept waiting and retrying, and
// that extra load kept the database down. Now a request is abandoned after
// 5 s, and after 5 failures within 30 s this instance fails every request
// at once for 30 s, then lets one probe through. Cached pages keep serving
// their last copy meanwhile: a failed refresh leaves the old one in place.

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { buildDataDir, buildDataStrict, TRIPWIRE_FILE } from "../build/env";

export type GuardOptions = {
  /** Abandon a request after this long. */
  timeoutMs?: number;
  /** Open the breaker after this many failures... */
  threshold?: number;
  /** ...within this window. */
  windowMs?: number;
  /** Fail fast for this long once open, then let one probe through. */
  openMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  /** Sees each request's URL before it goes out; a throw stops it (the build tripwire, below). */
  onRequest?: (url: string) => void;
};

export class CircuitOpenError extends Error {
  constructor() {
    super("Database circuit open: failing fast");
    this.name = "CircuitOpenError";
  }
}

function combine(timeout: AbortSignal, caller?: AbortSignal | null): AbortSignal {
  if (!caller) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([caller, timeout]);
  const ctl = new AbortController();
  const abort = (s: AbortSignal) => () => ctl.abort(s.reason);
  if (caller.aborted || timeout.aborted) ctl.abort();
  caller.addEventListener("abort", abort(caller), { once: true });
  timeout.addEventListener("abort", abort(timeout), { once: true });
  return ctl.signal;
}

export function createGuardedFetch(opts: GuardOptions = {}): typeof fetch {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const threshold = opts.threshold ?? 5;
  const windowMs = opts.windowMs ?? 30_000;
  const openMs = opts.openMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((msg, extra) => console.warn(msg, extra ?? ""));

  let failures: number[] = [];
  let openedAt: number | null = null;
  let probing = false;

  // fail() and succeed() run only for the probe, or for a call that both
  // started and ended while the breaker was closed (see `counts` below).
  const fail = (why: string) => {
    const t = now();
    if (openedAt !== null) {
      // The probe failed: stay open for another period.
      openedAt = t;
      probing = false;
      log("supabase breaker: probe failed, staying open", { why });
      return;
    }
    failures = failures.filter((f) => t - f < windowMs);
    failures.push(t);
    if (failures.length >= threshold) {
      openedAt = t;
      failures = [];
      log("supabase breaker: open", { why, forMs: openMs });
    }
  };
  // A success closes an open breaker (the probe got through) but does not
  // clear failures while closed: a database where the light queries pass
  // and the heavy ones time out is still in trouble.
  const succeed = () => {
    if (openedAt === null) return;
    log("supabase breaker: closed");
    openedAt = null;
    probing = false;
    failures = [];
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    opts.onRequest?.(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    let probe = false;
    if (openedAt !== null) {
      // One request at a time may test the database once the period is over.
      if (probing || now() - openedAt < openMs) throw new CircuitOpenError();
      probing = probe = true;
    }
    // Only the probe, or a call that ends while the breaker is still
    // closed, may change its state. A light query that started before it
    // opened and returns 200 afterwards must not close it, and a slow one
    // failing late must not count as a failed probe (or a second probe
    // would start while the real one runs).
    const counts = () => probe || openedAt === null;
    const timeout = AbortSignal.timeout(timeoutMs);
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    let res: Response;
    try {
      // Resolved per call so Next's patched fetch is the one used.
      res = await (opts.fetchImpl ?? globalThis.fetch)(input, { ...init, signal: combine(timeout, callerSignal) });
    } catch (e) {
      // A caller's own abort says nothing about the database.
      if (callerSignal?.aborted && !timeout.aborted) {
        if (probe) probing = false;
        throw e;
      }
      if (counts()) fail(timeout.aborted ? `timeout ${timeoutMs} ms` : String((e as Error)?.message ?? e));
      throw e;
    }
    // 5xx covers statement timeouts (57014), PGRST002 schema reloads and
    // gateway timeouts. 4xx is the caller's problem, not the database's.
    if (counts()) {
      if (res.status >= 500) fail(`HTTP ${res.status}`);
      else succeed();
    }
    return res;
  }) as typeof fetch;
}

/**
 * While `next build` prerenders from the build-data step's files
 * (lib/build/data.ts), no page should read the database: a read the step
 * did not record is logged once per path in each worker ("build: a page
 * read the database <path>") and noted in the step's folder, where
 * scripts/build.ts counts the notes for its summary. With
 * TAPTURF_BUILD_DATA_STRICT=1 (test builds and measurements) the read also
 * fails, and so does the build. Undefined when not building from files.
 */
export function buildTripwire(
  env: Record<string, string | undefined>,
  log: (msg: string) => void = (msg) => console.warn(msg),
  note: (dir: string, path: string) => void = (dir, path) => appendFileSync(join(dir, TRIPWIRE_FILE), `${path}\n`),
): ((url: string) => void) | undefined {
  const dir = buildDataDir(env);
  if (!dir) return undefined;
  const strict = buildDataStrict(env);
  const seen = new Set<string>();
  return (url) => {
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      // Not a URL: log it as it is.
    }
    if (!seen.has(path)) {
      seen.add(path);
      log(`build: a page read the database ${path}`);
      try {
        note(dir, path);
      } catch {
        // The log line is enough.
      }
    }
    if (strict) throw new Error(`build: a page read the database ${path} (TAPTURF_BUILD_DATA_STRICT=1)`);
  };
}

/**
 * No breaker while `next build` prerenders (Next sets NEXT_PHASE before
 * it starts the build workers). One per worker would fail every page in
 * that worker for 30 s after a short blip, retries included, and fail the
 * deploy (the daily blog push). The 5 s timeout still applies. Building
 * from the step's files, the tripwire watches every request.
 */
export function defaultGuardOptions(env: Record<string, string | undefined> = process.env): GuardOptions {
  if (env.NEXT_PHASE !== "phase-production-build") return {};
  const onRequest = buildTripwire(env);
  return onRequest ? { threshold: Infinity, onRequest } : { threshold: Infinity };
}

/** One breaker per server instance, shared by every read-only client. */
export const guardedFetch = createGuardedFetch(defaultGuardOptions());

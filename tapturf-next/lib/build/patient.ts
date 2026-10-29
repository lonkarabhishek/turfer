// How the build-data step (scripts/build-data.ts) reads: patiently, and
// never more than a few requests at once. No imports, so the unit tests
// compile it on their own (npm run test:build).
//
// The pages' own client gives up after 5 s and retries once at most
// (lib/supabase/guard.ts), which is right while serving and is what failed
// three builds on 28-29 Oct: a database slow for a minute failed the deploy.
// The step instead waits a slow or briefly unreachable database out, up to
// its deadline, with backoff, so the database gets less traffic while it
// struggles, not more.

/** Waits between tries: 1, 2, 4, 8, 15, then 30 s (each ±25%). */
const BACKOFF_S = [1, 2, 4, 8, 15, 30];

export function backoffMs(failures: number, random: () => number = Math.random): number {
  const s = BACKOFF_S[Math.min(Math.max(failures, 1), BACKOFF_S.length) - 1];
  return Math.round(s * 1000 * (0.75 + Math.min(1, Math.max(0, random())) / 2));
}

/** Retry-After in ms (seconds or an HTTP date), at most a minute; null when absent or unreadable. */
export function retryAfterMs(value: string | null, now: number): number | null {
  if (!value) return null;
  const s = Number(value);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.min(60_000, Math.max(0, Math.round(ms))) : null;
}

/** Answers worth another try: the database or the gateway was busy or timed out. Other 4xx are the request's fault. */
const retryable = (status: number) => status >= 500 || status === 408 || status === 429;

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type PatientOptions = {
  /** No new try starts after this (epoch ms). */
  deadline: () => number;
  /** Each try, body included, is abandoned after this long. */
  timeoutMs?: number;
  /** Tries per request; the default is until the deadline. */
  maxTries?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: (msg: string) => void;
};

export type PatientStats = { requests: number; retries: number; waitedMs: number; gaveUp: number };

/**
 * A fetch for the step's Supabase client. Each try reads the whole body
 * inside its timeout and hands on a new Response: supabase-js reads the
 * body after fetch resolves, so a part cut off mid-transfer would
 * otherwise come back as an error no retry saw. Timeouts, network errors,
 * 5xx, 408 and 429 are tried again (honoring Retry-After) until maxTries
 * or the deadline; then the last answer is handed on (or the last error
 * thrown), and stats.gaveUp counts it. One log line per retry: the path,
 * the status, the wait. Never a row.
 */
export function createPatientFetch(o: PatientOptions): typeof fetch & { stats: PatientStats } {
  const timeoutMs = o.timeoutMs ?? 10_000;
  const maxTries = o.maxTries ?? Infinity;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? sleepFor;
  const random = o.random ?? Math.random;
  const log = o.log ?? ((msg) => console.warn(msg));
  const stats: PatientStats = { requests: 0, retries: 0, waitedMs: 0, gaveUp: 0 };

  const patient = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    const headers = new Headers(init?.headers);
    if (o.userAgent) headers.set("user-agent", o.userAgent);
    const caller = init?.signal ?? null;
    for (let tries = 1; ; tries++) {
      stats.requests++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(new Error(`timeout ${timeoutMs} ms`)), timeoutMs);
      // The caller's own abort ends the request: no retry.
      const stop = () => ctl.abort(caller?.reason);
      if (caller?.aborted) stop();
      caller?.addEventListener("abort", stop, { once: true });
      let answer: Response | null = null;
      let failure: unknown = null;
      let why: string;
      try {
        const res = await (o.fetchImpl ?? globalThis.fetch)(input, { ...init, headers, signal: ctl.signal });
        const body = await res.arrayBuffer();
        answer = new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers });
        if (!retryable(res.status)) return answer;
        why = `HTTP ${res.status}`;
      } catch (e) {
        if (caller?.aborted) throw e;
        failure = ctl.signal.aborted ? ctl.signal.reason : e;
        why = failure instanceof Error ? failure.message : String(failure);
      } finally {
        clearTimeout(timer);
        caller?.removeEventListener("abort", stop);
      }
      const wait = retryAfterMs(answer?.headers.get("retry-after") ?? null, now()) ?? backoffMs(tries, random);
      if (tries >= maxTries || now() + wait > o.deadline()) {
        stats.gaveUp++;
        if (answer) return answer;
        throw failure;
      }
      log(`build data: retry ${path} (${why}) in ${(wait / 1000).toFixed(1)} s`);
      stats.retries++;
      stats.waitedMs += wait;
      await sleep(wait);
    }
  };
  return Object.assign(patient as typeof fetch, { stats });
}

export type EachOptions = {
  /** Reads in flight at once. */
  concurrency: number;
  /** Tries per key; a key that fails this often is skipped. */
  maxTries: number;
  /** No key starts after this (epoch ms); keys not done are skipped. */
  deadline: number;
  /** The health gate looks at this many of the last tries. */
  window?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type EachResult<K, V> = {
  got: Map<K, V>;
  /** absent: the read said there is no such thing (null); failed: maxTries failed; deadline: not done in time. */
  skipped: { key: K; why: "absent" | "failed" | "deadline" }[];
  /**
   * The last `window` tries all failed. With keys left at the deadline the
   * database is failing now, not just slow; at a natural end it can also
   * be a few keys whose reads keep failing on their own (the last tries).
   */
  failingAtEnd: boolean;
  tries: number;
  failures: number;
};

/**
 * read(key) for every key, `concurrency` at a time. A read that throws is
 * tried again later (the key goes to the back of the line, after a wait
 * that grows while reads keep failing), at most maxTries times; null means
 * "nothing to record" and is no failure. Stops starting reads at the
 * deadline.
 */
export async function readEach<K, V>(keys: readonly K[], read: (key: K) => Promise<V | null>, o: EachOptions): Promise<EachResult<K, V>> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? sleepFor;
  const window = o.window ?? 5;
  const line = keys.map((key) => ({ key, tries: 0 }));
  const got = new Map<K, V>();
  const skipped: EachResult<K, V>["skipped"] = [];
  const recent: boolean[] = [];
  let tries = 0;
  let failures = 0;
  // Failures in a row, across every reader: the wait before the next read.
  let streak = 0;

  async function reader() {
    for (;;) {
      if (now() >= o.deadline) return;
      const item = line.shift();
      if (!item) return;
      item.tries++;
      tries++;
      let ok = true;
      try {
        const v = await read(item.key);
        if (v === null) skipped.push({ key: item.key, why: "absent" });
        else got.set(item.key, v);
      } catch {
        ok = false;
        failures++;
        if (item.tries < o.maxTries) line.push(item);
        else skipped.push({ key: item.key, why: "failed" });
      }
      recent.push(ok);
      if (recent.length > window) recent.shift();
      streak = ok ? 0 : streak + 1;
      if (!ok) await sleep(Math.max(0, Math.min(o.deadline - now(), backoffMs(streak, o.random))));
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency) }, reader));
  for (const item of line) skipped.push({ key: item.key, why: "deadline" });
  return { got, skipped, failingAtEnd: recent.length > 0 && recent.every((ok) => !ok), tries, failures };
}

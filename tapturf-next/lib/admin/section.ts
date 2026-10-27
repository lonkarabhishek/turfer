// One admin read, failing soft: what a section of the admin pages gets back.
// No "@/" imports, so the unit test compiles it on its own (npm run test:trend).
//
// On 27 Oct one turfs read timed out under a burst of admin reads and threw
// out of the admin home's Promise.all, and the whole page was replaced by the
// error page. Now every read is settled into a Section: its data, or why it
// couldn't be read (the section shows "Couldn't load" and a retry), never a
// throw. Reads of one render share a limiter (a few at a time, so one page
// can't flood the database) and a time budget (once it is spent, the rest
// say so at once instead of each waiting out its own timeout).

export type Reason = "timeout" | "error" | "not_allowed" | "not_set_up";
export type Section<T> = { ok: true; data: T } | { ok: false; reason: Reason };

export const okSection = <T>(data: T): Section<T> => ({ ok: true, data });
export const failedSection = (reason: Reason): { ok: false; reason: Reason } => ({ ok: false, reason });

/** A read that failed, with what it means for the page. */
export class ReadFailed extends Error {
  readonly reason: Reason;
  readonly code: string | undefined;
  constructor(reason: Reason, message: string, code?: string) {
    super(message);
    this.name = "ReadFailed";
    this.reason = reason;
    this.code = code;
  }
}

/**
 * What an error from PostgREST, supabase-js or fetch means: the owner check
 * said no (42501), the function isn't on the database yet (PGRST202, 42883),
 * the statement or the request ran out of time (57014, an abort, a timeout,
 * the read breaker failing fast while the database is struggling), or
 * anything else. supabase-js turns a failed fetch into an error whose
 * message starts with the error's name ("AbortError: ...").
 */
export function reasonOf(e: unknown): Reason {
  if (e instanceof ReadFailed) return e.reason;
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? o.code : "";
  if (code === "42501") return "not_allowed";
  if (code === "PGRST202" || code === "42883") return "not_set_up";
  if (code === "57014") return "timeout";
  const name = typeof o.name === "string" ? o.name : "";
  if (name === "AbortError" || name === "TimeoutError" || name === "CircuitOpenError") return "timeout";
  const message = typeof o.message === "string" ? o.message : typeof e === "string" ? e : "";
  if (/statement timeout|^(AbortError|TimeoutError|CircuitOpenError)\b|aborted|timed out/i.test(message)) return "timeout";
  return "error";
}

/** A short, log-safe description of an error (its code and message, never row data). */
export function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };
  const parts = [typeof o.code === "string" && o.code ? o.code : null, typeof o.message === "string" ? o.message : null].filter(Boolean);
  return parts.length ? parts.join(" ") : String(e);
}

type Result<T> = { data: T | null; error: unknown };

/** The rows of a Supabase result ([] when it has none); a ReadFailed for its error. */
export function rowsOf<T>(res: Result<T[]>, what: string): T[] {
  if (res.error) throw failure(res.error, what);
  return res.data ?? [];
}

/** The data of a Supabase result (it may be null); a ReadFailed for its error. */
export function dataOf<T>(res: Result<T>, what: string): T | null {
  if (res.error) throw failure(res.error, what);
  return res.data;
}

/** The exact count of a head read; a ReadFailed for its error or a missing count (never a silent 0). */
export function countOf(res: { count: number | null; error: unknown }, what: string): number {
  if (res.error) throw failure(res.error, what);
  if (typeof res.count !== "number") throw new ReadFailed("error", `${what}: no count`);
  return res.count;
}

/**
 * Every row of a read PostgREST caps per request (1,000 on Supabase), page
 * by page until one comes back short. The page function must order the rows
 * on a unique key. A failed page fails the whole read (a ReadFailed), never
 * a part of the list: a part would show wrong counts as if they were true.
 */
export async function readAllPages<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>, what: string, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = rowsOf(await page(from, from + size - 1), `${what} (rows ${from}+)`);
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

function failure(err: unknown, what: string): ReadFailed {
  const code = (err as { code?: unknown } | null)?.code;
  return new ReadFailed(reasonOf(err), `${what}: ${describe(err)}`, typeof code === "string" ? code : undefined);
}

/** Runs at most `max` tasks at once, the rest in the order they came. */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  const cap = Math.max(1, Math.floor(max));
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    while (active < cap && waiting.length) {
      active++;
      waiting.shift()!();
    }
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

/** What the reads of one render share. */
export type ReadContext = {
  limit: Limiter;
  /** No read starts after this (ms since epoch); each read's own timeout ends by it. */
  deadline: number;
  now: () => number;
};

/** Reads in flight at once for one admin render or request. */
export const READS_AT_ONCE = 4;
/** One render's reads all end within this, however many there are. */
export const RENDER_BUDGET_MS = 15_000;
/**
 * One owner read's timeout: under the authenticated role's 8 s
 * statement_timeout, so the page gives up first and says so.
 */
export const READ_TIMEOUT_MS = 7_000;

export function createReadContext(opts: { max?: number; budgetMs?: number; now?: () => number } = {}): ReadContext {
  const now = opts.now ?? Date.now;
  return { limit: createLimiter(opts.max ?? READS_AT_ONCE), deadline: now() + (opts.budgetMs ?? RENDER_BUDGET_MS), now };
}

export type SettleOptions = {
  timeoutMs?: number;
  ctx?: ReadContext;
  log?: (message: string) => void;
};

/**
 * Runs one read and settles it: its data, or why it failed. Never throws.
 * The read gets an AbortSignal that fires at its timeout (pass it to
 * supabase-js with .abortSignal()); the timeout starts when the read does,
 * not while it waits for the limiter, and never runs past the render's
 * deadline. A read that would start after the deadline doesn't start.
 * Failures are logged once, by name; a function that isn't set up yet is
 * expected and stays quiet.
 */
export async function settle<T>(name: string, read: (signal: AbortSignal) => Promise<T>, opts: SettleOptions = {}): Promise<Section<T>> {
  const ctx = opts.ctx;
  const now = ctx?.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const run = async (): Promise<Section<T>> => {
    const left = ctx ? ctx.deadline - now() : Infinity;
    if (left <= 0) {
      log(`admin read ${name}: not started, the page's time is up`);
      return failedSection("timeout");
    }
    const ms = Math.max(1, Math.min(opts.timeoutMs ?? READ_TIMEOUT_MS, left));
    const ctl = new AbortController();
    const started = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(new ReadFailed("timeout", `no answer in ${ms} ms`));
        }, ms);
      });
      return okSection(await Promise.race([read(ctl.signal), timedOut]));
    } catch (e) {
      const reason = reasonOf(e);
      if (reason !== "not_set_up") log(`admin read ${name} failed (${reason}) after ${now() - started} ms: ${describe(e)}`);
      return failedSection(reason);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await (ctx ? ctx.limit(run) : run());
  } catch (e) {
    // run() never throws; a broken limiter must not break the page either.
    log(`admin read ${name} failed: ${describe(e)}`);
    return failedSection(reasonOf(e));
  }
}

/** The first failure among sections, or null when all were read. */
export function firstFailure(...sections: Section<unknown>[]): Reason | null {
  for (const s of sections) if (!s.ok) return s.reason;
  return null;
}

/** Both sections' data, or the first one's failure. */
export function both<A, B>(a: Section<A>, b: Section<B>): Section<[A, B]> {
  if (!a.ok) return a;
  if (!b.ok) return b;
  return okSection([a.data, b.data]);
}

/** A section's data, transformed; a failure passes through. */
export function mapSection<T, U>(s: Section<T>, f: (data: T) => U): Section<U> {
  return s.ok ? okSection(f(s.data)) : s;
}

/** What the page says for a section it couldn't read. */
export function reasonText(reason: Reason): string {
  switch (reason) {
    case "timeout":
      return "Took too long to load";
    case "not_allowed":
      return "Couldn't confirm it's you";
    case "not_set_up":
      return "Not set up in the database yet";
    default:
      return "Couldn't load";
  }
}

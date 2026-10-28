// "Managed by @a and @b" at the foot of a claimed turf's page: the shape of
// public.turf_managers (supabase/migrations/20261028_turf_managers.sql), the
// line's wording, and the read that never fails the page.
// No "@/" imports so the unit test compiles it on its own (npm run test:turf).

/** One person who runs the turf, as the public may see them: the username and the tick, nothing else. */
export type TurfManager = { u: string; v: boolean };
/** Up to MANAGERS_SHOWN people, and how many more there are. */
export type TurfManagers = { readonly list: readonly TurfManager[]; readonly more: number };

/** Nobody to show: no line. */
export const NO_MANAGERS: TurfManagers = Object.freeze({ list: Object.freeze([]), more: 0 });
/** The line names at most this many; the rest are "and N more". */
export const MANAGERS_SHOWN = 3;
/** usernames.username's check (20261021_accounts_usernames.sql). */
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;

/** turf_managers' answer, checked: valid usernames, each once, at most 3 (the rest counted in more). */
export function shapeTurfManagers(raw: unknown): TurfManagers {
  if (!raw || typeof raw !== "object") return NO_MANAGERS;
  const r = raw as { managers?: unknown; more?: unknown };
  const seen = new Set<string>();
  const all: TurfManager[] = [];
  for (const m of Array.isArray(r.managers) ? r.managers : []) {
    const u = (m as { u?: unknown } | null)?.u;
    if (typeof u !== "string" || !USERNAME.test(u) || seen.has(u)) continue;
    seen.add(u);
    all.push({ u, v: (m as { v?: unknown }).v === true });
  }
  if (all.length === 0) return NO_MANAGERS;
  const more = typeof r.more === "number" && Number.isInteger(r.more) && r.more > 0 ? Math.min(r.more, 999) : 0;
  return { list: all.slice(0, MANAGERS_SHOWN), more: more + Math.max(all.length - MANAGERS_SHOWN, 0) };
}

export type ManagedByPart = { kind: "user"; u: string; v: boolean } | { kind: "text"; text: string };

/** The names and the words between them: "@a", "@a and @b", "@a, @b and @c", "@a, @b, @c and 2 more". Null: no line. */
export function managedByParts(m: TurfManagers): ManagedByPart[] | null {
  const list = m.list.slice(0, MANAGERS_SHOWN);
  if (list.length === 0) return null;
  const out: ManagedByPart[] = [];
  list.forEach((x, i) => {
    if (i > 0) out.push({ kind: "text", text: i === list.length - 1 && m.more === 0 ? " and " : ", " });
    out.push({ kind: "user", u: x.u, v: x.v });
  });
  if (m.more > 0) out.push({ kind: "text", text: ` and ${m.more} more` });
  return out;
}

/** The whole line as text ("Managed by @a and @b"), or null. */
export function managedByText(m: TurfManagers): string | null {
  const parts = managedByParts(m);
  return parts ? `Managed by ${parts.map((p) => (p.kind === "user" ? `@${p.u}` : p.text)).join("")}` : null;
}

/**
 * The note an owner sees on myTapturf about that line. pick: no username
 * yet, so the line leaves them out; hidden: "Let others find and tag me"
 * is off, so it leaves them out too; shown: the public read names them.
 * null: nothing to say, or nothing known yet (before the read, or the
 * TapTurf owner opening a turf they don't run, who is not in the list).
 */
export type ManagerNote = { kind: "pick" } | { kind: "hidden" } | { kind: "shown"; u: string } | null;

export function managerNote({
  username,
  taggable,
  shown,
}: {
  username: string | null | undefined;
  taggable: boolean | null | undefined;
  /** Usernames the public read shows for this turf; null when it was not read. */
  shown: readonly string[] | null;
}): ManagerNote {
  if (!username) return { kind: "pick" };
  if (taggable === false) return { kind: "hidden" };
  return shown?.includes(username) ? { kind: "shown", u: username } : null;
}

/** The part of a Supabase client this needs. */
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => { abortSignal: (s: AbortSignal) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
};

/**
 * Who runs this turf, for the page. Never throws and never waits long: a
 * failed, slow or missing read (a database from before the migration
 * answers PGRST202) hides the line; the page itself never fails over it.
 * The caller's abort is not a database failure, so the read-only
 * client's breaker (lib/supabase/guard.ts) does not count it.
 *
 * A read that failed for now (an error, the timeout, the network; not a
 * missing function) also calls failedForNow, so the page can be kept a
 * minute instead of a day (markStaleRender) and comes back with the line
 * once the database answers. Not an older answer kept in memory: the
 * rebuild may be the one that takes a revoked or hidden manager off.
 */
export async function readTurfManagers(
  db: RpcClient,
  turfId: string,
  {
    timeoutMs = 2500,
    warn = (msg: string) => console.warn(msg),
    failedForNow = async () => {},
  }: { timeoutMs?: number; warn?: (msg: string) => void; failedForNow?: () => Promise<void> } = {},
): Promise<TurfManagers> {
  const forNow = async () => {
    try {
      await failedForNow();
    } catch {
      // Only shortens the page's life; never fails it.
    }
    return NO_MANAGERS;
  };
  try {
    const { data, error } = await db.rpc("turf_managers", { p_turf_id: turfId }).abortSignal(AbortSignal.timeout(timeoutMs));
    if (error) {
      warn(`turf_managers failed for ${turfId}: ${error.message}`);
      return error.code === "PGRST202" ? NO_MANAGERS : await forNow();
    }
    return shapeTurfManagers(data);
  } catch (e) {
    warn(`turf_managers failed for ${turfId}: ${e instanceof Error ? e.message : String(e)}`);
    return await forNow();
  }
}

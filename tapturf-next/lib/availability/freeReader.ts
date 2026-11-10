import { FREE_WINDOW_HOURS, FREE_WINDOW_MAX_HOURS, pageHasNumber, parseFreeAnswer, type FreeAnswer, type FreeRow } from "./free";

// Relative imports only, so node --test runs this (lib/availability/freeReader.test.ts).

/**
 * The one cached reader of free hours nearby (lib/queries/freeSlots.ts
 * wires it to the database): public.free_slots_now for a city or all of
 * India, then the turfs' numbers, so a turf whose page has no number to call
 * or WhatsApp is left out (the turf page shows its free slots only beside
 * Call or WhatsApp). Kept a minute in each warm instance, per city and
 * window; callers that arrive while a read runs share it. A failed read
 * gives the last copy while it is under STALE_MS old (its hours that have
 * started drop out where it is used: lib/availability/free.ts freeCardOf),
 * else throws, so a list says it couldn't load rather than "none marked".
 * Before 20261111_free_slots_nearby.sql (the function missing): no turfs.
 *
 * Nothing here runs unless a list asks for the "Free hours marked" filter
 * or its count, or Ask is asked for a free hour.
 */

/** A copy is used this long before it is read again (the availability route's s-maxage too). */
export const MEMO_MS = 60_000;
/** A failed read falls back to a copy at most this old. */
export const STALE_MS = 5 * 60_000;

type DbError = { code?: string; message?: string } | null;
export type ReadFree = (city: string | null, hours: number) => Promise<{ data: unknown; error: DbError }>;
/** The numbers of these turfs: rows of id, owner_phone, contact_info, landline_phone, whatsapp_phone. */
export type ReadNumbers = (ids: string[]) => Promise<{ data: unknown; error: DbError }>;

/** The function is not there yet (before the migration): nothing to show. */
const MISSING = new Set(["PGRST202", "42883"]);

/** A read of one city (or all of India, null) and window: the database's answer with the turfs that have no number left out. */
export async function readFreeOnce(read: ReadFree, readNumbers: ReadNumbers, city: string | null, hours: number): Promise<FreeAnswer> {
  const { data, error } = await read(city, hours);
  if (error) {
    if (error.code && MISSING.has(error.code)) return { now: new Date().toISOString(), rows: [] };
    throw new Error(`free_slots_now: ${error.code ?? ""} ${error.message ?? ""}`.trim());
  }
  const answer = parseFreeAnswer(data);
  if (!answer) throw new Error("free_slots_now sent something else");
  if (!answer.rows.length) return answer;
  const nums = await readNumbers(answer.rows.map((r) => r.id));
  if (nums.error || !Array.isArray(nums.data)) throw new Error(`turf numbers: ${nums.error?.message ?? "no list"}`);
  const reachable = new Set<string>();
  for (const n of nums.data as Record<string, unknown>[]) if (n && typeof n.id === "string" && pageHasNumber(n)) reachable.add(n.id);
  return { now: answer.now, rows: answer.rows.filter((r: FreeRow) => reachable.has(r.id)) };
}

/** The window a caller asks for, held to the two the reader keeps: the lists' 36 hours, or 8 days. */
export function windowOf(hours: number): number {
  return hours > FREE_WINDOW_HOURS ? FREE_WINDOW_MAX_HOURS : FREE_WINDOW_HOURS;
}

/** The reader, memoised per city and window. clock: Date.now, or a test's. */
export function makeFreeReader(read: ReadFree, readNumbers: ReadNumbers, clock: () => number = Date.now) {
  const memo = new Map<string, { at: number; value: FreeAnswer }>();
  const pending = new Map<string, Promise<FreeAnswer>>();
  let failLoggedAt = -Infinity;
  return (city: string | null, hours: number = FREE_WINDOW_HOURS): Promise<FreeAnswer> => {
    const h = windowOf(hours);
    const key = `${city ?? ""}|${h}`;
    const hit = memo.get(key);
    if (hit && clock() - hit.at < MEMO_MS) return Promise.resolve(hit.value);
    const running = pending.get(key);
    if (running) return running;
    const p = readFreeOnce(read, readNumbers, city, h)
      .then((value) => {
        memo.set(key, { at: clock(), value });
        return value;
      })
      .catch((e) => {
        if (clock() - failLoggedAt > 30_000) {
          failLoggedAt = clock();
          console.warn("free slots: read failed", e instanceof Error ? e.message : e);
        }
        if (hit && clock() - hit.at < STALE_MS) return hit.value;
        throw e;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, p);
    return p;
  };
}

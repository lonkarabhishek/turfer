import { MAX_CHANGES, type SlotChange, type SlotKey, type SlotStatus } from "./slots";

// Relative imports only, so node --test runs this (lib/availability/queue.test.ts).

/**
 * The owner's taps on their free slots (components/my/FreeSlots.tsx), saved
 * one batch at a time: a tap shows at once and goes to `pending`; one batch
 * is in flight at most, and taps made meanwhile wait for the next. A failed
 * save puts every unsaved tap back, so the screen never shows a tap that was
 * not saved as saved.
 *
 *   server:   the booked hours as the database last said
 *   inflight: the batch being saved (null: none)
 *   pending:  taps since, not sent yet
 */
export type Queue = {
  server: ReadonlySet<SlotKey>;
  inflight: ReadonlyMap<SlotKey, SlotStatus> | null;
  pending: ReadonlyMap<SlotKey, SlotStatus>;
};

export function queueOf(booked: SlotKey[]): Queue {
  return { server: new Set(booked), inflight: null, pending: new Map() };
}

function applied(base: ReadonlySet<SlotKey>, changes: ReadonlyMap<SlotKey, SlotStatus> | null): Set<SlotKey> {
  const s = new Set(base);
  if (changes) for (const [k, v] of changes) {
    if (v === "booked") s.add(k);
    else s.delete(k);
  }
  return s;
}

/** What the batch in flight leaves (the server's, once it lands): a tap equal to this is no change. */
const baseOf = (q: Queue) => applied(q.server, q.inflight);

/** The booked hours on screen: the server's, then the batch in flight, then the taps since. */
export function shown(q: Queue): Set<SlotKey> {
  return applied(baseOf(q), q.pending);
}

/** True while the hour has a tap that is not saved yet. */
export function unsaved(q: Queue, key: SlotKey): boolean {
  return !!q.inflight?.has(key) || q.pending.has(key);
}

function put(base: Set<SlotKey>, pending: Map<SlotKey, SlotStatus>, key: SlotKey, status: SlotStatus) {
  if ((base.has(key) ? "booked" : "free") === status) pending.delete(key);
  else pending.set(key, status);
}

/** One tap: the hour flips (a second tap before it is sent cancels the first). */
export function tap(q: Queue, key: SlotKey): Queue {
  const next: SlotStatus = shown(q).has(key) ? "free" : "booked";
  const pending = new Map(q.pending);
  put(baseOf(q), pending, key, next);
  return { ...q, pending };
}

/** Several hours set at once (the whole-day button, and its Undo). */
export function tapMany(q: Queue, changes: SlotChange[]): Queue {
  const base = baseOf(q);
  const pending = new Map(q.pending);
  for (const c of changes) put(base, pending, c.at, c.status);
  return { ...q, pending };
}

/** The next batch to save (at most MAX_CHANGES), moved to in flight; null while one is in flight or nothing waits. */
export function takeBatch(q: Queue): { q: Queue; batch: SlotChange[] } | null {
  if (q.inflight || q.pending.size === 0) return null;
  const entries = [...q.pending.entries()];
  const sent = entries.slice(0, MAX_CHANGES);
  return {
    q: { server: q.server, inflight: new Map(sent), pending: new Map(entries.slice(MAX_CHANGES)) },
    batch: sent.map(([at, status]) => ({ at, status })),
  };
}

/** The batch is saved: the database's booked hours, the taps since kept (less any that now match it). */
export function settle(q: Queue, booked: SlotKey[]): Queue {
  const server = new Set(booked);
  const pending = new Map<SlotKey, SlotStatus>();
  for (const [k, v] of q.pending) if ((server.has(k) ? "booked" : "free") !== v) pending.set(k, v);
  return { server, inflight: null, pending };
}

/** The save failed: every unsaved tap is put back. */
export function fail(q: Queue): Queue {
  return { server: q.server, inflight: null, pending: new Map() };
}

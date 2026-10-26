import { accountId, verifiedBatches } from "./verified";

/**
 * Which accounts show the tick, as one tab knows it: the ids its pages
 * ask about are collected for a moment and read together, 50 to a
 * request, and each answer is kept for a minute. Unknown is false, so a
 * tick only ever appears (after hydration), never flickers off. No React
 * here (components/account/useVerified.ts wraps it); relative imports
 * only (npm run test:verified).
 */

export type VerifiedStore = {
  /** Whether this account shows the tick, as far as this tab knows (false until it knows). */
  get(id: string): boolean;
  /** Ask about this account soon, unless a fresh answer is already here or on its way. */
  want(id: string): void;
  subscribe(listener: () => void): () => void;
};

export type VerifiedStoreOptions = {
  /** One read: the ticked ids among these, or null when it failed. */
  fetchBatch: (ids: string[]) => Promise<string[] | null>;
  now?: () => number;
  /** How long ids are collected before a read. */
  collectMs?: number;
  /** How long an answer is kept. */
  keepMs?: number;
  /** How long a failed read waits before those ids are asked again. */
  retryMs?: number;
  schedule?: (run: () => void, ms: number) => void;
};

export function createVerifiedStore(o: VerifiedStoreOptions): VerifiedStore {
  const now = o.now ?? Date.now;
  const collectMs = o.collectMs ?? 30;
  const keepMs = o.keepMs ?? 60_000;
  const retryMs = o.retryMs ?? 30_000;
  const schedule = o.schedule ?? ((run, ms) => void setTimeout(run, ms));
  /** id -> the answer and until when it holds. */
  const known = new Map<string, { v: boolean; until: number }>();
  const pending = new Set<string>();
  const queued = new Set<string>();
  const listeners = new Set<() => void>();
  let scheduled = false;

  const notify = () => {
    for (const l of [...listeners]) l();
  };

  const flush = async () => {
    scheduled = false;
    const ids = [...queued];
    queued.clear();
    const batches = verifiedBatches(ids);
    for (const id of batches.flat()) pending.add(id);
    await Promise.all(
      batches.map(async (batch) => {
        let ticked: string[] | null = null;
        try {
          ticked = await o.fetchBatch(batch);
        } catch {
          ticked = null;
        }
        const yes = new Set(ticked ?? []);
        const t = now();
        for (const id of batch) {
          pending.delete(id);
          const prev = known.get(id);
          // A failed read keeps what was known (or false) and tries again later.
          known.set(id, ticked ? { v: yes.has(id), until: t + keepMs } : { v: prev?.v ?? false, until: t + retryMs });
        }
        notify();
      }),
    );
  };

  return {
    get(id) {
      const k = accountId(id);
      return k ? (known.get(k)?.v ?? false) : false;
    },
    want(id) {
      const k = accountId(id);
      if (!k || pending.has(k) || queued.has(k)) return;
      const have = known.get(k);
      if (have && have.until > now()) return;
      queued.add(k);
      if (!scheduled) {
        scheduled = true;
        schedule(() => void flush(), collectMs);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

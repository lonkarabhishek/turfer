"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createVerifiedStore, type VerifiedStore } from "@/lib/account/verifiedStore";
import { tickedIds } from "@/lib/account/verified";

/**
 * Whether an account shows the verified tick, for names on cached pages
 * (game cards, players, join requests, turf reports). One store per tab:
 * the ids a page asks about are read together through
 * /api/players/verified, which the CDN keeps for a minute, so a busy
 * page costs the database one small read, not one per name. False until
 * the answer is in: the tick appears after hydration and never on the
 * server's copy of a page.
 */

let store: VerifiedStore | null = null;

async function fetchBatch(ids: string[]): Promise<string[] | null> {
  try {
    const res = await fetch(`/api/players/verified?ids=${ids.join(",")}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { verified?: unknown };
    return Array.isArray(body.verified) ? tickedIds(body.verified) : null;
  } catch {
    return null;
  }
}

function theStore(): VerifiedStore {
  store ??= createVerifiedStore({ fetchBatch });
  return store;
}

const noop = () => () => {};
const subscribe = (listener: () => void) => theStore().subscribe(listener);

/**
 * False on the server and while the page hydrates, true after: what the
 * signed-in person sees of their own tick (read from this device) waits
 * for it, so the first render matches the server's copy.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** The tick for this account id (null: none to ask about). */
export function useVerified(id: string | null | undefined): boolean {
  useEffect(() => {
    if (id) theStore().want(id);
  }, [id]);
  return useSyncExternalStore(
    subscribe,
    () => (id ? theStore().get(id) : false),
    () => false,
  );
}

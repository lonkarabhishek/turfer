"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, suggestUsername } from "@/lib/account/client";
import { USERNAME_RE } from "@/lib/account/tag";

/**
 * The username TapTurf gave the signed-in person and keeps for them until
 * they keep it or pick another (lib/account/assigned.ts). Read from the
 * server once per account and page load, shared by everything that shows
 * it (the Me card, the Profile section, the sheet that used to ask), and
 * kept in memory only: it is private, so it is never written to this
 * device's storage.
 *
 * known: the answer is in (or there is nothing to ask). assigned: the
 * name, or null: they chose one already, none was given, or the database
 * is from before 20261128_usernames_assigned.sql.
 */

type Entry = { known: boolean; assigned: string | null };
const UNKNOWN: Entry = { known: false, assigned: null };
const NONE: Entry = { known: true, assigned: null };
const store = new Map<string, Entry>();
const asking = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** What the server said for this account: a given name, or none. */
export function setAssigned(userId: string, assigned: string | null) {
  const next = assigned && USERNAME_RE.test(assigned) ? assigned : null;
  const had = store.get(userId);
  if (had?.known && had.assigned === next) return;
  store.set(userId, next ? { known: true, assigned: next } : NONE);
  for (const fn of listeners) fn();
}

export function useAssignedUsername(): Entry {
  const { user, getToken } = useAuth();
  const userId = user?.id ?? null;
  // Whenever this device knows of no username for them. The profile kept on a phone is checked with the server
  // only once a day, so the answer is asked for here: it says a username they chose elsewhere just as well.
  const ask = !!userId && !user?.username;
  const entry = useSyncExternalStore(
    subscribe,
    () => (userId ? (store.get(userId) ?? UNKNOWN) : NONE),
    () => UNKNOWN,
  );

  useEffect(() => {
    if (!ask || !userId || store.has(userId) || asking.has(userId)) return;
    asking.add(userId);
    void (async () => {
      try {
        const tok = await getToken();
        if (!("token" in tok)) return setAssigned(userId, null);
        const a = await suggestUsername(tok.token);
        const b = a.body as { username?: string | null; assigned?: boolean };
        setAssigned(userId, !errorOf(a) && b.assigned === true && typeof b.username === "string" ? b.username : null);
      } finally {
        asking.delete(userId);
      }
    })();
  }, [ask, userId, getToken]);

  if (!userId || user?.username) return NONE;
  return ask ? entry : UNKNOWN;
}

/** "Change" on the Me card: the Profile section, once it is drawn, puts the cursor in its username box. */
let editAsked = false;
export function askUsernameEdit() {
  editAsked = true;
}
export function takeUsernameEdit(): boolean {
  const was = editAsked;
  editAsked = false;
  return was;
}

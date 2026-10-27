// The admin page's own API calls from the browser, one gate for all of them.
// No "@/" imports, so the unit test compiles it on its own (npm run test:trend).
//
// After the admin home loads, its client parts call five admin routes
// (claims, photos and three progress bars), each a request with the owner's
// session cookie. With an expiring session each of them refreshed the same
// refresh token at once, and Supabase answered "409 Too many concurrent
// token refresh requests" (27 Oct). Through the gate the first call goes
// alone, after the browser's own session check (which refreshes and stores
// the new cookie if one is due); the rest follow a few at a time with the
// fresh cookie, so none of them needs to refresh.

import { createLimiter } from "./section";

export type Gate = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * The first task runs alone, after `before` (its failure is ignored); every
 * later one waits for the first to settle, then runs at most `max` at a time.
 */
export function createGate(max: number, before?: () => Promise<unknown>): Gate {
  const limit = createLimiter(max);
  let opened: Promise<void> | null = null;
  return <T>(task: () => Promise<T>): Promise<T> => {
    if (opened) return opened.then(() => limit(task));
    let open!: () => void;
    opened = new Promise<void>((resolve) => (open = resolve));
    const first = (async () => {
      try {
        await before?.();
      } catch {
        // The browser's session check failing must not stop the page's own calls.
      }
      return task();
    })();
    first.then(open, open);
    return first;
  };
}

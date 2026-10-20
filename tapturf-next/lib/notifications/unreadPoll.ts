/**
 * When the header checks the unread notification count. Before the 20 Oct
 * outage it ran every 30 s in every signed-in tab, hidden or not and with
 * no backoff (568 checks overnight from one tab, still firing while the
 * database was down). Now: on load, when the tab comes back or gets
 * focus, then every 5 min while visible; after failures the wait doubles,
 * up to 30 min.
 */
export const UNREAD_EVERY_MS = 5 * 60_000;
export const UNREAD_MAX_WAIT_MS = 30 * 60_000;
/** Coming back to the tab within this long of the last check does not check again. */
export const UNREAD_MIN_GAP_MS = 30_000;

/** Wait before the next timed check: 5 min, doubled per failure in a row, at most 30 min. */
export function unreadWait(failures: number): number {
  return Math.min(UNREAD_EVERY_MS * 2 ** Math.max(0, failures), UNREAD_MAX_WAIT_MS);
}

/**
 * On focus or tab show: 0 means check now; otherwise how long until the
 * next timed check is due (a failing database keeps its backoff).
 */
export function wakeWait(now: number, lastAt: number, failures: number): number {
  const due = lastAt + unreadWait(failures);
  if (failures === 0 && now - lastAt >= UNREAD_MIN_GAP_MS) return 0;
  return Math.max(0, due - now);
}

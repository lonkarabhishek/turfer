import { LIVE_CODE_RE, LIVE_LINKS_KEY, LIVE_SECRET_RE, type LiveLinkRecord, type LiveLinks } from "../../../lib/live/types";

/* ------------------------------------------------------------------ */
/* Live link records: shared by the cricket scorer and the scoreboard */
/* ------------------------------------------------------------------ */

/** Plenty for a season of match days. Past it the oldest go; their links stop taking writes 36 hours in, or 2 hours after the last, anyway. */
const MAX_LINKS = 40;
const STOPPED = new Set<LiveLinkRecord["stopped"]>(["off", "gone", "closed", "forbidden", "limit", "too_big"]);
const LINK_ID = /^[a-z0-9]{1,24}$/i;

/** A stored record rebuilt field by field, or null if it does not look like one. */
function readLink(x: unknown): LiveLinkRecord | null {
  if (!x || typeof x !== "object") return null;
  const l = x as Partial<LiveLinkRecord>;
  if (typeof l.code !== "string" || !LIVE_CODE_RE.test(l.code) || typeof l.secret !== "string" || !LIVE_SECRET_RE.test(l.secret)) return null;
  if (typeof l.on !== "boolean" || !Number.isSafeInteger(l.rev) || !Number.isSafeInteger(l.sentRev) || typeof l.createdAt !== "number" || !Number.isFinite(l.createdAt)) return null;
  const rec: LiveLinkRecord = { code: l.code, secret: l.secret, on: l.on, rev: l.rev as number, sentRev: l.sentRev as number, createdAt: l.createdAt };
  if (l.stopped && STOPPED.has(l.stopped)) rec.stopped = l.stopped;
  return rec;
}

/**
 * The scorer's live link records, per match id, under their own key
 * (lib/live/types.ts says why), so dropping old matches never loses a
 * link's secret.
 */
export function loadLinks(): LiveLinks {
  const links: Record<string, LiveLinkRecord> = {};
  try {
    const raw = localStorage.getItem(LIVE_LINKS_KEY);
    const x = raw ? (JSON.parse(raw) as Partial<LiveLinks>) : null;
    if (x && x.v === 1 && x.links && typeof x.links === "object") {
      for (const [id, l] of Object.entries(x.links)) {
        const rec = LINK_ID.test(id) ? readLink(l) : null;
        if (rec) links[id] = rec;
      }
    }
  } catch {
    /* blocked or broken: no links */
  }
  return { v: 1, links };
}

/** Save one match's record, or drop it with null. Reads the others fresh, so another tab's links are kept. */
export function saveLink(id: string, rec: LiveLinkRecord | null) {
  const { links } = loadLinks();
  const rest = Object.entries(links).filter(([k]) => k !== id);
  const list = rec ? [[id, rec] as const, ...rest] : rest;
  const kept = list.sort((a, b) => b[1].createdAt - a[1].createdAt).slice(0, MAX_LINKS);
  try {
    localStorage.setItem(LIVE_LINKS_KEY, JSON.stringify({ v: 1, links: Object.fromEntries(kept) } satisfies LiveLinks));
  } catch {
    /* storage full or blocked: the link works for this visit */
  }
}

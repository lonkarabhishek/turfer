import { isSlotKey, ownerStatus, parseOwner, type OwnerSlots, type SlotKey } from "../availability/slots";

// Relative imports only, so node --test runs this (lib/my/adminSlots.test.ts, npm run test:my).

/**
 * The site owner's read-only Slots tab on myTapturf (components/my/AdminSlots.tsx).
 * The site owner opens any turf there, but only someone who runs a turf may
 * mark its free slots (players read them as the owner's), so for them the
 * tab shows the turf's slots as its owner sees them, with nothing to tap,
 * and its booking requests by time alone: never a player's name, number or
 * note (the privacy page promises those go to the turf's owner and managers
 * only). The database's admin_turf_slots
 * (supabase/migrations/20261106_admin_slots_view.sql) answers the site owner
 * alone and returns no such field; parseAdminSlots keeps only the fields
 * below all the same.
 */

/** A request as the site owner sees it: when, how long, and whether it waits or is confirmed. */
export type AdminRequest = { at: SlotKey; hours: number; when: string; status: "waiting" | "confirmed" };
/** The turf's booking requests by time: the switch, whether players can send now, and the waiting and confirmed ones. */
export type AdminRequests = { on: boolean; open: boolean; waiting: AdminRequest[]; confirmed: AdminRequest[] };
/** admin_turf_slots' answer: the owner's view of the slots (owner_slots), and the requests. */
export type AdminSlots = { slots: OwnerSlots; requests: AdminRequests | null };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const MAX_WHEN = 60;

function row(x: unknown, status: AdminRequest["status"]): AdminRequest | null {
  if (!isObj(x) || !isSlotKey(x.at) || typeof x.when !== "string" || !x.when || x.when.length > MAX_WHEN) return null;
  if (typeof x.hours !== "number" || !Number.isInteger(x.hours) || x.hours < 1 || x.hours > 3) return null;
  return { at: x.at, hours: x.hours, when: x.when, status };
}

function requestsOf(x: unknown): AdminRequests | null {
  if (!isObj(x) || typeof x.on !== "boolean" || typeof x.open !== "boolean" || !Array.isArray(x.waiting) || !Array.isArray(x.confirmed)) return null;
  const rows = (a: unknown[], s: AdminRequest["status"]) => a.map((r) => row(r, s)).filter((r): r is AdminRequest => !!r);
  return { on: x.on, open: x.open, waiting: rows(x.waiting, "waiting"), confirmed: rows(x.confirmed, "confirmed") };
}

/** admin_turf_slots' answer: the view, an error (forbidden, not_claimed), or null for anything malformed. Only the fields above are kept. */
export function parseAdminSlots(json: unknown): AdminSlots | { error: string } | null {
  if (!isObj(json)) return null;
  if (typeof json.error === "string") return { error: json.error };
  if (json.admin !== true) return null;
  const slots = parseOwner(json);
  if (!slots || "error" in slots) return null;
  return { slots, requests: requestsOf(json.requests) };
}

/** The words of the site owner's Slots tab. */
export const ADMIN_COPY = {
  banner: (turf: string) => `Admin view: you see ${turf}'s slots as its owner does. Only its owner, managers and staff can change them.`,
  requests: "Booking requests",
  on: "On",
  off: "Off",
  open: "Players can send requests now.",
  waitHours: "Players can't send requests until the owner's free hours show.",
  turnedOff: "The owner hasn't turned them on, so players can't send any.",
  none: "No waiting or confirmed requests.",
  private: "Player names and numbers show only to the turf's owner and managers.",
  noHours: "This turf has no opening hours yet, so there are no hours to show. Its owner picks them the first time they open Slots.",
  footnote: "Players see free slots for 24 hours after the owner's last tap or All correct.",
  grounds: (n: number) => `${n} grounds: the owner marks an hour Booked only when all of them are taken.`,
  hour: (range: string, booked: boolean) => `${range}, ${booked ? "booked" : "free"}. Read only.`,
} as const;

/** The status line, as the owner's but about the owner: whether players see the slots, and since when. */
export function adminStatus(updatedAt: string | null, nowMs: number, hasNumber = true): { kind: ReturnType<typeof ownerStatus>["kind"]; line: string } {
  const s = ownerStatus(updatedAt, nowMs, hasNumber);
  if (s.kind === "no_number") return { kind: s.kind, line: "Players don't see these: the turf's page has no number to call or WhatsApp yet." };
  if (s.kind === "never") return { kind: s.kind, line: "Players don't see this yet: the owner hasn't shown the free hours." };
  // live, ending, hidden: the owner's own line ("Players see this · updated 2 h ago") says nothing to do.
  return { kind: s.kind, line: s.line };
}

/**
 * The booking requests card: "Booking requests: On", whether players can send
 * now, the counts, and each request by time alone ("Sat 8 Nov, 7 PM to 9 PM ·
 * waiting"), soonest first.
 */
export function adminRequestLines(r: AdminRequests): {
  state: string;
  status: string;
  counts: string;
  rows: { key: string; when: string; status: AdminRequest["status"]; text: string }[];
} {
  const all = [...r.waiting, ...r.confirmed].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.status === b.status ? 0 : a.status === "confirmed" ? -1 : 1));
  return {
    state: r.on ? ADMIN_COPY.on : ADMIN_COPY.off,
    status: !r.on ? ADMIN_COPY.turnedOff : r.open ? ADMIN_COPY.open : ADMIN_COPY.waitHours,
    counts: all.length ? `${r.waiting.length} waiting · ${r.confirmed.length} confirmed` : ADMIN_COPY.none,
    rows: all.map((x, i) => ({ key: `${x.status}-${x.at}-${x.hours}-${i}`, when: x.when, status: x.status, text: `${x.when} · ${x.status}` })),
  };
}

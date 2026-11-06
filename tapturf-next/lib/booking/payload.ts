import { isSlotKey } from "../availability/slots";
import { MAX_HOURS, NOTE_MAX } from "./requests";
import type { SendBody } from "./types";

// Relative imports only (lib/booking/payload.test.ts, npm run test:booking).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = new Set(["turf_id", "at", "hours", "note"]);
// Control characters (C0, DEL, C1) and the line and paragraph separators: a note is one plain line.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]", "g");

export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/** A note for the turf as it is kept: control characters out, whitespace folded, trimmed; empty is none; null when too long. */
export function cleanNote(raw: unknown): { ok: string | null } | { bad: true } {
  if (raw === undefined || raw === null) return { ok: null };
  if (typeof raw !== "string") return { bad: true };
  const s = raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (!s) return { ok: null };
  return [...s].length > NOTE_MAX ? { bad: true } : { ok: s };
}

/**
 * POST /api/booking-requests's body: { turf_id, at, hours, note }. The turf's
 * id (lowercased), an hour's slot key, 1 to MAX_HOURS whole hours, and an
 * optional note. Anything else is refused with the field it is in, before
 * the database is asked.
 */
export function parseSend(body: Record<string, unknown> | null): { ok: SendBody } | { bad: string } {
  if (!body) return { bad: "body" };
  const extra = Object.keys(body).find((k) => !KEYS.has(k));
  if (extra) return { bad: /^[a-z_]{1,24}$/.test(extra) ? extra : "body" };
  if (!isUuid(body.turf_id)) return { bad: "turf_id" };
  if (!isSlotKey(body.at)) return { bad: "at" };
  const h = body.hours;
  if (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > MAX_HOURS) return { bad: "hours" };
  const note = cleanNote(body.note);
  if ("bad" in note) return { bad: "note" };
  return { ok: { turf_id: body.turf_id.toLowerCase(), at: body.at, hours: h, note: note.ok } };
}

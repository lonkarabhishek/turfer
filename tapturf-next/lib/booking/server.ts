import type { NextResponse } from "next/server";
import { accountError, accountReply, caller } from "../account/route";
import { accountRpcIfThere, createAccountLimiter, notePhoneChecked, readSmallJson, resolveAccount, type Rpc } from "../account/server";
import { isSlotKey, type SlotHours } from "../availability/slots";
import { anonDb } from "../games/db";
import { isUuid, parseSend } from "./payload";
import { requestFits } from "./requests";

// Booking requests for players: app/api/booking-requests (lib/booking/types.ts
// has the API). As the games routes (lib/games/server.ts): the verified
// caller (lib/account/route.ts caller) -> the account it opens
// (resolveAccount, never made here) -> a server-key function
// (20261106_booking_requests.sql) that takes that account's id and checks
// every rule itself. The browser never names a user id. Answers carry only
// the keys below: never a name or a phone number. Relative imports only
// (npm run test:booking).

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);

type Who = { userId: string; phone: string | null } | { reply: NextResponse };

/** The account this sign-in opens (and a phone sign-in's verified number), or the reply to send instead. */
async function who(req: Request, allow: (req: Request) => boolean): Promise<Who> {
  const c = await caller(req, allow);
  if ("reply" in c) return c;
  const r = await resolveAccount(c.id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id, phone: c.id.kind === "phone" ? c.id.phone : null };
}

const NOT_READY = () => accountReply({ reason: "not_ready" }, "unavailable");
const FIELD = /^[a-z_]{1,24}$/;
const STATUSES = new Set(["waiting", "confirmed", "declined", "cancelled", "expired"]);
const MINE_KEYS = ["id", "turf_id", "turf_name", "turf_slug", "at", "hours", "when", "note", "status", "changed_by", "reason", "created_at", "changed_at", "can_cancel"] as const;

/** A request as its player may see it: these keys only. */
function mineView(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  return Object.fromEntries(MINE_KEYS.filter((k) => k in r).map((k) => [k, r[k]]));
}

/** A refusal from the booking functions, as the routes send it. */
function refusal(d: Record<string, unknown>): NextResponse {
  switch (d.r) {
    case "bad":
      return accountReply(typeof d.field === "string" && FIELD.test(d.field) ? { field: d.field } : {}, "bad");
    case "gone":
      return accountReply({ reason: "gone" }, "bad");
    case "off":
    case "own":
    case "no_phone":
    case "started":
      return accountReply({ reason: d.r }, "not_allowed");
    case "taken":
      return accountReply({ reason: "taken", booked: Array.isArray(d.booked) ? d.booked.filter(isSlotKey) : [] }, "conflict");
    case "past":
      return accountReply({ reason: "past" }, "conflict");
    case "answered":
      return accountReply({ reason: "answered", status: typeof d.status === "string" && STATUSES.has(d.status) ? d.status : null }, "conflict");
    case "limit":
      return accountReply({ reason: d.kind === "day" || d.kind === "overlap" || d.kind === "waiting" || d.kind === "sends" ? d.kind : "waiting" }, "limit");
    default:
      return accountError("unavailable");
  }
}

/** One write: its ok answer as `ok` makes it, else its refusal; not_ready while the database has no booking functions. */
async function run(fn: string, args: Record<string, unknown>, ok: (d: Record<string, unknown>) => object): Promise<NextResponse> {
  const res: Rpc | { missing: true } = await accountRpcIfThere(fn, args);
  if ("missing" in res) return NOT_READY();
  if ("unavailable" in res) return accountError("unavailable");
  return res.data.r === "ok" ? accountReply(ok(res.data)) : refusal(res.data);
}

/** The turf's opening hours as its page shows them: the hours, none (not a turf), or the read failed. */
async function turfHours(turfId: string): Promise<SlotHours | "none" | "failed"> {
  try {
    const { data, error } = await anonDb().from("turfs").select("opening_hours,start_time,end_time,is_24x7,closed_days").eq("id", turfId).limit(1);
    if (error) return "failed";
    const t = (data as Record<string, unknown>[] | null)?.[0];
    if (!t) return "none";
    const s = (v: unknown) => (typeof v === "string" ? v : null);
    return {
      opening_hours: t.opening_hours && typeof t.opening_hours === "object" ? (t.opening_hours as SlotHours["opening_hours"]) : null,
      start_time: s(t.start_time),
      end_time: s(t.end_time),
      is_24x7: typeof t.is_24x7 === "boolean" ? t.is_24x7 : null,
      closed_days: s(t.closed_days),
    };
  } catch {
    return "failed";
  }
}

/** POST /api/booking-requests { turf_id, at, hours, note }: the caller asks the turf for those hours. */
export async function postBookingRequest(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const p = parseSend(await readSmallJson(req, 1_000));
  if ("bad" in p) return accountReply({ field: p.bad }, "bad");
  // A phone sign-in's number is the one the token proves: record it, so the database counts it as proved.
  if (w.phone) await notePhoneChecked(w.userId, w.phone);
  const hours = await turfHours(p.ok.turf_id);
  if (hours === "failed") return accountError("unavailable");
  if (hours === "none") return accountReply({ reason: "off" }, "not_allowed");
  if (!requestFits(hours, Date.now(), p.ok.at, p.ok.hours)) return accountReply({ field: "at" }, "bad");
  return run(
    "booking_request_send",
    { p_user_id: w.userId, p_turf_id: p.ok.turf_id, p_at: p.ok.at, p_hours: p.ok.hours, p_note: p.ok.note },
    (d) => ({ r: "ok", request: mineView(d.request) }),
  );
}

/** GET /api/booking-requests: the caller's requests, newest first. ready: false (and none) until the database has them. */
export async function getBookingRequests(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const res = await accountRpcIfThere("booking_requests_mine", { p_user_id: w.userId });
  if ("missing" in res) return accountReply({ ready: false, requests: [] });
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r !== "ok") return refusal(res.data);
  const list = Array.isArray(res.data.requests) ? res.data.requests.map(mineView).filter(Boolean) : [];
  return accountReply({ ready: true, requests: list });
}

/**
 * DELETE /api/booking-requests/[id]?expect=waiting|confirmed: the caller
 * cancels their own request (waiting or confirmed, before it starts).
 * expect is the state their screen showed: when the request is in another
 * one now (the turf confirmed it meanwhile), the database changes nothing
 * and answers answered, so a one-tap cancel of a waiting request never
 * cancels a booking. Without it, either state is cancelled.
 */
export async function deleteBookingRequest(req: Request, requestId: string): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  if (!isUuid(requestId)) return accountError("bad");
  const asked = new URL(req.url).searchParams.get("expect");
  if (asked !== null && asked !== "waiting" && asked !== "confirmed") return accountReply({ field: "expect" }, "bad");
  return run("booking_request_cancel", { p_user_id: w.userId, p_request_id: requestId.toLowerCase(), p_expect: asked }, (d) => ({
    r: "ok",
    status: "cancelled",
    request: mineView(d.request),
  }));
}

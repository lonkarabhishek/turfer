import { NextResponse } from "next/server";
import { accountError, accountReply } from "../account/route";
import { accountRpcIfThere, createAccountLimiter, PRIVATE_HEADERS, readSmallJson } from "../account/server";
import { who } from "../reviews/server";
import { isUuid } from "../reviews/payload";
import { MAX_GROUNDS, normaliseGrounds, toGroundSizes, type Dim, type Ground, type InputProblem } from "../turfSize/sizes";
import type { GroundSizesError, GroundSizesSaved, GroundSizesState } from "../turfSize/api";

// Ground sizes on myTapturf, for app/api/my/ground-sizes (lib/turfSize/api.ts
// has the API). The verified caller (lib/reviews/server.ts who: the sign-in,
// then the account it opens, never made here) -> a server-key RPC that takes
// that account's id and decides whether it runs the turf
// (20261102_turf_dimensions.sql). The browser never names a user id.
// Metres become feet here (lib/turfSize/sizes.ts); the database checks the
// feet again. Relative imports only (npm run test:my).

const allowRead = createAccountLimiter(30);
const allowWrite = createAccountLimiter(12);

const refuse = (status: number, body: GroundSizesError) => NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
const notOwner = () => refuse(403, { error: "not_allowed", reason: "not_owner" });
const gone = () => refuse(404, { error: "bad", reason: "gone" });

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** The researched size the database sends (length_feet...), as a ground the form can show; null when it breaks the rules. */
function legacyOf(x: unknown): Ground | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const s = toGroundSizes({ grounds: [{ length_ft: num(o.length_ft), width_ft: num(o.width_ft), height_ft: num(o.height_ft) }] });
  return s?.grounds[0] ?? null;
}

/** GET ?turf=<uuid>: the saved sizes, the researched one and the saves left, for the turf's owners only. */
export async function getGroundSizes(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const turf = new URL(req.url).searchParams.get("turf");
  if (!isUuid(turf)) return accountError("bad");
  const res = await accountRpcIfThere("turf_ground_sizes_mine", { p_user_id: w.userId, p_turf_id: turf.toLowerCase() });
  if ("missing" in res) return accountReply({ ready: false } satisfies GroundSizesState);
  if ("unavailable" in res) return accountError("unavailable");
  const d = res.data;
  if (d.r === "forbidden") return notOwner();
  if (d.r === "gone") return gone();
  if (d.r !== "ok") return accountError("unavailable");
  const left = num(d.saves_left);
  return accountReply({ ready: true, sizes: toGroundSizes(d.ground_sizes), legacy: legacyOf(d.legacy), saves_left: left == null ? 0 : left } satisfies GroundSizesState);
}

const FIELDS = new Set(["length", "width", "height", "name", "sport", "unit", "grounds"]);

/** The database's refusal of one box, in the form's words (it checks what this file already checked, so it rarely says more). */
function dbProblem(d: Record<string, unknown>): InputProblem {
  const field = typeof d.field === "string" && FIELDS.has(d.field) ? d.field : "grounds";
  const ground = typeof d.ground === "number" && Number.isInteger(d.ground) ? d.ground : -1;
  if (field === "name") return { ground, field, why: "long" };
  if (field === "sport") return { ground, field, why: "sport" };
  if (field === "unit" || field === "grounds") return { ground: -1, field: "grounds", why: "count" };
  return { ground, field: field as Dim, why: "range" };
}

/**
 * POST { turf_id, unit, grounds }: save the turf's grounds. onSaved runs
 * after a change was stored (the route rebuilds the page there); it never
 * fails the answer.
 */
export async function postGroundSizes(req: Request, onSaved?: (turfId: string) => Promise<void> | void): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const body = await readSmallJson(req, 4_000);
  if (!body || !isUuid(body.turf_id) || (body.unit !== "ft" && body.unit !== "m") || !Array.isArray(body.grounds)) return accountError("bad");
  if (body.grounds.length > MAX_GROUNDS) return refuse(400, { error: "bad", problem: { ground: -1, field: "grounds", why: "count" } });
  const grounds = body.grounds.map((g) => (g && typeof g === "object" && !Array.isArray(g) ? (g as Record<string, unknown>) : {}));
  const n = normaliseGrounds(body.unit, grounds);
  if ("problem" in n) return refuse(400, { error: "bad", problem: n.problem });
  const turfId = body.turf_id.toLowerCase();
  const res = await accountRpcIfThere("turf_ground_sizes_save", { p_user_id: w.userId, p_turf_id: turfId, p_sizes: { unit: body.unit, grounds: n.ok } });
  if ("missing" in res) return refuse(503, { error: "unavailable", reason: "not_ready" });
  if ("unavailable" in res) return accountError("unavailable");
  const d = res.data;
  switch (d.r) {
    case "ok":
      break;
    case "forbidden":
      return notOwner();
    case "gone":
      return gone();
    case "limit":
      return refuse(429, { error: "limit", reason: "limit" });
    case "bad":
      return refuse(400, { error: "bad", problem: dbProblem(d) });
    default:
      return accountError("unavailable");
  }
  const changed = d.changed === true;
  if (changed && onSaved) {
    try {
      await onSaved(turfId);
    } catch (e) {
      // The cache queue rebuilds the page within minutes anyway (the save queued it).
      console.warn("ground sizes: page refresh failed", e instanceof Error ? e.message : e);
    }
  }
  const left = num(d.saves_left);
  return accountReply({ r: "ok", changed, sizes: toGroundSizes(d.ground_sizes), saves_left: left == null ? 0 : left } satisfies GroundSizesSaved);
}

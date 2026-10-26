import type { NextResponse } from "next/server";
import { accountError, accountReply, caller } from "../account/route";
import { accountRpc, createAccountLimiter, readSmallJson, resolveAccount } from "../account/server";
import { isUuid, parseReport } from "./payload";

// Game reports, for app/api/reviews and app/api/reviews/vote
// (lib/reviews/types.ts has the API). Every write goes: the verified
// caller (lib/account/route.ts caller) -> the account it opens
// (resolveAccount, never made here) -> a server-key RPC that takes that
// account's id. The browser never names a user id. Relative imports only
// (npm run test:reviews).

const allowRead = createAccountLimiter(60);
const allowWrite = createAccountLimiter(20);
const allowVote = createAccountLimiter(40);

type Who = { userId: string } | { reply: NextResponse };

/** The account this sign-in opens, or the reply to send instead. */
async function who(req: Request, allow: (req: Request) => boolean): Promise<Who> {
  const c = await caller(req, allow);
  if ("reply" in c) return c;
  const r = await resolveAccount(c.id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id };
}

/** A refusal from the review functions, as the routes send it. */
function refusal(d: Record<string, unknown>): NextResponse {
  switch (d.r) {
    case "own_turf":
      return accountReply({ reason: "own_turf" }, "not_allowed");
    case "exists":
      // The caller's own report, so the sheet can offer to edit it or replace it.
      return accountReply({ reason: "exists", review: d.review ?? null }, "conflict");
    case "contact_info":
      return accountReply({ reason: "contact_info", field: d.field === "note" ? "note" : "comment" }, "bad");
    case "gone":
      return accountReply({ reason: "gone" }, "bad");
    case "own":
    case "google":
      return accountReply({ reason: d.r }, "not_allowed");
    case "limit":
      return accountError("limit");
    case "bad":
      return accountError("bad");
    default:
      return accountError("unavailable");
  }
}

const turfParam = (req: Request) => new URL(req.url).searchParams.get("turf");

/** GET ?turf=: the caller's own report (any status, with its note), their Helpful votes here, whether they manage it, a hint and their price. */
export async function getReviews(req: Request): Promise<NextResponse> {
  const w = await who(req, allowRead);
  if ("reply" in w) return w.reply;
  const turf = turfParam(req);
  if (!isUuid(turf)) return accountError("bad");
  const res = await accountRpc("review_mine", { p_user_id: w.userId, p_turf_id: turf });
  if ("unavailable" in res) return accountError("unavailable");
  const d = res.data;
  if (d.r !== "ok") return refusal(d);
  return accountReply({
    mine: d.mine ?? null,
    voted: Array.isArray(d.voted) ? d.voted.filter((x) => typeof x === "string") : [],
    blocked: d.blocked === "own_turf" ? "own_turf" : null,
    hint: d.hint ?? null,
    my_price: typeof d.my_price === "number" ? d.my_price : null,
  });
}

/** POST: save the caller's report on a turf (the first one, an edit, or posting it again). */
export async function postReview(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const p = parseReport(await readSmallJson(req, 4_000));
  if ("bad" in p) return accountError("bad");
  const { turf_id, ...report } = p.ok;
  const res = await accountRpc("review_save", { p_user_id: w.userId, p_turf_id: turf_id, p_report: report });
  if ("unavailable" in res) return accountError("unavailable");
  const d = res.data;
  if (d.r !== "ok") return refusal(d);
  return accountReply({ r: "ok", created: d.created === true, review: d.review, note: d.note ?? null, after: d.after, price_saved: d.price_saved === true });
}

/** DELETE ?turf=: take the caller's report off the page (it stays, removed; posting again brings it back). */
export async function deleteReview(req: Request): Promise<NextResponse> {
  const w = await who(req, allowWrite);
  if ("reply" in w) return w.reply;
  const turf = turfParam(req);
  if (!isUuid(turf)) return accountError("bad");
  const res = await accountRpc("review_remove", { p_user_id: w.userId, p_turf_id: turf });
  if ("unavailable" in res) return accountError("unavailable");
  if (res.data.r !== "ok") return refusal(res.data);
  return accountReply({ r: "ok" });
}

/** POST /vote { review_id, on }: Helpful on or off, for the caller. */
export async function postVote(req: Request): Promise<NextResponse> {
  const w = await who(req, allowVote);
  if ("reply" in w) return w.reply;
  const body = await readSmallJson(req, 500);
  if (!body || !isUuid(body.review_id) || typeof body.on !== "boolean") return accountError("bad");
  const res = await accountRpc("review_vote", { p_user_id: w.userId, p_review_id: body.review_id, p_on: body.on });
  if ("unavailable" in res) return accountError("unavailable");
  const d = res.data;
  if (d.r !== "ok") return refusal(d);
  return accountReply({ r: "ok", on: d.on === true, upvotes: typeof d.upvotes === "number" ? d.upvotes : 0 });
}

import type { MineResponse, ReportBody, SaveResponse, VoteResponse } from "./types";

/**
 * Browser side of game reports: calls to /api/reviews with this device's
 * sign-in token (useAuth().getToken(), as lib/account/client.ts sends it).
 * Never a user id: the server works out the account from the token.
 * status 0 means offline or the request never got an answer.
 */

export type ReviewAnswer<T> = { status: number; body: T };

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<ReviewAnswer<T | { error: string }>> {
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: a proxy page */
    }
    if (!body || typeof body !== "object") return { status: res.status, body: { error: "unavailable" } };
    return { status: res.status, body: body as T };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

export const getMine = (token: string, turfId: string) => call<MineResponse>(token, `/api/reviews?turf=${encodeURIComponent(turfId)}`);

export const saveReport = (token: string, report: ReportBody) =>
  call<SaveResponse>(token, "/api/reviews", { method: "POST", body: JSON.stringify(report) });

export const removeReport = (token: string, turfId: string) =>
  call<{ r: "ok" }>(token, `/api/reviews?turf=${encodeURIComponent(turfId)}`, { method: "DELETE" });

export const voteReview = (token: string, reviewId: string, on: boolean) =>
  call<VoteResponse>(token, "/api/reviews/vote", { method: "POST", body: JSON.stringify({ review_id: reviewId, on }) });

/** What went wrong, in the sheet's words (lib/reviews/server.ts refusal). */
export type SaveProblem = "own_turf" | "contact_info" | "limit" | "new" | "sign_in" | "gone" | "bad" | "unavailable";

export function problemOf(a: ReviewAnswer<unknown>): { problem: SaveProblem; field?: "comment" | "note" } | null {
  const b = (a.body ?? {}) as { error?: string; reason?: string; field?: string };
  if (!b.error) return null;
  if (b.reason === "own_turf" || b.reason === "contact_info" || b.reason === "gone") {
    return { problem: b.reason, field: b.field === "note" ? "note" : b.field === "comment" ? "comment" : undefined };
  }
  if (b.error === "limit" || b.error === "slow") return { problem: "limit" };
  if (b.error === "new") return { problem: "new" };
  if (b.error === "sign_in") return { problem: "sign_in" };
  if (b.error === "bad") return { problem: "bad" };
  return { problem: "unavailable" };
}

import type { FlagResponse, MineResponse, MyReport, PhotoAddResponse, PhotoReadyResponse, ReportBody, SaveResponse, VoteResponse } from "./types";

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
      // A form (a photo) sets its own type, with its boundary.
      headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
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

/** Whether the sheet can offer photos (20261102_reviews_trust.sql), and how many are left today. */
export const getPhotoReady = (token: string) => call<PhotoReadyResponse>(token, "/api/reviews/photos");

/** A photo and its thumbnail, as the phone made them (lib/reviews/photoPrep.ts): checked, then kept, ready to post with the report. */
export function addPhoto(token: string, turfId: string, full: Blob, thumb: Blob) {
  const form = new FormData();
  const ext = full.type === "image/webp" ? "webp" : "jpg";
  form.append("full", full, `photo.${ext}`);
  form.append("thumb", thumb, `thumb.${ext}`);
  return call<PhotoAddResponse>(token, `/api/reviews/photos?turf=${encodeURIComponent(turfId)}`, { method: "POST", body: form });
}

/** A photo taken out of the sheet before the report was posted. */
export const discardPhoto = (token: string, id: string) => call<{ r: "ok" }>(token, `/api/reviews/photos?id=${encodeURIComponent(id)}`, { method: "DELETE" });

/** "Report this review". */
export const flagReview = (token: string, reviewId: string, reason: string, detail: string | null) =>
  call<FlagResponse>(token, "/api/reviews/flag", { method: "POST", body: JSON.stringify({ review_id: reviewId, reason, detail }) });

/** What went wrong, in the sheet's words (lib/reviews/server.ts refusal). */
export type SaveProblem = "own_turf" | "contact_info" | "limit" | "daily" | "new" | "sign_in" | "gone" | "bad" | "unavailable" | "exists";

export type SaveRefusal = { problem: SaveProblem; field?: "comment" | "note"; existing?: MyReport; allowed?: number; played?: number };

export function problemOf(a: ReviewAnswer<unknown>): SaveRefusal | null {
  const b = (a.body ?? {}) as { error?: string; reason?: string; field?: string; review?: unknown; allowed?: unknown; played?: unknown };
  if (!b.error) return null;
  // Over the day's new reports: how many they may post today and how many turfs they played at.
  if (b.reason === "daily") {
    const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : undefined);
    return { problem: "daily", allowed: n(b.allowed), played: n(b.played) };
  }
  if (b.reason === "exists") {
    const r = b.review as MyReport | null | undefined;
    return r && typeof r === "object" && typeof r.id === "string" && typeof r.rating === "number" ? { problem: "exists", existing: r } : { problem: "exists" };
  }
  if (b.reason === "own_turf" || b.reason === "contact_info" || b.reason === "gone") {
    return { problem: b.reason, field: b.field === "note" ? "note" : b.field === "comment" ? "comment" : undefined };
  }
  if (b.error === "limit" || b.error === "slow") return { problem: "limit" };
  if (b.error === "new") return { problem: "new" };
  if (b.error === "sign_in") return { problem: "sign_in" };
  if (b.error === "bad") return { problem: "bad" };
  return { problem: "unavailable" };
}

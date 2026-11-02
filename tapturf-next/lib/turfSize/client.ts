import type { TokenCheck } from "../account/client";
import type { GroundSizesBody, GroundSizesError, GroundSizesSaved, GroundSizesState } from "./api";

/**
 * Browser side of ground sizes on myTapturf: /api/my/ground-sizes with this
 * device's sign-in token (useAuth().getToken). Never a user id: the server
 * works out the account. status 0: offline or no answer.
 */

export type GroundAnswer<T> = { status: number; body: T | GroundSizesError };

async function call<T>(getToken: () => Promise<TokenCheck>, path: string, init: RequestInit = {}): Promise<GroundAnswer<T>> {
  let t: TokenCheck;
  try {
    t = await getToken();
  } catch {
    t = { unknown: true };
  }
  if (!("token" in t)) return "none" in t ? { status: 401, body: { error: "sign_in" } } : { status: 0, body: { error: "unavailable" } };
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${t.token}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: a proxy page */
    }
    if (!body || typeof body !== "object") return { status: res.status || 0, body: { error: "unavailable" } };
    return { status: res.status, body: body as T };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

export const getGroundSizesCall = (getToken: () => Promise<TokenCheck>, turfId: string) =>
  call<GroundSizesState>(getToken, `/api/my/ground-sizes?turf=${encodeURIComponent(turfId)}`);

export const saveGroundSizesCall = (getToken: () => Promise<TokenCheck>, body: GroundSizesBody) =>
  call<GroundSizesSaved>(getToken, "/api/my/ground-sizes", { method: "POST", body: JSON.stringify(body) });

export const isGroundError = (b: unknown): b is GroundSizesError => !!b && typeof b === "object" && typeof (b as { error?: unknown }).error === "string";

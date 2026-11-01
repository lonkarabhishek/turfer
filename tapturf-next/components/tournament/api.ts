import { hasSignIn, signInKnown, signInToken } from "@/lib/account/client";
import type { CreateBody, CreateResponse, MineItem, Op, PatchResponse, TournamentError, TournamentGetResponse } from "@/lib/tournament/types";

/**
 * The browser's side of live tournaments: the calls to /api/tournament
 * (lib/tournament/types.ts has the flow). A sign-in goes with a create and
 * a claim when this device has one, read quietly (it never signs anyone
 * out). Every answer is read as JSON; a network failure or a page that is
 * not JSON is unavailable.
 */

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<{ status: number; body: T | { error: TournamentError | "other" } }> {
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const body = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, body: body && typeof body === "object" ? body : { error: "unavailable" } };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

/** This device's sign-in token, or null. Right after a page load the sign-in may not be known yet: it waits for it a moment. */
async function token(): Promise<string | null> {
  if (hasSignIn() === null) await signInKnown(5_000);
  const t = await signInToken();
  return "token" in t ? t.token : null;
}

let readyOnce: Promise<boolean> | null = null;

/** Whether live tournaments can be made here (the server has its key and the database its functions). Asked once per page. */
export function tournamentsReady(): Promise<boolean> {
  readyOnce ??= call<{ ready?: boolean }>("/api/tournament").then((r) => (r.body as { ready?: boolean }).ready === true);
  return readyOnce;
}

export async function createTournament(body: CreateBody) {
  return call<CreateResponse & { kept?: boolean; field?: string }>("/api/tournament", { method: "POST", body: JSON.stringify(body) }, await token());
}

export function readTournament(code: string, fresh?: number) {
  // No query string for followers: they share one CDN copy. The organiser's fresh read after a change is its own.
  return call<TournamentGetResponse>(`/api/tournament/${code}${fresh ? `?v=${fresh}` : ""}`);
}

export function changeTournament(code: string, secret: string, op: Op) {
  return call<PatchResponse>(`/api/tournament/${code}`, { method: "PATCH", body: JSON.stringify({ secret, ...op }) });
}

/** Keep it with this device's account, or, on another device of that account, let this device manage it. */
export async function claimTournament(code: string, secret: string) {
  const t = await token();
  if (!t) return { status: 401, body: { error: "login" as const } };
  return call<{ kept: true; device: boolean; account: string }>(`/api/tournament/${code}/claim`, { method: "POST", body: JSON.stringify({ secret }) }, t);
}

export async function myTournaments(): Promise<MineItem[] | null> {
  const t = await token();
  if (!t) return null;
  const r = await call<{ list: MineItem[] | null }>("/api/tournament/mine", {}, t);
  const list = (r.body as { list?: unknown }).list;
  return Array.isArray(list) ? (list as MineItem[]) : null;
}

/** What an error says to the organiser. */
export function errorText(e: TournamentError | "other" | string | undefined, field?: string): string {
  switch (e) {
    case "forbidden":
      return "This phone can't change this tournament. Open it on the phone that set it up, or sign in with the account it is kept with.";
    case "gone":
      return "This tournament has been taken down.";
    case "taken":
      return "Another team already has that name.";
    case "limit":
      return "Too many new tournaments from this network today. Try again later.";
    case "busy":
      return "Lots of tournaments are being set up right now. Try again in a few minutes.";
    case "slow":
      return "One moment, then try again.";
    case "other":
      return "This tournament is kept with another account.";
    case "login":
      return "Sign in first.";
    case "bad":
      return field === "team_names" ? "Every team needs a name, and no two the same." : field === "teams" ? "Check the number of teams for this format." : field === "name" ? "Give the tournament a name." : "Something in that didn't look right. Check it and try again.";
    default:
      return "Couldn't reach TapTurf. Check your connection and try again.";
  }
}

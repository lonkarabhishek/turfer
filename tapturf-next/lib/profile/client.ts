import { firebaseToken, supabaseToken, type TokenCheck } from "../account/client";
import type { AccountError } from "../account/types";
import type { PassportResponse, PlayedResponse, WhatsAppResponse, WhatsAppState } from "./types";

/**
 * Browser side of the passport routes (lib/profile/types.ts). The played
 * read (the "You played here" badges, the home's streak) is made at most
 * once per tab session per person: kept in memory and in sessionStorage
 * for an hour, shared by every card on the page. Its token is read
 * quietly: a missing phone sign-in only means no badges here, never a
 * sign-out (AuthProvider's getToken decides that on the pages that need one).
 */

type SignedIn = "phone" | "google";

const quietToken = (how: SignedIn): Promise<TokenCheck> => (how === "phone" ? firebaseToken() : supabaseToken());

const KEY = "tt_played_v1";
const MAX_AGE_MS = 60 * 60_000;

let mem: { userId: string; data: PlayedResponse } | null = null;
let looked: string | null = null;
let inflight: { userId: string; p: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function readStored(userId: string): PlayedResponse | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { u?: string; at?: number; data?: PlayedResponse };
    if (v.u !== userId || typeof v.at !== "number" || Date.now() - v.at > MAX_AGE_MS || !v.data || typeof v.data.turfs !== "object" || typeof v.data.people !== "number") return null;
    return v.data;
  } catch {
    return null;
  }
}

function keep(userId: string, data: PlayedResponse) {
  mem = { userId, data };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ u: userId, at: Date.now(), data }));
  } catch {
    /* private mode: memory only */
  }
  for (const l of listeners) l();
}

/** Signed out: nothing of theirs stays in this tab. */
export function forgetPlayed(): void {
  mem = null;
  looked = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

export function subscribePlayed(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** What is known for this person right now, or null. */
export function playedNow(userId: string | null | undefined): PlayedResponse | null {
  if (!userId) return null;
  if (mem?.userId === userId) return mem.data;
  // Storage is read once per person, not on every card's render.
  if (looked === userId) return null;
  looked = userId;
  const stored = readStored(userId);
  if (stored) mem = { userId, data: stored };
  return stored;
}

/** Read it once for this person (a no-op when it is known or on its way). Never throws. */
export function ensurePlayed(userId: string, how: SignedIn): Promise<void> {
  if (playedNow(userId)) return Promise.resolve();
  if (inflight?.userId === userId) return inflight.p;
  const p = (async () => {
    try {
      const t = await quietToken(how);
      if (!("token" in t)) return;
      const res = await fetch("/api/me/played", { headers: { Authorization: `Bearer ${t.token}` }, cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as PlayedResponse;
      if (data && typeof data.turfs === "object" && data.streak) keep(userId, data);
    } catch {
      /* no badges this time */
    } finally {
      if (inflight?.userId === userId) inflight = null;
    }
  })();
  inflight = { userId, p };
  return p;
}

/** A refusal of the WhatsApp switch carries the switch's state (not_allowed: the number isn't proved). */
export type Answer<T> = { ok: T } | { error: AccountError | "network"; whatsapp?: WhatsAppState | null };

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<Answer<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = (typeof body.error === "string" ? body.error : "unavailable") as AccountError;
      return "whatsapp" in body ? { error, whatsapp: body.whatsapp as WhatsAppState | null } : { error };
    }
    return { ok: body as T };
  } catch {
    return { error: "network" };
  }
}

export const getPassport = (token: string) => call<PassportResponse>(token, "/api/me/passport");

export function setWhatsapp(token: string, on: boolean): Promise<Answer<WhatsAppResponse>> {
  return call<WhatsAppResponse>(token, "/api/me/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
}

import type { PlayedResponse } from "./types";

/**
 * The signed-in person's played summary (GET /api/me/played) in the
 * browser: read once per tab session when something on the page asks for
 * it (wantPlayed), kept in memory and in sessionStorage for an hour, and
 * shared by every badge, tile and number on the page; each passport read
 * refreshes it (keepPlayed). Who is signed in comes from
 * components/profile/ViewerSignal.tsx (under AuthProvider) through
 * window, and the sign-in token code loads only when a read is made, so
 * a turf card that shows "Played here" loads nothing of sign-in and the
 * pages' scripts stay as they were. The token is read quietly: a missing
 * phone sign-in only means no badges here, never a sign-out. Browser only.
 */

type Viewer = { id: string; how: "phone" | "google" };
// ViewerSignal.tsx sets these (an import would tie the layout's scripts to every list page's).
const VIEWER_EVENT = "tapturf:viewer";
const viewer = (): Viewer | null | undefined => (window as unknown as { __tapturfViewer?: Viewer | null }).__tapturfViewer;

const KEY = "tt_played_v2";
const MAX_AGE_MS = 60 * 60_000;

let mem: { userId: string; data: PlayedResponse } | null = null;
let looked: string | null = null;
let wanted = false;
let wired = false;
let inflight: { userId: string; p: Promise<void> } | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function shapedPlayed(d: unknown): d is PlayedResponse {
  const x = d as Partial<PlayedResponse> | null;
  return !!x && typeof x.turfs === "object" && !!x.streak && typeof x.people === "number" && Array.isArray(x.medals) && Array.isArray(x.toReview);
}

function readStored(userId: string): PlayedResponse | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { u?: string; at?: number; data?: PlayedResponse };
    if (v.u !== userId || typeof v.at !== "number" || Date.now() - v.at > MAX_AGE_MS || !shapedPlayed(v.data)) return null;
    return v.data;
  } catch {
    return null;
  }
}

/** What is known for this person right now, or null. */
function playedNow(userId: string): PlayedResponse | null {
  if (mem?.userId === userId) return mem.data;
  // Storage is read once per person, not on every card's render.
  if (looked === userId) return null;
  looked = userId;
  const stored = readStored(userId);
  if (stored) mem = { userId, data: stored };
  return stored;
}

/** Signed out: nothing of theirs stays in this tab. */
function forget(): void {
  mem = null;
  looked = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

/** Read it once for this person (a no-op when it is known or on its way). Never throws. */
function ensure(v: Viewer): Promise<void> {
  if (playedNow(v.id)) return Promise.resolve();
  if (inflight?.userId === v.id) return inflight.p;
  const p = (async () => {
    try {
      const { firebaseToken, supabaseToken } = await import("../account/client");
      const t = await (v.how === "phone" ? firebaseToken() : supabaseToken());
      if (!("token" in t)) return;
      const res = await fetch("/api/me/played", { headers: { Authorization: `Bearer ${t.token}` }, cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as unknown;
      if (shapedPlayed(data) && viewer()?.id === v.id) keepPlayed(v.id, data);
    } catch {
      /* no badges this time */
    } finally {
      if (inflight?.userId === v.id) inflight = null;
    }
  })();
  inflight = { userId: v.id, p };
  return p;
}

function load(): void {
  const v = viewer();
  if (wanted && v) void ensure(v);
}

function onViewer(): void {
  if (viewer() === null) forget();
  emit();
  load();
}

function wire(): void {
  if (wired) return;
  wired = true;
  window.addEventListener(VIEWER_EVENT, onViewer);
}

export function subscribePlayed(l: () => void): () => void {
  wire();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The signed-in person's, or null (signed out, or not known yet). */
export function playedForViewer(): PlayedResponse | null {
  const v = viewer();
  return v ? playedNow(v.id) : null;
}

/** Something on this page shows it: read it now (once the sign-in is known), not before. */
export function wantPlayed(): void {
  wanted = true;
  wire();
  load();
}

/** Keep a fresh copy (the played read's, or a passport read's): everything on the page follows it. */
export function keepPlayed(userId: string, data: PlayedResponse): void {
  if (!shapedPlayed(data)) return;
  mem = { userId, data };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ u: userId, at: Date.now(), data }));
  } catch {
    /* private mode: memory only */
  }
  emit();
}

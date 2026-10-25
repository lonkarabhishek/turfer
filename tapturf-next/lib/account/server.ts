import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { clientNetwork, windowCounter } from "../limits";
import type { CityNote } from "./city";
import type { Identity } from "./identity";
import type { AccountProfile, PlayerHit } from "./types";

export type { AccountProfile, PlayerHit };

/**
 * Server side of accounts: the key the account RPCs check, their
 * client, and typed calls. Phone numbers and emails are read and users
 * rows written only here, for a verified identity (lib/account/identity.ts),
 * never by the browser. Relative imports only (npm run test:account).
 */

/**
 * The key the account RPCs check (private.app_secrets 'account'), server
 * only. Unset means accounts cannot be read or changed: routes answer 503.
 */
export function accountKey(): string | null {
  return process.env.ACCOUNT_KEY?.trim() || null;
}

function makeClient(fetch: typeof globalThis.fetch): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase environment variables");
  return createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch } });
}

// Its own breaker, like the live writes: failing account calls must not
// make page refreshes on this instance fail fast too.
const accountFetch = createGuardedFetch(defaultGuardOptions());
let client: SupabaseClient | null = null;

function accountClient(): SupabaseClient {
  client ??= makeClient(accountFetch);
  return client;
}

// City notes get a breaker of their own too: when they fail, sign-ins must not.
const cityFetch = createGuardedFetch(defaultGuardOptions());
let cityClient: SupabaseClient | null = null;

const s = (x: unknown): string | null => (typeof x === "string" ? x : null);

/** The profile in an RPC answer, or null when it is not well formed. */
export function toProfile(data: unknown): AccountProfile | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = s(d.id);
  const name = s(d.name);
  if (!id || name == null) return null;
  return {
    id,
    name,
    email: s(d.email),
    phone: s(d.phone),
    role: s(d.role) ?? "user",
    profile_image_url: s(d.profile_image_url),
    created_at: s(d.created_at) ?? "",
    username: s(d.username),
    taggable: d.taggable !== false,
    contact_email: s(d.contact_email),
    // Only a database that knows about the ask can start it.
    ask_email: d.ask_email === true,
  };
}

type Rpc = { data: Record<string, unknown> } | { unavailable: true };

async function call(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const key = accountKey();
  if (!key) return { unavailable: true };
  try {
    const { data, error } = await accountClient().rpc(fn, { p_key: key, ...args });
    if (error) {
      console.warn(`account: ${fn} failed`, error.message);
      return { unavailable: true };
    }
    if (!data || typeof data !== "object" || (data as { r?: unknown }).r === "unavailable") return { unavailable: true };
    return { data: data as Record<string, unknown> };
  } catch (e) {
    console.warn(`account: ${fn} threw`, e);
    return { unavailable: true };
  }
}

export type ResolveResult =
  | { ok: AccountProfile; created: boolean }
  | { r: "new" | "conflict" | "name" | "bad" }
  | { unavailable: true };

/**
 * The account for a verified identity. create makes one if there is
 * none (a phone sign-up needs a name); log records a phone sign-in for
 * the admin list. Never deletes or merges accounts.
 */
export async function resolveAccount(id: Identity, opts: { create?: boolean; log?: boolean; name?: string | null } = {}): Promise<ResolveResult> {
  const args =
    id.kind === "phone"
      ? { p_kind: "phone", p_phone: id.phone, p_name: opts.name ?? null }
      : { p_kind: "google", p_uid: id.uid, p_email: id.email, p_name: id.name ?? opts.name ?? null, p_avatar: id.avatar };
  const res = await call("account_resolve", { ...args, p_create: !!opts.create, p_log: !!opts.log && id.kind === "phone" });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p, created: res.data.created === true } : { unavailable: true };
  }
  if (r === "new" || r === "conflict" || r === "name" || r === "bad") return { r };
  return { unavailable: true };
}

export type ChangeResult = { ok: AccountProfile } | { r: "bad" | "reserved" | "taken" | "limit" | "email" } | { unavailable: true };

function changeResult(res: Rpc): ChangeResult {
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p } : { unavailable: true };
  }
  if (r === "bad" || r === "reserved" || r === "taken" || r === "limit" || r === "email") return { r };
  return { unavailable: true };
}

/**
 * The optional email of a phone account (private.user_contact_emails, never users.email):
 * save it, skip the ask (No thanks) or remove it.
 */
export async function setContactEmail(userId: string, action: "save" | "skip" | "remove", email: string | null, source: "signup" | "prompt" | "profile"): Promise<ChangeResult> {
  return changeResult(await call("account_set_email", { p_user_id: userId, p_action: action, p_email: email, p_source: source }));
}

export async function updateName(userId: string, name: string): Promise<ChangeResult> {
  return changeResult(await call("account_update", { p_user_id: userId, p_name: name }));
}

/** Set or change the username and/or the tagging switch. A null username changes only the switch. */
export async function setUsername(userId: string, username: string | null, taggable: boolean | null): Promise<ChangeResult> {
  return changeResult(await call("username_set", { p_user_id: userId, p_username: username, p_taggable: taggable }));
}

export type CheckResult = { ok: string } | { r: "bad" | "reserved" | "taken" } | { unavailable: true };

export async function checkUsername(userId: string, username: string): Promise<CheckResult> {
  const res = await call("username_check", { p_user_id: userId, p_username: username });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok" && typeof res.data.username === "string") return { ok: res.data.username };
  if (r === "bad" || r === "reserved" || r === "taken") return { r };
  return { unavailable: true };
}

/** The first free name of the candidates, or null when none is. */
export async function pickUsername(candidates: string[]): Promise<{ ok: string | null } | { unavailable: true }> {
  const key = accountKey();
  if (!key) return { unavailable: true };
  try {
    const { data, error } = await accountClient().rpc("username_pick", { p_key: key, p_candidates: candidates });
    if (error) return { unavailable: true };
    return { ok: typeof data === "string" ? data : null };
  } catch {
    return { unavailable: true };
  }
}

export async function searchPlayers(q: string): Promise<{ ok: PlayerHit[] } | { unavailable: true }> {
  const res = await call("players_search", { p_q: q });
  if ("unavailable" in res) return res;
  const list = Array.isArray(res.data.players) ? res.data.players : [];
  const players: PlayerHit[] = [];
  for (const p of list) {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.u === "string" && typeof o.name === "string") players.push({ u: o.u, name: o.name, photo: s(o.photo) });
  }
  return { ok: players };
}

/* ------------------------------------------------------------------ */
/* Route limits                                                        */
/* ------------------------------------------------------------------ */

/**
 * Per-instance soft limits per network, checked before a token is
 * verified or the database is called. Generous: many phones share one
 * carrier address. They only shed a flood early.
 */
export function createAccountLimiter(perMinute: number, now: () => number = Date.now) {
  const hits = windowCounter(perMinute, 60_000, now);
  return (req: Request): boolean => hits(clientNetwork(req));
}

/** Account answers are for one person: never stored by a browser or CDN. */
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

const RANK: Record<CityNote["source"], number> = { unknown: 0, ip: 1, picked: 2, gps: 2 };
/** Per instance: the best city source already recorded for each account, so most calls skip the database. */
const notedCity = new Map<string, number>();

/**
 * Record a signed-in person's city (lib/account/city.ts) for the admin
 * view. The database keeps the better of what it has and this (a pick
 * beats an internet guess, a guess beats nothing; a pick stays), so it
 * is safe on every sign-in check. Run it after the reply: it never
 * throws and never affects the sign-in.
 */
export async function noteCity(userId: string, note: CityNote): Promise<void> {
  const rank = RANK[note.source];
  if ((notedCity.get(userId) ?? -1) >= rank) return;
  const key = accountKey();
  if (!key) return;
  try {
    cityClient ??= makeClient(cityFetch);
    const { data, error } = await cityClient.rpc("account_note_city", {
      p_key: key,
      p_user_id: userId,
      p_city: note.city,
      p_source: note.source,
      p_ip_city: note.ipCity,
    });
    if (error || (data as { r?: unknown } | null)?.r !== "ok") {
      console.warn("account: account_note_city failed", error?.message ?? (data as { r?: unknown } | null)?.r);
      return;
    }
    if (notedCity.size >= 5_000) notedCity.delete(notedCity.keys().next().value as string);
    notedCity.set(userId, rank);
  } catch (e) {
    console.warn("account: account_note_city threw", e);
  }
}

/** A small JSON body, or null when it is missing, too big or not JSON. */
export async function readSmallJson(req: Request, max = 2_000): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length")) > max) return null;
  try {
    const text = await req.text();
    if (text.length > max) return null;
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { clientNetwork, windowCounter } from "../limits";
import type { CityNote } from "./city";
import type { GoogleIdentity, Identity } from "./identity";
import type { AccountProfile, LinkState, PlayerHit } from "./types";
import type { ToolUse } from "../tools/usage";

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

// City notes (and phone checks) get a breaker of their own too: when they fail, sign-ins must not.
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
    // Only a database that knows about the ask can start it, or offer the field.
    ask_email: d.ask_email === true,
    email_editable: d.email_editable === true,
    // The same for adding Google or a number: only a database that has the links offers them.
    google_email: s(d.google_email),
    google_linkable: d.google_linkable === true,
    phone_confirmed: d.phone_confirmed === true,
    phone_settable: d.phone_settable === true,
    ask_google: d.ask_google === true,
    // The verified tick: null on a database from before it, so nothing is shown or asked.
    verified: typeof d.verified === "boolean" ? d.verified : null,
    phone_proven: d.phone_proven === true,
    email_proven: d.email_proven === true,
  };
}

export type Rpc = { data: Record<string, unknown> } | { unavailable: true };

/**
 * A server-key RPC (p_key added here) on the account client. Unavailable when
 * the key is unset, the call fails or the function answers r: unavailable.
 * The review routes use it too (lib/reviews/server.ts).
 */
export async function accountRpc(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  return call(fn, args);
}

/**
 * accountRpc for a function a migration may not have added yet: a
 * database without it answers { missing: true }, quietly (the photo
 * routes say photos are not on yet).
 */
export async function accountRpcIfThere(fn: string, args: Record<string, unknown>): Promise<Rpc | { missing: true }> {
  const key = accountKey();
  if (!key) return { unavailable: true };
  try {
    const { data, error } = await accountClient().rpc(fn, { p_key: key, ...args });
    if (error && missingFunction(error.code)) return { missing: true };
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
  /**
   * knowsLinks: the database has the account links (20261026_account_links.sql;
   * its profile has ask_google). Only that one logs a Google sign-in itself.
   */
  | { ok: AccountProfile; created: boolean; knowsLinks: boolean }
  /** wasUsed: this number opened another account lately (it left that one in the last 90 days). */
  | { r: "new" | "name"; wasUsed: boolean }
  /** linking: being added to a phone account right now; replaced: taken off one (Google only). */
  | { r: "conflict" | "bad" | "linking" | "replaced" }
  | { unavailable: true };

function resolveResult(res: Rpc): ResolveResult {
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p, created: res.data.created === true, knowsLinks: typeof res.data.ask_google === "boolean" } : { unavailable: true };
  }
  if (r === "new" || r === "name") return { r, wasUsed: res.data.was_used === true };
  if (r === "conflict" || r === "bad" || r === "linking" || r === "replaced") return { r };
  return { unavailable: true };
}

/**
 * The account for a verified identity. create makes one if there is
 * none (a phone sign-up needs a name); log records the sign-in for the
 * admin list, on the account it opens: phone sign-ins from POST
 * /api/account/me, Google ones once per real sign-in from the sign-in
 * callback. Never deletes or merges accounts.
 */
export async function resolveAccount(id: Identity, opts: { create?: boolean; log?: boolean; name?: string | null } = {}): Promise<ResolveResult> {
  const args =
    id.kind === "phone"
      ? { p_kind: "phone", p_phone: id.phone, p_name: opts.name ?? null }
      : { p_kind: "google", p_uid: id.uid, p_email: id.email, p_name: id.name ?? opts.name ?? null, p_avatar: id.avatar };
  return resolveResult(await call("account_resolve", { ...args, p_create: !!opts.create, p_log: !!opts.log }));
}

/**
 * "Make a new TapTurf account with Google", for a Google account taken off
 * a phone account (account_resolve answers replaced). Any other Google
 * sign-in gets what account_resolve would give it.
 */
export async function googleFresh(id: GoogleIdentity): Promise<ResolveResult> {
  return resolveResult(await call("account_google_fresh", { p_uid: id.uid, p_email: id.email, p_name: id.name, p_avatar: id.avatar }));
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
    if (typeof o.u === "string" && typeof o.name === "string") players.push({ u: o.u, name: o.name, photo: s(o.photo), ...(o.v === true ? { v: true as const } : {}) });
  }
  return { ok: players };
}

/* ------------------------------------------------------------------ */
/* Two ways into one account                                           */
/* ------------------------------------------------------------------ */

const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const bool = (x: unknown): boolean | undefined => (typeof x === "boolean" ? x : undefined);
const defined = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Whether the other account is empty and the day it was made (IST), when the answer says. */
export type Brief = { otherEmpty?: boolean; otherMadeOn?: string };
const briefOf = (d: Record<string, unknown>): Brief => defined({ otherEmpty: bool(d.other_empty), otherMadeOn: str(d.other_made_on) });

const isoSeconds = (s: number) => new Date(s * 1000).toISOString();
type Unavailable = { unavailable: true };

export type LinkStartResult =
  | { ok: { expiresAt: string } }
  | { r: "new" | "conflict" | "not_allowed" | "stale" | "used" | "bad" }
  | { r: "limit"; until: string | null }
  | Unavailable;

/** Start adding Google (account_link_start): an intent and its first leg, for a phone sign-in made in the last 5 minutes. */
export async function linkStart(phone: string, sub: string, authTime: number, proofKey: string, legHash: string): Promise<LinkStartResult> {
  const res = await call("account_link_start", {
    p_phone: phone,
    p_fb_sub: sub,
    p_auth_time: isoSeconds(authTime),
    p_proof_key: proofKey,
    p_secret_hash: legHash,
  });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok" && typeof res.data.expires_at === "string") return { ok: { expiresAt: res.data.expires_at } };
  if (r === "limit") return { r, until: str(res.data.until) ?? null };
  if (r === "new" || r === "conflict" || r === "not_allowed" || r === "stale" || r === "used" || r === "bad") return { r };
  return { unavailable: true };
}

export type LinkLegResult = { ok: { expiresAt: string } } | { r: "expired" | "mismatch" | "bad" } | { r: "limit"; until: string | null } | Unavailable;

/** Another Google round trip on the same intent (account_link_leg), from the newest leg's cookie. */
export async function linkLeg(legHash: string, sub: string, newLegHash: string): Promise<LinkLegResult> {
  const res = await call("account_link_leg", { p_secret_hash: legHash, p_fb_sub: sub, p_new_secret_hash: newLegHash });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok" && typeof res.data.expires_at === "string") return { ok: { expiresAt: res.data.expires_at } };
  if (r === "limit") return { r, until: str(res.data.until) ?? null };
  if (r === "expired" || r === "mismatch" || r === "bad") return { r };
  return { unavailable: true };
}

export type LinkAttachResult = ({ r: "ok" | "used" | "expired" | "has_account" | "other_account" | "unverified" | "bad" } & Brief) | Unavailable;

/** Which Google account came back on a leg (account_link_attach). ok with a brief: it has its own empty account the link would go over. */
export async function linkAttach(legHash: string, authUid: string): Promise<LinkAttachResult> {
  const res = await call("account_link_attach", { p_secret_hash: legHash, p_auth_uid: authUid });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok" || r === "used" || r === "expired" || r === "has_account" || r === "other_account" || r === "unverified" || r === "bad") {
    return { r, ...briefOf(res.data) };
  }
  return { unavailable: true };
}

export type LinkStatus = {
  state: LinkState;
  googleEmail?: string | null;
  problem?: string;
  outcome?: string;
  expiresAt?: string;
  legsLeft?: number;
} & Brief;

/** Where an attempt to add Google stands (account_link_status), for the same phone sign-in only. */
export async function linkStatus(legHash: string, sub: string): Promise<LinkStatus | Unavailable> {
  const res = await call("account_link_status", { p_secret_hash: legHash, p_fb_sub: sub });
  if ("unavailable" in res) return res;
  const d = res.data;
  const state = d.state;
  if (d.r !== "ok" || (state !== "none" && state !== "waiting" && state !== "attached" && state !== "refused" && state !== "closed")) {
    return { unavailable: true };
  }
  return defined<LinkStatus>({
    state: state as LinkState,
    googleEmail: state === "attached" || state === "closed" ? (str(d.google_email) ?? null) : undefined,
    problem: str(d.problem),
    outcome: str(d.outcome),
    expiresAt: str(d.expires_at),
    legsLeft: typeof d.legs_left === "number" ? d.legs_left : undefined,
    ...briefOf(d),
  });
}

export type LinkGoogleResult =
  | { ok: AccountProfile }
  | ({ r: "expired" | "mismatch" | "not_allowed" | "has_account" | "other_account" | "unverified" | "bad" } & Brief)
  | Unavailable;

/** The person confirmed: make the link (account_link_google), from the same phone sign-in that started it. */
export async function linkGoogle(legHash: string, phone: string, sub: string): Promise<LinkGoogleResult> {
  const res = await call("account_link_google", { p_secret_hash: legHash, p_phone: phone, p_fb_sub: sub });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p } : { unavailable: true };
  }
  if (r === "expired" || r === "mismatch" || r === "not_allowed" || r === "has_account" || r === "other_account" || r === "unverified" || r === "bad") {
    return { r, ...briefOf(res.data) };
  }
  return { unavailable: true };
}

/** Give up on an attempt (Cancel, log out). Never throws. */
export async function linkCancel(legHash: string): Promise<void> {
  const res = await call("account_link_cancel", { p_secret_hash: legHash });
  if ("data" in res && res.data.r !== "ok") console.warn("account: account_link_cancel answered", res.data.r);
}

export type UnlinkResult = { ok: AccountProfile } | { r: "new" | "not_allowed" | "stale" | "used" | "bad" } | Unavailable;

/** Take the Google account off a phone account (account_unlink_google), after a fresh OTP. */
export async function unlinkGoogle(phone: string, sub: string, authTime: number, proofKey: string): Promise<UnlinkResult> {
  const res = await call("account_unlink_google", { p_phone: phone, p_fb_sub: sub, p_auth_time: isoSeconds(authTime), p_proof_key: proofKey });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p } : { unavailable: true };
  }
  if (r === "new" || r === "not_allowed" || r === "stale" || r === "used" || r === "bad") return { r };
  return { unavailable: true };
}

export type SetPhoneResult =
  | { ok: AccountProfile }
  | { r: "taken"; holderOpens: boolean; holderEmpty?: boolean; holderMadeOn?: string | null }
  | { r: "limit"; until: string | null }
  | { r: "new" | "not_allowed" | "used" | "bad" }
  | Unavailable;

/** Add, confirm or change the number of a Google sign-in's own account (account_set_phone). Never moves a number. */
export async function setPhone(authUid: string, phone: string, proofKey: string): Promise<SetPhoneResult> {
  const res = await call("account_set_phone", { p_auth_uid: authUid, p_phone: phone, p_proof_key: proofKey });
  if ("unavailable" in res) return res;
  const d = res.data;
  const r = d.r;
  if (r === "ok") {
    const p = toProfile(d);
    return p ? { ok: p } : { unavailable: true };
  }
  if (r === "taken") {
    return defined<SetPhoneResult>({
      r: "taken",
      holderOpens: d.holder_opens === true,
      holderEmpty: bool(d.holder_empty),
      holderMadeOn: "holder_made_on" in d ? (str(d.holder_made_on) ?? null) : undefined,
    });
  }
  if (r === "limit") return { r, until: str(d.until) ?? null };
  if (r === "new" || r === "not_allowed" || r === "used" || r === "bad") return { r };
  return { unavailable: true };
}

export type RemovePhoneResult = { ok: AccountProfile } | { r: "new" | "not_allowed" | "bad" } | Unavailable;

/** Take the number off a Google sign-in's own account (account_remove_phone). */
export async function removePhone(authUid: string): Promise<RemovePhoneResult> {
  const res = await call("account_remove_phone", { p_auth_uid: authUid });
  if ("unavailable" in res) return res;
  const r = res.data.r;
  if (r === "ok") {
    const p = toProfile(res.data);
    return p ? { ok: p } : { unavailable: true };
  }
  if (r === "new" || r === "not_allowed" || r === "bad") return { r };
  return { unavailable: true };
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

/** Per instance: the day (in ms, UTC) each account's phone check was last recorded, so most calls skip the database. */
const phoneChecked = new Map<string, number>();
const DAY_MS = 86_400_000;

/**
 * Record that the server just verified a Firebase phone token for this
 * account's own number (a sign-in, or a visit restoring the session), for
 * the admin's "Phone, by a code" (account_phone_checked). At most one
 * write a day per account. Run it after the reply: it never throws and
 * never affects the sign-in.
 */
export async function notePhoneChecked(userId: string, phone: string): Promise<void> {
  const day = Math.floor(Date.now() / DAY_MS);
  if (phoneChecked.get(userId) === day) return;
  const key = accountKey();
  if (!key) return;
  try {
    cityClient ??= makeClient(cityFetch);
    const { data, error } = await cityClient.rpc("account_phone_checked", { p_key: key, p_user_id: userId, p_phone: phone });
    const r = (data as { r?: unknown } | null)?.r;
    // "other": the number isn't this account's (a typed one); nothing to record, today or later.
    if (error || (r !== "ok" && r !== "other")) {
      console.warn("account: account_phone_checked failed", error?.message ?? r);
      return;
    }
    if (phoneChecked.size >= 5_000) phoneChecked.delete(phoneChecked.keys().next().value as string);
    phoneChecked.set(userId, day);
  } catch (e) {
    console.warn("account: account_phone_checked threw", e);
  }
}

/** Who used a tool: the account the route verified, else (only then) the browser's device tag. */
export type ToolUser = { userId: string | null; device: string | null };

/** PostgREST's "no such function" (and Postgres's): the database doesn't have tool_use_record yet. */
const missingFunction = (code: string | undefined) => code === "PGRST202" || code === "42883";

/**
 * Record one use of a free tool for the admin (tool_use_record, one round
 * trip): counted for the tiles as before, and kept with who used it and
 * the visitor's city. Until the database has tool_use_record (the
 * 20261027 file), only counted. Run it after the reply: it never throws.
 */
export async function recordToolUse(use: ToolUse, who: ToolUser, city: string | null): Promise<void> {
  const key = accountKey();
  if (!key) return;
  try {
    cityClient ??= makeClient(cityFetch);
    const { data, error } = await cityClient.rpc("tool_use_record", {
      p_key: key,
      p_tool: use.tool,
      p_event: use.event,
      p_detail: use.detail,
      p_tags: use.tags,
      p_code: use.code,
      p_user_id: who.userId,
      // Never both: a verified account's use carries no device tag.
      p_device: who.userId ? null : who.device,
      p_city: city,
    });
    if (!error && data === true) return;
    if (error && missingFunction(error.code)) return countToolUse(use);
    console.warn("tools: tool_use_record failed", error?.message ?? data);
  } catch (e) {
    console.warn("tools: tool_use_record threw", e);
  }
}

/** Count one use of a free tool for the admin (tool_use_count), without who. Run it after the reply: it never throws. */
export async function countToolUse(use: ToolUse): Promise<void> {
  const key = accountKey();
  if (!key) return;
  try {
    cityClient ??= makeClient(cityFetch);
    const { data, error } = await cityClient.rpc("tool_use_count", { p_key: key, p_tool: use.tool, p_event: use.event, p_detail: use.detail });
    if (error || data !== true) console.warn("tools: tool_use_count failed", error?.message ?? data);
  } catch (e) {
    console.warn("tools: tool_use_count threw", e);
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

import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { FIREBASE_ISSUER } from "../firebase/verifyIdToken";

/**
 * Test helpers for the account routes (npm run test:account): signed
 * Firebase tokens, Supabase-shaped tokens, and a fake network standing in
 * for Google's certs, GoTrue and PostgREST's /rpc. Never imported by the
 * app. Fake numbers and addresses only.
 */

export const SUPABASE = "https://example.supabase.co";
export const ANON = "anon-key";
export const CERTS = "http://127.0.0.1:1/certs";

/** The environment the routes read. Call before the first request. */
export function testEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
  process.env.ACCOUNT_KEY = "test-account-key";
  process.env.FIREBASE_CERTS_URL = CERTS;
  delete process.env.VERCEL;
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

export const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const nowS = () => Math.floor(Date.now() / 1000);

export function jwt(payload: object, header: object = { alg: "RS256", kid: "k1" }): string {
  const head = `${b64(header)}.${b64(payload)}`;
  const sig = createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url");
  return `${head}.${sig}`;
}

export const PHONE = "+919000000001";
export const SUB = "fb-uid-asha";

/**
 * A Firebase ID token signed with the test key. ageS: how long ago the OTP
 * sign-in was (auth_time); mintS: how long after it this token was minted
 * (a refresh mints a later one).
 */
export function phoneToken(o: { ageS?: number; mintS?: number; phone?: string; sub?: string; provider?: string | null; over?: Record<string, unknown> } = {}): string {
  const authTime = nowS() - (o.ageS ?? 10);
  const iat = authTime + (o.mintS ?? 0);
  const phone = o.phone ?? PHONE;
  return jwt({
    iss: FIREBASE_ISSUER,
    aud: "tapturf",
    sub: o.sub ?? SUB,
    iat,
    auth_time: authTime,
    exp: iat + 3600,
    phone_number: phone,
    ...(o.provider === null ? {} : { firebase: { sign_in_provider: o.provider ?? "phone", identities: { phone: [phone] } } }),
    ...o.over,
  });
}

export const GOOGLE_UID = "11111111-2222-3333-4444-555555555555";

export function googleUser(over: Record<string, unknown> = {}) {
  return {
    id: GOOGLE_UID,
    email: "shaik.test@example.com",
    is_anonymous: false,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: "Shaik Test", avatar_url: "https://lh3.googleusercontent.com/a/x" },
    ...over,
  };
}

/** An access token in Supabase's shape (unsigned: the routes ask GoTrue), from a sign-in ageS ago. */
export function supabaseToken(o: { ageS?: number; method?: string; amr?: unknown; sub?: string } = {}): string {
  const at = nowS() - (o.ageS ?? 30);
  const amr = o.amr ?? [{ method: o.method ?? "oauth", timestamp: at }];
  return `${b64({ alg: "HS256" })}.${b64({ iss: `${SUPABASE}/auth/v1`, sub: o.sub ?? GOOGLE_UID, exp: nowS() + 3600, iat: nowS(), amr, jti: randomUUID() })}.sig`;
}

export type RpcCall = { fn: string; args: Record<string, unknown> };

/** The fake network. Each test sets what it needs and calls reset() first. */
export const net = {
  rpcCalls: [] as RpcCall[],
  /** Answers per RPC name; a missing one answers { r: "ok" }. */
  rpc: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  /** GoTrue's /user per access token. */
  users: new Map<string, unknown>(),
  pkceCalls: [] as Array<{ auth_code?: unknown; code_verifier?: unknown; headers: Headers }>,
  pkce: ((): Response => new Response("{}", { status: 500 })) as (body: Record<string, unknown>) => Response,
  logouts: [] as string[],
  reset() {
    this.rpcCalls = [];
    this.rpc = {};
    this.users = new Map();
    this.pkceCalls = [];
    this.pkce = () => new Response("{}", { status: 500 });
    this.logouts = [];
  },
  calls(fn: string) {
    return this.rpcCalls.filter((c) => c.fn === fn);
  },
};

/** A Google sign-in's token that GoTrue's /user accepts. */
export function googleSession(o: { ageS?: number; method?: string; amr?: unknown; user?: Record<string, unknown> } = {}): string {
  const t = supabaseToken(o);
  net.users.set(t, googleUser(o.user));
  return t;
}

const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

/** Routes every fetch to the fake network. */
export function installNet() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(CERTS)) return Response.json({ k1: PEM });
    if (url === `${SUPABASE}/auth/v1/user`) {
      const token = (headerOf(init, "authorization") ?? "").replace(/^Bearer /, "");
      const u = net.users.get(token);
      return u ? Response.json(u) : Response.json({ msg: "invalid" }, { status: 401 });
    }
    if (url === `${SUPABASE}/auth/v1/token?grant_type=pkce`) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      net.pkceCalls.push({ ...body, headers: new Headers(init?.headers) });
      return net.pkce(body);
    }
    if (url === `${SUPABASE}/auth/v1/logout?scope=local`) {
      net.logouts.push((headerOf(init, "authorization") ?? "").replace(/^Bearer /, ""));
      return new Response(null, { status: 204 });
    }
    const m = /^https:\/\/example\.supabase\.co\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url);
    if (m) {
      const args = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      net.rpcCalls.push({ fn: m[1], args });
      const answer = net.rpc[m[1]] ? net.rpc[m[1]](args) : { r: "ok" };
      return Response.json(answer);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

let ipN = 1;

/** A request to the app; each one from its own network, so the per-network limits stay out of the way. */
export function req(
  path: string,
  o: { method?: string; token?: string; body?: unknown; cookie?: string; https?: boolean; headers?: Record<string, string> } = {},
): Request {
  const base = o.https ? "https://www.tapturf.test" : "http://localhost:3000";
  ipN++;
  const headers: Record<string, string> = { "x-forwarded-for": `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN & 255}`, ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  return new Request(base + path, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

/** The Set-Cookie lines of a response, by cookie name. */
export function setCookies(res: Response): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of res.headers.getSetCookie()) out.set(line.slice(0, line.indexOf("=")), line);
  return out;
}

/** A cookie's value in a Set-Cookie line. */
export const cookieValue = (line: string | undefined) => (line ? line.slice(line.indexOf("=") + 1).split(";")[0] : undefined);

/** A profile as the database with the account links sends it. */
export function dbProfile(over: Record<string, unknown> = {}) {
  return {
    r: "ok",
    id: "acc-1",
    name: "Asha",
    email: null,
    phone: PHONE,
    role: "user",
    created_at: "2026-10-01T00:00:00+00:00",
    ask_email: false,
    email_editable: false,
    ask_google: false,
    google_email: null,
    google_linkable: true,
    phone_confirmed: true,
    phone_settable: false,
    ...over,
  };
}

/** A profile as the database before the account links sends it (no ask_google). */
export function oldDbProfile(over: Record<string, unknown> = {}) {
  const p: Record<string, unknown> = dbProfile(over);
  for (const k of ["ask_google", "google_email", "google_linkable", "phone_confirmed", "phone_settable"]) if (!(k in over)) delete p[k];
  return p;
}

/** Let background work (after-reply tasks) run. */
export const settle = () => new Promise((r) => setTimeout(r, 20));

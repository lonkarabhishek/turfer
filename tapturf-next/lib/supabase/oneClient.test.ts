import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieClient, perKey, type CookieStore } from "./oneClient";

// A fake Supabase: counts token refreshes and records which access token each read carried.
const URL_ = "https://abcdefghijklmnopqrst.supabase.co";
const KEY = "anon-key";
const COOKIE = "sb-abcdefghijklmnopqrst-auth-token";
const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: { providers: ["google"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

function fakeSupabase() {
  let refreshes = 0;
  const bearers: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    if (url.includes("/auth/v1/token")) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 15));
      const now = Math.floor(Date.now() / 1000);
      return Response.json({ access_token: `fresh-${refreshes}`, refresh_token: `rt-${refreshes}`, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user });
    }
    if (url.includes("/auth/v1/user")) return Response.json(user);
    if (url.includes("/rest/v1/")) {
      bearers.push(auth);
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, refreshes: () => refreshes, bearers };
}

/** One request's cookies, holding a session whose access token expired a minute ago. */
function requestCookies(): CookieStore & { written: string[] } {
  const now = Math.floor(Date.now() / 1000);
  const session = { access_token: "stale", refresh_token: "rt-0", token_type: "bearer", expires_in: 3600, expires_at: now - 60, user };
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const written: string[] = [];
  return {
    written,
    getAll: () => [{ name: COOKIE, value }],
    // A Server Component can't write cookies: the write throws (and is ignored).
    set: (name: string) => {
      written.push(name);
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    },
  };
}

test("perKey: one value per key object, made once", () => {
  let made = 0;
  const get = perKey((k: { id: number }) => ({ k, n: ++made }));
  const a = { id: 1 };
  const b = { id: 2 };
  assert.equal(get(a), get(a));
  assert.notEqual(get(a), get(b));
  assert.equal(made, 2);
});

test("before: a client per read refreshes the same expiring session once per read (27 Oct: 31 refreshes, then a 409)", async () => {
  const sb = fakeSupabase();
  const store = requestCookies();
  const clients = Array.from({ length: 5 }, () => cookieClient(URL_, KEY, store, sb.fetchImpl));
  await Promise.all(clients.map((c, i) => (i === 0 ? c.auth.getUser() : c.rpc("admin_ticks", { p_firebase_token: null }))));
  assert.equal(sb.refreshes(), 5);
});

test("one client per request: the owner check and every read share a single refresh", async () => {
  const sb = fakeSupabase();
  const client = perKey((s: CookieStore) => cookieClient(URL_, KEY, s, sb.fetchImpl));
  const store = requestCookies();
  // The page: isAdmin()'s getUser(), then a burst of owner reads, all asking for the request's client.
  const { data } = await client(store).auth.getUser();
  assert.equal(data.user?.email, "owner@example.com");
  await Promise.all(["admin_people", "admin_ticks", "admin_verified", "admin_users", "get_recent_logins", "admin_tool_uses"].map((fn) => client(store).rpc(fn, { p_firebase_token: null })));
  assert.equal(sb.refreshes(), 1, "one refresh for the whole request");
  assert.deepEqual(new Set(sb.bearers), new Set(["Bearer fresh-1"]), "every read carries the refreshed token");
  // The refreshed cookie could not be written from a Server Component; that is ignored, not thrown.
  assert.ok(store.written.length > 0);
  // Concurrent first use dedupes too: reads that all start at once still refresh once.
  const sb2 = fakeSupabase();
  const client2 = perKey((s: CookieStore) => cookieClient(URL_, KEY, s, sb2.fetchImpl));
  const store2 = requestCookies();
  await Promise.all([client2(store2).auth.getUser(), ...[1, 2, 3, 4].map(() => client2(store2).rpc("admin_ticks", { p_firebase_token: null }))]);
  assert.equal(sb2.refreshes(), 1);
});

test("a new request (new cookies) gets its own client", () => {
  const sb = fakeSupabase();
  const client = perKey((s: CookieStore) => cookieClient(URL_, KEY, s, sb.fetchImpl));
  assert.notEqual(client(requestCookies()), client(requestCookies()));
});

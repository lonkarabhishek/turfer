import { test } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { certsUrl, checkFirebaseIdToken, FIREBASE_ISSUER } from "../firebase/verifyIdToken";
import { createIdentityChecker, googleIdentity, peekToken, phoneIdentity, type IdentityDeps } from "./identity";
import { usernameCandidates, usernameProblem } from "./usernames";
import { createAccountLimiter, toProfile } from "./server";
import { isTag, readTag, sameTag } from "./tag";

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const SUPABASE = "https://example.supabase.co";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function jwt(payload: object, header: object = { alg: "RS256", kid: "k1" }): string {
  const head = `${b64(header)}.${b64(payload)}`;
  const sig = createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url");
  return `${head}.${sig}`;
}

const nowS = () => Math.floor(Date.now() / 1000);

function firebaseToken(over: Record<string, unknown> = {}, header?: object): string {
  return jwt(
    { iss: FIREBASE_ISSUER, aud: "tapturf", sub: "fb-uid", iat: nowS() - 10, auth_time: nowS() - 10, exp: nowS() + 3600, phone_number: "+919876543210", ...over },
    header,
  );
}

/** An unsigned token in Supabase's shape: the checker asks GoTrue, never checks it itself. */
const supabaseToken = (over: Record<string, unknown> = {}) =>
  `${b64({ alg: "HS256" })}.${b64({ iss: `${SUPABASE}/auth/v1`, exp: nowS() + 3600, sub: "x", ...over })}.sig`;

type Call = { url: string; auth?: string };

/** fetch for the tests: certs at the local URL, GoTrue's /user answering as told. */
function fakeFetch(opts: { certs?: () => Response; user?: () => Response | Promise<Response> } = {}) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization") ?? undefined;
    calls.push({ url, auth });
    if (url.startsWith("http://127.0.0.1:1/certs")) return opts.certs ? opts.certs() : Response.json({ k1: PEM });
    if (url === `${SUPABASE}/auth/v1/user`) {
      if (!opts.user) throw new Error("no GoTrue here");
      return opts.user();
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { impl, calls };
}

const GOOGLE_USER = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "Someone@Example.com",
  is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "Some One", avatar_url: "https://lh3.googleusercontent.com/a/x" },
};

function checker(f: ReturnType<typeof fakeFetch>, now: () => number = Date.now) {
  // checkFirebaseIdToken reads certs through the global fetch.
  globalThis.fetch = f.impl;
  const deps: IdentityDeps = { supabaseUrl: SUPABASE, anonKey: "anon", checkFirebase: checkFirebaseIdToken, fetchImpl: f.impl, now };
  return createIdentityChecker(deps);
}

process.env.FIREBASE_CERTS_URL = "http://127.0.0.1:1/certs";
delete process.env.VERCEL;

test("certsUrl: the test override only off Vercel and only for a local host", () => {
  const google = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(certsUrl({}), google);
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "http://127.0.0.1:9/c" }), "http://127.0.0.1:9/c");
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "http://localhost:9/c" }), "http://localhost:9/c");
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "http://127.0.0.1:9/c", VERCEL: "1" }), google);
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "https://evil.example/c" }), google);
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "http://127.0.0.1.evil.example/c" }), google);
    assert.equal(certsUrl({ FIREBASE_CERTS_URL: "not a url" }), google);
  } finally {
    console.error = quiet;
  }
});

test("peekToken reads iss and exp, refuses junk", () => {
  assert.equal(peekToken(""), null);
  assert.equal(peekToken("a.b"), null);
  assert.equal(peekToken("a.b.c"), null);
  assert.equal(peekToken(`x.${b64({ iss: "i" })}.y`), null);
  assert.deepEqual(peekToken(`x.${b64({ iss: "i", exp: 5 })}.y`), { iss: "i", exp: 5 });
  assert.equal(peekToken(`x.${"a".repeat(9000)}.y`), null);
});

test("phoneIdentity: +91 and exactly 10 digits only", () => {
  const c = (phone_number?: string) => phoneIdentity({ sub: "s", exp: 1, phone_number });
  assert.deepEqual(c("+919876543210"), { kind: "phone", phone: "+919876543210" });
  for (const bad of [undefined, "", "9876543210", "+19876543210", "+91987654321", "+9198765432100", "+91 9876543210", "919876543210"]) {
    assert.equal(c(bad), null, String(bad));
  }
});

test("googleIdentity: Google sign-ins only, never anonymous", () => {
  assert.deepEqual(googleIdentity(GOOGLE_USER), {
    kind: "google",
    uid: GOOGLE_USER.id,
    email: "someone@example.com",
    name: "Some One",
    avatar: "https://lh3.googleusercontent.com/a/x",
  });
  assert.equal(googleIdentity({ ...GOOGLE_USER, app_metadata: { providers: ["email"] } }), null);
  assert.equal(googleIdentity({ ...GOOGLE_USER, app_metadata: {} }), null);
  assert.equal(googleIdentity({ ...GOOGLE_USER, is_anonymous: true }), null);
  assert.equal(googleIdentity({ ...GOOGLE_USER, id: "not-a-uuid" }), null);
  assert.equal(googleIdentity(null), null);
  // Google added to an email account still counts: the email is Google's.
  assert.ok(googleIdentity({ ...GOOGLE_USER, app_metadata: { providers: ["email", "google"] } }));
});

test("Firebase token: verified, phone kept, cached until checked again", async () => {
  const f = fakeFetch();
  const check = checker(f);
  const t = firebaseToken();
  assert.deepEqual(await check(t), { ok: { kind: "phone", phone: "+919876543210" } });
  const n = f.calls.length;
  assert.deepEqual(await check(t), { ok: { kind: "phone", phone: "+919876543210" } });
  assert.equal(f.calls.length, n, "second check comes from the cache");
});

test("Firebase token: bad ones are invalid and never go to GoTrue", async () => {
  const f = fakeFetch({ user: () => Response.json(GOOGLE_USER) });
  const check = checker(f);
  const cases = [
    firebaseToken({ phone_number: "+19876543210" }),
    firebaseToken({ phone_number: undefined, email: "a@b.c" }),
    firebaseToken({ aud: "other" }),
    firebaseToken({ exp: nowS() - 100 }),
    firebaseToken({ iat: nowS() + 600 }),
    firebaseToken({}, { alg: "HS256", kid: "k1" }),
    firebaseToken({}).slice(0, -4) + "AAAA",
  ];
  for (const t of cases) assert.deepEqual(await check(t), { invalid: true });
  assert.ok(!f.calls.some((c) => c.url.includes("/auth/v1/")), "no Firebase-iss token reaches GoTrue");
});

test("Firebase token: certs down is unavailable; an unknown kid refetches once, then invalid", async () => {
  const down = fakeFetch({ certs: () => new Response("no", { status: 500 }) });
  assert.deepEqual(await checker(down)(firebaseToken()), { unavailable: true });

  const f = fakeFetch();
  const r = await checker(f)(firebaseToken({}, { alg: "RS256", kid: "rotated" }));
  assert.deepEqual(r, { invalid: true });
  assert.equal(f.calls.filter((c) => c.url.includes("/certs")).length, 2);
});

test("Supabase token: GoTrue decides; 401 invalid, 5xx and network unavailable", async () => {
  const ok = fakeFetch({ user: () => Response.json(GOOGLE_USER) });
  const t = supabaseToken();
  const r = await checker(ok)(t);
  assert.ok("ok" in r && r.ok.kind === "google" && r.ok.uid === GOOGLE_USER.id);
  assert.equal(ok.calls[0].auth, `Bearer ${t}`);

  assert.deepEqual(await checker(fakeFetch({ user: () => new Response("", { status: 401 }) }))(supabaseToken()), { invalid: true });
  assert.deepEqual(await checker(fakeFetch({ user: () => new Response("", { status: 403 }) }))(supabaseToken()), { invalid: true });
  assert.deepEqual(await checker(fakeFetch({ user: () => new Response("", { status: 502 }) }))(supabaseToken()), { unavailable: true });
  assert.deepEqual(
    await checker(fakeFetch({ user: () => Promise.reject(new Error("offline")) }))(supabaseToken()),
    { unavailable: true },
  );
  assert.deepEqual(
    await checker(fakeFetch({ user: () => Response.json({ ...GOOGLE_USER, app_metadata: { providers: ["email"] } }) }))(supabaseToken()),
    { invalid: true },
  );
});

test("Supabase token: cached for at most 60 s; expired and unknown issuers refused unchecked", async () => {
  let now = Date.now();
  const f = fakeFetch({ user: () => Response.json(GOOGLE_USER) });
  const check = checker(f, () => now);
  const t = supabaseToken();
  await check(t);
  await check(t);
  assert.equal(f.calls.length, 1);
  now += 61_000;
  await check(t);
  assert.equal(f.calls.length, 2);

  const g = fakeFetch({ user: () => Response.json(GOOGLE_USER) });
  const c2 = checker(g);
  assert.deepEqual(await c2(supabaseToken({ exp: nowS() - 1 })), { invalid: true });
  assert.deepEqual(await c2(supabaseToken({ iss: "https://evil.example/auth/v1" })), { invalid: true });
  assert.deepEqual(await c2(null), { invalid: true });
  assert.equal(g.calls.length, 0);
});

/* ------------------------------------------------------------------ */
/* Usernames                                                           */
/* ------------------------------------------------------------------ */

test("usernameProblem mirrors the database rules", () => {
  for (const ok of ["abhi", "Abhi_99", "a12", "rahul_sharma", "abcdefghijklmnopqrst", "adm1n", "turfking"]) {
    assert.equal(usernameProblem(ok), null, ok);
  }
  for (const bad of ["", "ab", "1abc", "_abc", "abc-d", "abc d", "abcdefghijklmnopqrstu", "ａbc", "abç", "аbc"]) {
    assert.equal(usernameProblem(bad), "bad", bad);
  }
  for (const r of ["admin", "Admin_1", "superadmin", "tap_turf", "TapTurf99", "my_tapturf", "login", "u__", "users2", "www", "me_1"]) {
    assert.equal(usernameProblem(r), "reserved", r);
  }
});

test("usernameCandidates: from the name, ASCII folded, all valid, numbered fallbacks", () => {
  const seq = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.4, 0.6, 0.8, 0.05, 0.15, 0.25];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const c = usernameCandidates("Abhishek Lonkar", rnd);
  assert.deepEqual(c.slice(0, 5), ["abhisheklonkar", "abhishek_lonkar", "abhishekl", "abhishek_l", "abhishek"]);
  assert.ok(c.length > 10 && c.length <= 50);
  for (const x of c) assert.equal(usernameProblem(x), null, x);

  assert.equal(usernameCandidates("José Núñez", rnd)[0], "josenunez");
  const hindi = usernameCandidates("राहुल", rnd);
  assert.ok(hindi.length > 0 && hindi.every((x) => x.startsWith("player")));
  assert.ok(usernameCandidates("Al", rnd).every((x) => /^al\d+$/.test(x)));
  assert.ok(usernameCandidates("Admin Guy", rnd).every((x) => usernameProblem(x) === null));
  assert.ok(usernameCandidates("Christopher Montgomery-Wellington", rnd).every((x) => x.length <= 20));
  assert.ok(usernameCandidates("007 Bond", rnd).every((x) => usernameProblem(x) === null));
});

/* ------------------------------------------------------------------ */
/* Server helpers                                                      */
/* ------------------------------------------------------------------ */

test("toProfile keeps the known fields and refuses malformed answers", () => {
  const p = toProfile({ id: "u1", name: "A", email: null, phone: "+919876543210", role: "user", username: "abc", taggable: false, r: "ok", extra: 1 });
  assert.deepEqual(p, {
    id: "u1",
    name: "A",
    email: null,
    phone: "+919876543210",
    role: "user",
    profile_image_url: null,
    created_at: "",
    username: "abc",
    taggable: false,
  });
  assert.equal(toProfile({ id: "u1", name: "A" })?.taggable, true);
  assert.equal(toProfile({ name: "A" }), null);
  assert.equal(toProfile(null), null);
  assert.equal(toProfile("x"), null);
});

test("account limiter counts per network per minute", () => {
  let t = 0;
  const allow = createAccountLimiter(2, () => t);
  const req = (ip: string) => new Request("http://x/", { headers: { "x-forwarded-for": ip } });
  assert.ok(allow(req("1.2.3.4")));
  assert.ok(allow(req("1.2.3.4")));
  assert.ok(!allow(req("1.2.3.4")));
  assert.ok(allow(req("5.6.7.8")));
  // Same IPv6 /64 is one network.
  assert.ok(allow(req("2001:db8::1")));
  assert.ok(allow(req("2001:db8::2")));
  assert.ok(!allow(req("2001:db8::3")));
  t += 60_000;
  assert.ok(allow(req("1.2.3.4")));
});

test("tags: username only, anything else dropped", () => {
  assert.ok(isTag({ u: "abhi" }));
  assert.ok(!isTag({ u: "Abhi" }));
  assert.ok(!isTag({ u: "ab" }));
  assert.ok(!isTag({ id: "x" }));
  assert.ok(!isTag([{ u: "abhi" }]));
  assert.deepEqual(readTag({ u: "abhi", uid: "secret" }), { u: "abhi" });
  assert.equal(readTag(null), null);
  assert.ok(sameTag(null, undefined));
  assert.ok(sameTag({ u: "abc" }, { u: "abc" }));
  assert.ok(!sameTag({ u: "abc" }, null));
});

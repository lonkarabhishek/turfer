import { test } from "node:test";
import assert from "node:assert/strict";
import type { Identity, IdentityResult } from "../account/identity";
import { LIVE_LEGACY_UNTIL, LIVE_WHO_MAX, createLiveWho, decideLiveWrite, gateLiveWrite, liveLinkKind, type LinkRead, type LiveGate, type LiveLinkKind, type LiveWho } from "./gate";

const SIGNER = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", method: "google" as const };
const WHO: Record<string, LiveWho> = { valid: { ok: SIGNER }, invalid: { invalid: true }, missing: { missing: true }, unavailable: { unavailable: true } };
const WRITE: LiveGate = { write: true, record: null };
const RECORD: LiveGate = { write: true, record: SIGNER };
const LOGIN: LiveGate = { refuse: "login" };
const WAIT: LiveGate = { refuse: "unavailable" };

test("the decision table: sign-in x link x starter", () => {
  // [who, link, starter recorded] -> answer
  const table: [keyof typeof WHO, LiveLinkKind, boolean, LiveGate][] = [
    // A verified sign-in writes, and records the starter (once: the database keeps the first), on any link.
    ["valid", "new", false, RECORD],
    ["valid", "new", true, RECORD],
    ["valid", "legacy", false, RECORD],
    ["valid", "legacy", true, RECORD],
    ["valid", "legacy_out", false, RECORD],
    ["valid", "legacy_out", true, RECORD],
    // No sign-in, or one that isn't valid: login, writing nothing, except a running link from before the check, in its grace.
    ["invalid", "new", false, LOGIN],
    ["invalid", "new", true, LOGIN],
    ["invalid", "legacy", false, WRITE],
    ["invalid", "legacy", true, WRITE],
    ["invalid", "legacy_out", false, LOGIN],
    ["invalid", "legacy_out", true, LOGIN],
    ["missing", "new", false, LOGIN],
    ["missing", "new", true, LOGIN],
    ["missing", "legacy", false, WRITE],
    ["missing", "legacy", true, WRITE],
    ["missing", "legacy_out", false, LOGIN],
    ["missing", "legacy_out", true, LOGIN],
    // Sign-ins can't be checked: a link whose starter is recorded carries on (fail open), the rest wait and retry (fail closed).
    ["unavailable", "new", false, WAIT],
    ["unavailable", "new", true, WRITE],
    ["unavailable", "legacy", false, WRITE],
    ["unavailable", "legacy", true, WRITE],
    ["unavailable", "legacy_out", false, WAIT],
    ["unavailable", "legacy_out", true, WRITE],
  ];
  for (const [who, link, starter, want] of table) assert.deepEqual(decideLiveWrite(WHO[who], link, starter), want, `${who} x ${link} x starter ${starter}`);
  assert.equal(table.length, 24);
});

test("the decision table: a starter that could not be read, and a link read that failed", () => {
  assert.deepEqual(decideLiveWrite(WHO.unavailable, "new", null), WAIT, "unknown starter: wait, never a guess");
  assert.deepEqual(decideLiveWrite(WHO.unavailable, "unknown", true), WRITE, "a recorded starter needs no link read");
  assert.deepEqual(decideLiveWrite(WHO.unavailable, "unknown", null), WAIT);
  // A failed read is no reason to ask a scorer to log in: they retry.
  assert.deepEqual(decideLiveWrite(WHO.missing, "unknown", null), WAIT);
  assert.deepEqual(decideLiveWrite(WHO.invalid, "unknown", false), WAIT);
  assert.deepEqual(decideLiveWrite(WHO.valid, "unknown", null), RECORD);
});

test("link kinds: a new code always needs the sign-in; an old one only when its match is not running, or after the grace", () => {
  const before = LIVE_LEGACY_UNTIL - 1;
  for (const row of ["running", "none", "unknown"] as LinkRead[]) {
    assert.equal(liveLinkKind(2, row, before), "new");
    assert.equal(liveLinkKind(1, row, LIVE_LEGACY_UNTIL), "legacy_out");
  }
  assert.equal(liveLinkKind(1, "running", before), "legacy");
  assert.equal(liveLinkKind(1, "none", before), "new", "an old code with no running match (none yet, a stop marker, stopped) starts only signed in");
  assert.equal(liveLinkKind(1, "unknown", before), "unknown");
  // The grace is a fixed, documented date: a week after the planned 30 Oct 2026 deploy.
  assert.equal(new Date(LIVE_LEGACY_UNTIL).toISOString(), "2026-11-05T18:30:00.000Z");
});

test("the gate reads only what the decision needs", async () => {
  const calls: string[] = [];
  const read = (row: LinkRead, starter: boolean | null) => ({
    row: async () => (calls.push("row"), row),
    starter: async () => (calls.push("starter"), starter),
  });
  const now = LIVE_LEGACY_UNTIL - 60_000;
  const run = async (who: LiveWho, gen: 1 | 2, row: LinkRead, starter: boolean | null, at = now) => {
    calls.length = 0;
    const g = await gateLiveWrite(who, gen, at, read(row, starter));
    return { g, calls: [...calls] };
  };
  // The usual case, one per ball: a verified sign-in reads nothing.
  assert.deepEqual(await run(WHO.valid, 2, "running", true), { g: RECORD, calls: [] });
  assert.deepEqual(await run(WHO.valid, 1, "running", true), { g: RECORD, calls: [] });
  // No sign-in on a new code: refused at once, no read.
  assert.deepEqual(await run(WHO.missing, 2, "running", true), { g: LOGIN, calls: [] });
  // An old code: its row says whether it is a running legacy link.
  assert.deepEqual(await run(WHO.missing, 1, "running", null), { g: WRITE, calls: ["row"] });
  assert.deepEqual(await run(WHO.missing, 1, "none", null), { g: LOGIN, calls: ["row"] });
  assert.deepEqual(await run(WHO.missing, 1, "unknown", null), { g: WAIT, calls: ["row"] });
  // After the grace an old code reads nothing either.
  assert.deepEqual(await run(WHO.missing, 1, "running", null, LIVE_LEGACY_UNTIL), { g: LOGIN, calls: [] });
  // Sign-ins can't be checked: the starter decides, read only then.
  assert.deepEqual(await run(WHO.unavailable, 2, "none", true), { g: WRITE, calls: ["starter"] });
  assert.deepEqual(await run(WHO.unavailable, 2, "none", false), { g: WAIT, calls: ["starter"] });
  assert.deepEqual(await run(WHO.unavailable, 2, "none", null), { g: WAIT, calls: ["starter"] });
  assert.deepEqual(await run(WHO.unavailable, 1, "running", false), { g: WRITE, calls: ["row"] });
  assert.deepEqual(await run(WHO.unavailable, 1, "none", true), { g: WRITE, calls: ["row", "starter"] });
});

/* ------------------------------------------------------------------ */
/* The signer: verified once per token, not once per ball              */
/* ------------------------------------------------------------------ */

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenFor = (sub: string, exp: number, iss = "https://securetoken.google.com/tapturf") => `${b64({ alg: "RS256" })}.${b64({ iss, exp, sub })}.sig`;
const PHONE: Identity = { kind: "phone", phone: "+910000000000", sub: "fb-1", authTime: 1, iat: 1, provider: "phone" };
const GOOGLE: Identity = { kind: "google", uid: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", email: null, name: "G", avatar: null, oauthAt: 1 };

function harness(opts: { id?: IdentityResult; account?: { ok: string } | { none: true } | { unavailable: true } } = {}) {
  let now = 1_800_000_000_000;
  const counts = { identify: 0, account: 0 };
  const deps = {
    identify: async (): Promise<IdentityResult> => (counts.identify++, opts.id ?? { ok: PHONE }),
    account: async () => (counts.account++, opts.account ?? { ok: "user-1" }),
    now: () => now,
  };
  return { who: createLiveWho(deps), counts, tick: (ms: number) => (now += ms), at: () => now };
}

test("signer: no token is missing, and a malformed or expired one is invalid without a check", async () => {
  const h = harness();
  assert.deepEqual(await h.who(null), { missing: true });
  assert.deepEqual(await h.who(""), { missing: true });
  assert.deepEqual(await h.who("not.a-token"), { invalid: true });
  assert.deepEqual(await h.who(tokenFor("x", Math.floor(h.at() / 1000) - 1)), { invalid: true });
  assert.deepEqual(h.counts, { identify: 0, account: 0 });
});

test("signer: a match on one token costs one check, not one per ball (measured)", async () => {
  const h = harness();
  const t = tokenFor("x", Math.floor(h.at() / 1000) + 3600);
  for (let ball = 0; ball < 120; ball++) {
    assert.deepEqual(await h.who(t), { ok: { userId: "user-1", method: "phone" } });
    h.tick(2_500); // a write at most every 2.5 s: 120 balls in 5 minutes
  }
  assert.deepEqual(h.counts, { identify: 1, account: 1 }, "120 writes, one identity check and one account read");
  // Until the token's own expiry, then it is refused before any check, and the next token is checked once.
  h.tick(3600_000);
  assert.deepEqual(await h.who(t), { invalid: true });
  const t2 = tokenFor("x", Math.floor(h.at() / 1000) + 3600);
  await h.who(t2);
  await h.who(t2);
  assert.deepEqual(h.counts, { identify: 2, account: 2 });
});

test("signer: Google sign-ins say google; only verified answers are kept", async () => {
  const g = harness({ id: { ok: GOOGLE }, account: { ok: "user-2" } });
  const t = tokenFor("x", Math.floor(g.at() / 1000) + 3600, "https://example.supabase.co/auth/v1");
  assert.deepEqual(await g.who(t), { ok: { userId: "user-2", method: "google" } });

  for (const [id, account, want] of [
    [{ invalid: true }, undefined, { invalid: true }],
    [{ unavailable: true }, undefined, { unavailable: true }],
    [{ ok: PHONE }, { none: true }, { invalid: true }],
    [{ ok: PHONE }, { unavailable: true }, { unavailable: true }],
  ] as [IdentityResult, { none: true } | { unavailable: true } | undefined, LiveWho][]) {
    const h = harness({ id, account });
    const tok = tokenFor("x", Math.floor(h.at() / 1000) + 3600);
    assert.deepEqual(await h.who(tok), want);
    assert.deepEqual(await h.who(tok), want);
    // Nothing kept: each try checks again, so a sign-in that comes back works at once.
    assert.equal(h.counts.identify, 2, JSON.stringify(want));
  }
});

test("signer: the cache is bounded", async () => {
  const h = harness();
  const exp = Math.floor(h.at() / 1000) + 3600;
  const first = tokenFor("t0", exp);
  await h.who(first);
  for (let i = 1; i <= LIVE_WHO_MAX; i++) await h.who(tokenFor(`t${i}`, exp));
  assert.equal(h.counts.identify, LIVE_WHO_MAX + 1);
  // The oldest went to make room.
  await h.who(first);
  assert.equal(h.counts.identify, LIVE_WHO_MAX + 2);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readArt, signArt } from "./artToken";

const KEY = "art-test-key-0123456789";
const OTHER = "another-key-9876543210";
const NAMES = ["ART_TOKEN_KEY", "ACCOUNT_KEY", "LIVE_WRITE_KEY"] as const;
type Env = Partial<Record<(typeof NAMES)[number], string>>;

/** Runs `fn` with exactly these keys set, then puts the environment back. */
function withKeys(env: Env, fn: () => void) {
  const before = NAMES.map((n) => process.env[n]);
  try {
    for (const n of NAMES) {
      if (env[n] === undefined) delete process.env[n];
      else process.env[n] = env[n];
    }
    fn();
  } finally {
    NAMES.forEach((n, k) => {
      if (before[k] === undefined) delete process.env[n];
      else process.env[n] = before[k];
    });
  }
}

/** A token for any body, signed the way the module signs: what a leaked key, or a bug on our side, could produce. */
function forge(body: unknown, key = KEY): string {
  const b = Buffer.from(typeof body === "string" ? body : JSON.stringify(body)).toString("base64url");
  return `${b}.${createHmac("sha256", key).update(`blog-art:${b}`).digest("base64url")}`;
}

const BRIEF = "Top view of a box cricket cage, 30 m by 15 m, with the pitch in the middle and the scoring zones labelled";
const ALT = "A box cricket cage from above with its zones";

test("signs and reads back what to draw", () => {
  withKeys({ ART_TOKEN_KEY: KEY }, () => {
    const t = signArt("box-cricket-rules", BRIEF, ALT);
    assert.ok(t);
    assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/, "URL safe, one dot, a SHA-256 tag");
    assert.deepEqual(readArt(t), { slug: "box-cricket-rules", brief: BRIEF, alt: ALT });
    // Same input, same token: the CDN and the art cache see one URL per drawing.
    assert.equal(signArt("box-cricket-rules", BRIEF, ALT), t);
    // Any script, trimmed.
    const u = signArt("turf-prices-nashik", "  ₹900 an hour at नाशिक's turfs, drawn as a price board  ", " Price board \n");
    assert.deepEqual(readArt(u!), { slug: "turf-prices-nashik", brief: "₹900 an hour at नाशिक's turfs, drawn as a price board", alt: "Price board" });
    // An empty alt is allowed (the chat falls back to the title).
    assert.deepEqual(readArt(signArt("a", "x", "")!), { slug: "a", brief: "x", alt: "" });
    // Limits are inclusive.
    const long = signArt("a".repeat(120), "b".repeat(900), "c".repeat(200));
    assert.ok(long && long.length <= 2048);
    assert.deepEqual(readArt(long), { slug: "a".repeat(120), brief: "b".repeat(900), alt: "c".repeat(200) });
  });
});

test("no key, or one too short: no tokens made and none read", () => {
  let t = "";
  withKeys({ ART_TOKEN_KEY: KEY }, () => (t = signArt("a", BRIEF, ALT)!));
  for (const env of [{}, { ART_TOKEN_KEY: "" }, { ART_TOKEN_KEY: "   " }, { ART_TOKEN_KEY: "short-15-chars!" }, { ACCOUNT_KEY: "x".repeat(15) }] as Env[]) {
    withKeys(env, () => {
      assert.equal(signArt("a", BRIEF, ALT), null, JSON.stringify(env));
      assert.equal(readArt(t), null, JSON.stringify(env));
    });
  }
});

test("the key: ART_TOKEN_KEY, else ACCOUNT_KEY, else LIVE_WRITE_KEY, the first long enough; trimmed", () => {
  const tokenWith = (env: Env) => {
    let t: string | null = null;
    withKeys(env, () => (t = signArt("a", BRIEF, ALT)));
    return t;
  };
  const viaArt = tokenWith({ ART_TOKEN_KEY: KEY });
  assert.equal(tokenWith({ ART_TOKEN_KEY: KEY, ACCOUNT_KEY: OTHER, LIVE_WRITE_KEY: OTHER }), viaArt);
  assert.equal(tokenWith({ ACCOUNT_KEY: KEY, LIVE_WRITE_KEY: OTHER }), viaArt);
  assert.equal(tokenWith({ LIVE_WRITE_KEY: KEY }), viaArt);
  assert.equal(tokenWith({ ART_TOKEN_KEY: "too-short", ACCOUNT_KEY: KEY }), viaArt);
  assert.equal(tokenWith({ ART_TOKEN_KEY: ` ${KEY}\n` }), viaArt);
  assert.notEqual(tokenWith({ ART_TOKEN_KEY: OTHER, ACCOUNT_KEY: KEY }), viaArt);
  // Setting ART_TOKEN_KEY later retires tokens made with the shared key.
  withKeys({ ART_TOKEN_KEY: OTHER, ACCOUNT_KEY: KEY }, () => assert.equal(readArt(viaArt!), null));
});

test("a token made with another key is refused", () => {
  let t = "";
  withKeys({ ART_TOKEN_KEY: OTHER }, () => (t = signArt("a", BRIEF, ALT)!));
  withKeys({ ART_TOKEN_KEY: KEY }, () => {
    assert.equal(readArt(t), null);
    assert.equal(readArt(forge({ v: 1, s: "a", b: BRIEF, a: ALT }, OTHER)), null);
    // A plain HMAC of the body, without our prefix, is not our tag either.
    const body = Buffer.from(JSON.stringify({ v: 1, s: "a", b: BRIEF, a: ALT })).toString("base64url");
    assert.equal(readArt(`${body}.${createHmac("sha256", KEY).update(body).digest("base64url")}`), null);
  });
});

test("any change to a token makes it worthless", () => {
  withKeys({ ART_TOKEN_KEY: KEY }, () => {
    const t = signArt("box-cricket-rules", BRIEF, ALT)!;
    const u = signArt("football-pitch-size", "A 5-a-side pitch, 40 m by 20 m, with both goals", "A 5-a-side pitch")!;
    const [body, tag] = t.split(".");
    const swap = (c: string) => (c === "A" ? "B" : "A");
    // Every character of the body and of the tag, in turn.
    for (let k = 0; k < t.length; k++) {
      if (t[k] === ".") continue;
      assert.equal(readArt(t.slice(0, k) + swap(t[k]) + t.slice(k + 1)), null, `char ${k}`);
    }
    for (const bad of [
      `${u.split(".")[0]}.${tag}`, // another token's body under this tag
      `${body}.${u.split(".")[1]}`,
      `${body}.${tag}A`,
      `${body}.${tag.slice(0, -1)}`,
      `${body}A.${tag}`,
      `${body}.${tag}.${tag}`,
      `${body}..${tag}`,
      `.${tag}`,
      `${body}.`,
      body,
      `${body} .${tag}`,
      `${body}.${tag}=`,
      `${body}.${tag.replace(/-/g, "+").replace(/_/g, "/")}x`,
      `${body}=.${tag}`,
      encodeURIComponent(t) + "%00",
      "",
      ".",
      "..",
    ]) {
      assert.equal(readArt(bad), null, bad);
    }
    for (const bad of [undefined, null, 42, {}, [t], { toString: () => t }]) assert.equal(readArt(bad as unknown as string), null);
  });
});

test("a valid tag over the wrong contents is still refused", () => {
  withKeys({ ART_TOKEN_KEY: KEY }, () => {
    // The helper signs like the module does, so this one passes.
    assert.deepEqual(readArt(forge({ v: 1, s: "a", b: "x", a: "y" })), { slug: "a", brief: "x", alt: "y" });
    for (const body of [
      { v: 2, s: "a", b: "x", a: "y" },
      { v: "1", s: "a", b: "x", a: "y" },
      { s: "a", b: "x", a: "y" },
      { v: 1, b: "x", a: "y" },
      { v: 1, s: "a", a: "y" },
      { v: 1, s: "a", b: "x" },
      { v: 1, s: "../../etc/passwd", b: "x", a: "y" },
      { v: 1, s: "Box-Cricket", b: "x", a: "y" },
      { v: 1, s: "a b", b: "x", a: "y" },
      { v: 1, s: "", b: "x", a: "y" },
      { v: 1, s: "a".repeat(121), b: "x", a: "y" },
      { v: 1, s: "a", b: "", a: "y" },
      { v: 1, s: "a", b: " x ", a: "y" },
      { v: 1, s: "a", b: "b".repeat(901), a: "y" },
      { v: 1, s: "a", b: "x", a: "c".repeat(201) },
      { v: 1, s: 1, b: "x", a: "y" },
      { v: 1, s: "a", b: ["x"], a: "y" },
      { v: 1, s: "a", b: "x", a: null },
      [1, "a", "x", "y"],
      null,
      "a string",
      42,
      "not json at all",
      "{\"v\":1,",
    ]) {
      assert.equal(readArt(forge(body)), null, JSON.stringify(body));
    }
    // Longer than 2048 characters, though signed.
    const huge = forge({ v: 1, s: "a", b: "x", a: "y", pad: "p".repeat(1600) });
    assert.ok(huge.length > 2048);
    assert.equal(readArt(huge), null);
  });
});

test("signArt refuses parts that don't fit, rather than cutting them", () => {
  withKeys({ ART_TOKEN_KEY: KEY }, () => {
    for (const [slug, brief, alt] of [
      ["", BRIEF, ALT],
      ["Box-Cricket", BRIEF, ALT],
      ["box cricket", BRIEF, ALT],
      ["../x", BRIEF, ALT],
      ["a".repeat(121), BRIEF, ALT],
      ["a", "", ALT],
      ["a", "   \n", ALT],
      ["a", "b".repeat(901), ALT],
      ["a", BRIEF, "c".repeat(201)],
      // Fits by length, but three bytes a character makes the token longer than 2048.
      ["a", "न".repeat(600), "न".repeat(200)],
    ]) {
      assert.equal(signArt(slug, brief, alt), null, `${slug.slice(0, 20)} / ${brief.slice(0, 20)} / ${alt.length}`);
    }
    for (const bad of [undefined, null, 1]) {
      assert.equal(signArt(bad as unknown as string, BRIEF, ALT), null);
      assert.equal(signArt("a", bad as unknown as string, ALT), null);
      assert.equal(signArt("a", BRIEF, bad as unknown as string), null);
    }
  });
});

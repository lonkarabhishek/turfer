// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST_COPY_MAX_MS, HOST_LINKS, HOST_NAME_MAX, HOST_SWITCH_NAME, HOST_UNKNOWN, hostCopyFresh, hostNote, sameHost, toHostRead } from "./host";
import type { TournamentHost } from "./types";

const ROW = { u: "asha", name: "Asha Rao", photo: "https://lh3.googleusercontent.com/a/asha=s256-c", verified: true, m: "games-25", n: 7 };
const ASHA: TournamentHost = { username: "asha", name: "Asha Rao", photo: "https://lh3.googleusercontent.com/a/asha=s256-c", verified: true, medal: "games-25", medals: 7 };

test("tournament_host's answer in the app's terms", () => {
  assert.deepEqual(toHostRead(ROW), { known: true, host: ASHA });
  assert.deepEqual(toHostRead({ u: "ravi_k", name: "Ravi Kumar", photo: null, verified: false, m: null, n: 0 }), { known: true, host: { username: "ravi_k", name: "Ravi Kumar", photo: null, verified: false, medal: null, medals: 0 } });
  assert.deepEqual(toHostRead({ ...ROW, photo: "/avatars/striker.svg" }).host!.photo, "/avatars/striker.svg", "a sports avatar");
});

test("nobody to name: asked, and the answer is no one", () => {
  for (const none of [null, undefined]) assert.deepEqual(toHostRead(none), { known: true, host: null });
  // Not a public organiser: never a guess.
  for (const bad of [{}, { ...ROW, u: "Asha" }, { ...ROW, u: "as" }, { ...ROW, u: "asha rao" }, { ...ROW, u: "../admin" }, { ...ROW, u: 7 }, { ...ROW, u: null }, { ...ROW, name: "" }, { ...ROW, name: "   " }, { ...ROW, name: "\n\t" }, { ...ROW, name: null }, { ...ROW, name: 42 }, { name: "Asha Rao" }])
    assert.deepEqual(toHostRead(bad), { known: true, host: null }, JSON.stringify(bad));
});

test("could not be asked: a refusal or no answer at all names nobody and is not 'no one'", () => {
  for (const off of [{ r: "unavailable" }, { r: "ok", ...ROW }, "asha", 7, true, [ROW], []]) assert.deepEqual(toHostRead(off), HOST_UNKNOWN, JSON.stringify(off));
  assert.deepEqual(HOST_UNKNOWN, { known: false, host: null });
});

test("only what a public profile shows is kept, tidied", () => {
  // Whatever else an answer carried is never copied.
  const extra = toHostRead({ ...ROW, id: "00000000-0000-4000-8000-000000000001", user_id: "x", phone: "+919800000001", email: "asha@example.test", since: "2026-01-01" }).host!;
  assert.deepEqual(Object.keys(extra).sort(), ["medal", "medals", "name", "photo", "username", "verified"]);
  assert.doesNotMatch(JSON.stringify(extra), /9800000001|example|0000-4000/);
  // A name is one line of at most HOST_NAME_MAX characters.
  assert.equal(toHostRead({ ...ROW, name: "  Asha \n\n Rao\t" }).host!.name, "Asha Rao");
  assert.equal(toHostRead({ ...ROW, name: "A".repeat(200) }).host!.name.length, HOST_NAME_MAX);
  assert.equal(toHostRead({ ...ROW, name: "आशुतोष पाटील" }).host!.name, "आशुतोष पाटील");
  // The tick only on a plain true.
  for (const v of [false, null, undefined, "true", 1]) assert.equal(toHostRead({ ...ROW, verified: v }).host!.verified, false);
  // A photo only from an https address or a sports avatar's path.
  for (const p of ["http://example.test/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "//example.test/a.png", "", 7, null, `https://x.test/${"a".repeat(900)}`]) assert.equal(toHostRead({ ...ROW, photo: p }).host!.photo, null, String(p).slice(0, 30));
});

test("the medal: one this build knows, with its count; otherwise the person is named without one", () => {
  for (const [m, n] of [["no-such-medal", 3], ["games-25", 0], ["games-25", -1], ["games-25", 100], ["games-25", 2.5], ["games-25", "7"], [null, 7], [7, 7], ["<svg>", 1]] as const) {
    const h = toHostRead({ ...ROW, m, n }).host!;
    assert.equal(h.name, "Asha Rao");
    assert.deepEqual([h.medal, h.medals], [null, 0], JSON.stringify([m, n]));
  }
  assert.deepEqual([toHostRead({ ...ROW, m: "first-game", n: 1 }).host!.medal, toHostRead({ ...ROW, m: "first-game", n: 1 }).host!.medals], ["first-game", 1]);
  assert.equal(toHostRead({ ...ROW, n: 99 }).host!.medals, 99);
});

test("a name is never shown from a copy older than a minute and a half", () => {
  const now = Date.parse("2026-11-23T10:00:00Z");
  assert.equal(HOST_COPY_MAX_MS, 90_000);
  assert.ok(hostCopyFresh(now, now));
  assert.ok(hostCopyFresh(now - 30_000, now), "the cache's own 30 seconds");
  assert.ok(hostCopyFresh(now - 60_000, now), "a copy handed back while the next is fetched, on a page being followed");
  assert.ok(hostCopyFresh(now - 90_000, now));
  assert.ok(!hostCopyFresh(now - 90_001, now), "past that it is asked again, not shown");
  assert.ok(!hostCopyFresh(now - 86_400_000, now), "a page nobody opened since yesterday");
  assert.ok(hostCopyFresh(now + 2_000, now), "another instance's clock a little ahead");
  assert.ok(!hostCopyFresh(now + 60_000, now), "a time from the future is not trusted");
  for (const bad of [undefined, null, "2026-11-23", NaN, Infinity, {}]) assert.ok(!hostCopyFresh(bad, now), String(bad));
});

test("an open page takes a poll's answer only when who is named differs", () => {
  assert.ok(sameHost(ASHA, { ...ASHA }));
  assert.ok(sameHost(null, null));
  assert.ok(sameHost(undefined, undefined));
  assert.ok(!sameHost(ASHA, null), "the switch went off: the name goes");
  assert.ok(!sameHost(null, ASHA));
  assert.ok(!sameHost(null, undefined), "no one, and could not be asked, are not the same");
  assert.ok(!sameHost(ASHA, undefined));
  for (const k of ["username", "name", "photo", "verified", "medal", "medals"] as const) assert.ok(!sameHost(ASHA, { ...ASHA, [k]: k === "verified" ? false : k === "medals" ? 8 : "x" }), k);
});

test("the organiser's own line: what shows, why, and where the switch is", () => {
  const me = { username: "asha", taggable: true };
  // Their name shows, because their profile is public.
  assert.deepEqual(hostNote(ASHA, me), {
    text: "Your name and photo show on this page, linked to your profile, because your profile is public. To hide them, turn off “Let others find and tag me”.",
    link: { href: "/dashboard?tab=profile#find-and-tag", label: "Open that switch" },
  });
  // Someone else's device holding the secret (or signed out): it says who, and offers no switch that isn't theirs.
  assert.deepEqual(hostNote(ASHA, null), { text: "This page says Asha Rao started it, because that profile is public.", link: null });
  assert.deepEqual(hostNote(ASHA, { username: "ravi_k", taggable: true }), { text: "This page says Asha Rao started it, because that profile is public.", link: null });
  // No name shows.
  assert.deepEqual(hostNote(null, { username: "asha", taggable: false }), {
    text: "This page shows no name for who started it, because your profile isn’t public (“Let others find and tag me” is off).",
    link: { href: "/dashboard?tab=profile#find-and-tag", label: "Open that switch" },
  });
  assert.deepEqual(hostNote(null, { username: null, taggable: true }), { text: "This page shows no name for who started it: you have no public profile.", link: { href: "/dashboard?tab=profile#username", label: "Pick a username" } });
  assert.deepEqual(hostNote(null, {}), { text: "This page shows no name for who started it: you have no public profile.", link: { href: "/dashboard?tab=profile#username", label: "Pick a username" } });
  assert.deepEqual(hostNote(null, null), { text: "This page shows no name for who started it. If you sign in and your profile is public, it will show yours.", link: null });
  // A public profile, and still no name: the tournament isn't kept with this account (or was only just). Nothing is guessed.
  assert.deepEqual(hostNote(null, me), { text: "This page shows no name for who started it.", link: null });
  // Before the migration, or when the read failed: no line at all.
  assert.equal(hostNote(undefined, me), null);
  assert.equal(hostNote(undefined, null), null);
  assert.equal(HOST_LINKS.switch, "/dashboard?tab=profile#find-and-tag");
  assert.equal(HOST_SWITCH_NAME, "Let others find and tag me");
});

test("the switch and the username field are where the line sends people", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const profile = fs.readFileSync(path.join(process.cwd(), "components/dashboard/ProfileSection.tsx"), "utf8");
  assert.match(profile, /id="find-and-tag"/);
  assert.match(profile, /id="username"/);
  assert.ok(fs.readFileSync(path.join(process.cwd(), "components/account/TagSwitch.tsx"), "utf8").includes(`>${HOST_SWITCH_NAME}<`), "the switch is called what the line calls it");
  assert.match(profile, /Off also hides your profile page, the “Managed by” line on turfs you run and your name on tournaments you started\./, "and the switch itself says what turning it off hides");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { afterMidnight, cityText, clockText, dayText, escapeHtml, mapsLink, namesText, oneLine, priceText, sportText, venueLine, whenRange, whenText } from "./format";
import { pagePath, renderEmail } from "./templates";
import { offKey, offToken, readOffToken } from "./token";
import { svixKey, svixSign, svixVerify } from "./svix";
import { emailConfig, fromOf, mailtoOff, resendBody, sendEmail, testApiBase } from "./send";
import { offPage } from "./offPage";
import type { EmailJob, EmailKind } from "./types";

// Made-up people, places and addresses only.

const GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const LINKS = { site: "https://www.tapturf.in", off: "https://www.tapturf.in/email/off?t=TOKEN" };

const game = (o: Partial<NonNullable<EmailJob["game"]>> = {}): NonNullable<EmailJob["game"]> => ({
  id: GAME,
  sport: "Football",
  date: "2026-11-14",
  start_time: "19:00",
  end_time: "20:00",
  price_per_player: 150,
  status: "open",
  host_first: "Asha",
  players: 6,
  max_players: 10,
  venue: { name: "Kings Turf", area: "Baner", city: "pune", address: "Plot 4, Baner Road", lat: 18.559, lng: 73.786, maps_url: null, turf_slug: "kings-turf" },
  ...o,
});
const job = (kind: EmailKind, o: Partial<EmailJob> = {}): EmailJob => ({
  id: "eeeeeeee-eeee-4eee-8eee-000000000001",
  kind,
  user_id: USER,
  to: "ravi.standin@example.com",
  name: "Ravi",
  attempt: 1,
  ...(kind === "welcome" ? { path: "/games" } : { path: `/game/${GAME}`, game: game() }),
  ...o,
});

/* ---------------- words ---------------- */

test("days and times in India time, as people say them", () => {
  assert.equal(dayText("2026-11-14"), "Sat 14 Nov");
  assert.equal(dayText("2026-02-30"), "", "not a day");
  assert.equal(dayText("14/11/2026"), "");
  assert.equal(clockText("19:00"), "7 PM");
  assert.equal(clockText("06:30:00"), "6:30 AM");
  assert.equal(clockText("00:00"), "12 AM");
  assert.equal(clockText("12:15"), "12:15 PM");
  assert.equal(clockText("24:00"), "");
  assert.equal(whenText("2026-11-14", "19:00"), "Sat 14 Nov, 7 PM");
  assert.equal(whenRange({ date: "2026-11-14", start_time: "19:00", end_time: "20:30" }), "Sat 14 Nov, 7 PM to 8:30 PM");
  assert.equal(whenRange({ date: "2026-11-14", start_time: "19:00", end_time: null }), "Sat 14 Nov, 7 PM");
});

test("places, prices and names", () => {
  assert.equal(cityText("pune"), "Pune");
  assert.equal(cityText("navi-mumbai"), "Navi Mumbai");
  assert.equal(cityText("Wai"), "Wai", "a typed town as typed");
  assert.equal(venueLine(game().venue), "Kings Turf, Baner, Pune");
  assert.equal(venueLine({ ...game().venue, area: null }), "Kings Turf, Pune");
  assert.equal(mapsLink(game().venue), "https://www.google.com/maps/search/?api=1&query=18.559,73.786", "the point");
  assert.equal(mapsLink({ ...game().venue, lat: null, lng: null }), "https://www.google.com/maps/search/?api=1&query=Kings%20Turf%2C%20Plot%204%2C%20Baner%20Road%2C%20Baner%2C%20Pune", "a search");
  assert.equal(mapsLink({ ...game().venue, maps_url: "https://maps.app.goo.gl/AbCd123" }), "https://maps.app.goo.gl/AbCd123", "a typed venue's own link");
  assert.equal(mapsLink({ ...game().venue, maps_url: "https://evil.example/maps" }), "https://www.google.com/maps/search/?api=1&query=18.559,73.786", "never another site");
  assert.equal(mapsLink({ ...game().venue, maps_url: "javascript:alert(1)", lat: null, lng: null, name: null, address: null, area: null, city: null }), null);
  assert.equal(priceText(150), "₹150 per player");
  assert.equal(priceText("99.50"), "₹99.50 per player");
  assert.equal(priceText(0), null, "free: no price line");
  assert.equal(priceText(null), null);
  assert.equal(namesText(["Ravi"]), "Ravi");
  assert.equal(namesText(["Ravi", "Zoya"]), "Ravi and Zoya");
  assert.equal(namesText(["Ravi", "Zoya", "Priya"]), "Ravi, Zoya and Priya");
  assert.equal(namesText(["Ravi", "Zoya", "Priya", "Omar", "Neha"]), "Ravi, Zoya and 3 others");
  assert.equal(oneLine("  a\nb c  "), "a b c");
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&#60;a href&#61;&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;");
});

/* ---------------- the six ---------------- */

const all: [string, EmailJob][] = [
  ["welcome", job("welcome", { name: "Farah" })],
  ["one join request", job("join_request", { to: "asha.standin@example.com", name: "Asha", you_host: true, requests: [{ name: "Ravi Kumar" }] })],
  ["three join requests", job("join_request", { you_host: true, requests: [{ name: "Ravi Kumar" }, { name: "Zoya Khan" }, { name: "Priya Sharma" }] })],
  ["a request waiting", job("request_waiting", { you_host: true, requests: [{ name: "Zoya Khan" }] })],
  ["you're in", job("request_accepted")],
  ["cancelled", job("game_cancelled", { game: game({ status: "cancelled" }) })],
  ["a new time", job("game_changed", { changes: ["time"], from: { date: "2026-11-13", start_time: "18:00" } })],
  ["a new venue", job("game_changed", { changes: ["venue"] })],
  ["both", job("game_changed", { changes: ["time", "venue"], from: { date: "2026-11-13", start_time: "18:00" } })],
  ["tomorrow", job("reminder", { when: "tomorrow" })],
  ["in about 3 hours, the host", job("reminder", { when: "soon", you_host: true })],
];

test("every email: a subject, a preheader, one button, the footer, no images or tracking", () => {
  for (const [what, j] of all) {
    const e = renderEmail(j, LINKS);
    assert.ok(e, what);
    assert.ok(e.subject.length > 5 && e.subject.length <= 140, `${what}: subject`);
    assert.ok(e.preheader.length > 5, `${what}: preheader`);
    assert.equal((e.html.match(/data-button="1"/g) ?? []).length, 1, `${what}: one button`);
    assert.doesNotMatch(e.html, /<img|<script|<link |<iframe|url\(|@import|track|pixel|utm_/i, `${what}: no images, scripts, pixels or tracking`);
    assert.match(e.html, /Reply to this email to reach TapTurf\./, `${what}: the reply line`);
    assert.match(e.text, /Reply to this email to reach TapTurf\./);
    assert.ok(e.html.includes(`href="${escapeHtml(LINKS.off)}"`), `${what}: the turn off link`);
    assert.ok(e.text.includes(LINKS.off), `${what}: the turn off link in the text`);
    assert.match(e.html, /You (made|host|asked|were|are)[^<]+TapTurf/, `${what}: why they got it`);
    assert.match(e.html, /max-width:560px/, `${what}: one column`);
    assert.match(e.html, /background:#F3F4F6/, `${what}: a light background`);
    for (const href of [...e.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&#38;/g, "&").replace(/&#61;/g, "=").replace(/&#39;/g, "'"))) {
      assert.ok(href.startsWith("https://www.tapturf.in/") || href.startsWith("https://www.google.com/maps/") || href.startsWith("https://maps.app.goo.gl/"), `${what}: a link straight to its page (${href})`);
    }
    assert.doesNotMatch(`${e.subject} ${e.text}`, /\binstant|guarantee|doesn.t take bookings|don.t take bookings|\bbook (a|your|now)/i, `${what}: no banned words`);
    assert.doesNotMatch(e.html, /—|–/, `${what}: no long dashes`);
  }
});

test("each email says what it should", () => {
  const r = (i: number) => renderEmail(all[i][1], LINKS)!;
  assert.equal(r(0).subject, "Welcome to TapTurf");
  assert.match(r(0).html, /Welcome to TapTurf, Farah/);
  assert.match(r(0).html, /Turn off all TapTurf emails/);
  assert.match(r(0).text, /Find a game: https:\/\/www\.tapturf\.in\/games/);

  assert.equal(r(1).subject, "Ravi Kumar wants to join your Football game");
  assert.match(r(1).text, /Ravi Kumar asked to join your Football game on Sat 14 Nov\./);
  assert.match(r(1).text, /When: Sat 14 Nov, 7 PM to 8 PM/);
  assert.match(r(1).text, /Players: 6 of 10 in/);
  // The database sends /game/<uuid>; the email links the game's readable URL (pagePath).
  assert.match(r(1).text, /Accept or decline: https:\/\/www\.tapturf\.in\/game\/football-kings-turf-baner-pune-sat-14-nov-7pm-dddddddd$/m);
  assert.ok(r(1).html.includes('href="https://www.tapturf.in/game/football-kings-turf-baner-pune-sat-14-nov-7pm-dddddddd"'), "the button too");
  assert.ok(!r(1).html.includes(`/game/${GAME}`) && !r(1).text.includes(`/game/${GAME}`), "never the id link");
  assert.equal(pagePath({ path: "/games", game: game() }), "/games", "another path as sent");
  assert.equal(pagePath({ path: `/game/${GAME}`, game: game({ venue: { ...game().venue, name: null } }) }), `/game/${GAME}`, "no venue to name: the id link, which redirects");
  assert.doesNotMatch(r(1).text, /Host: /, "the host is not told who hosts");

  assert.equal(r(2).subject, "3 players want to join your Football game");
  assert.match(r(2).text, /- Ravi Kumar\n- Zoya Khan\n- Priya Sharma/);
  assert.match(r(2).text, /Answer the requests:/);

  assert.equal(r(3).subject, "Zoya Khan is still waiting to hear from you");
  assert.match(r(3).text, /A quick yes or no helps them plan\./);

  assert.equal(r(4).subject, "You're in: Football on Sat 14 Nov, 7 PM");
  assert.match(r(4).text, /Asha accepted your request to join Football\./);
  assert.match(r(4).text, /Where: Kings Turf, Baner, Pune\nMap: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=18\.559,73\.786/);
  assert.match(r(4).text, /Price: ₹150 per player/);
  assert.match(r(4).text, /Host: Asha/);
  assert.match(r(4).html, /Open in Google Maps/);

  assert.equal(r(5).subject, "Cancelled: Football on Sat 14 Nov, 7 PM");
  assert.match(r(5).text, /Asha cancelled Football on Sat 14 Nov, 7 PM at Kings Turf, Baner, Pune\. You don't need to do anything\./);
  assert.match(r(5).text, /Find another game: https:\/\/www\.tapturf\.in\/games/);
  assert.match(r(5).html, /Turn off game change emails/);

  assert.equal(r(6).subject, "New time: Football is now Sat 14 Nov, 7 PM");
  assert.match(r(6).text, /Asha changed the day or time\. It was Fri 13 Nov, 6 PM\./);
  assert.equal(r(7).subject, "New venue: Football on Sat 14 Nov, 7 PM is at Kings Turf");
  assert.match(r(7).text, /Asha moved it to Kings Turf, Baner, Pune\./);
  assert.doesNotMatch(r(7).text, /changed the day or time/);
  assert.equal(r(8).subject, "Football moved to Sat 14 Nov, 7 PM at Kings Turf");

  assert.equal(r(9).subject, "Tomorrow: Football at 7 PM, Kings Turf");
  assert.match(r(9).text, /Your game is tomorrow/);
  assert.match(r(9).text, /Asha is hosting Football\./);
  assert.match(r(9).html, /Turn off reminder emails/);
  assert.equal(r(10).subject, "In about 3 hours: Football at 7 PM, Kings Turf");
  assert.match(r(10).text, /You're hosting Football\./);
  assert.match(r(10).text, /You host this game on TapTurf\./);
});

test("the sport as the app says it, Welcome's reason, a game after midnight", () => {
  // Games store the sport as typed: "cricket", "football" (36% of games on 10 Nov 2026).
  assert.equal(sportText("cricket"), "Cricket");
  assert.equal(sportText(" box  cricket "), "Box Cricket");
  assert.equal(sportText("5V5 football"), "5v5 Football");
  assert.equal(sportText(""), "Your game");
  const lower = job("request_accepted", { game: game({ sport: "cricket" }) });
  const e = renderEmail(lower, LINKS)!;
  assert.equal(e.subject, "You're in: Cricket on Sat 14 Nov, 7 PM");
  // Its words, that is: the game's readable link is lower case (lib/utils/gamePath.ts).
  assert.doesNotMatch(`${e.subject} ${e.preheader} ${e.text.replace(/https:\/\/\S+/g, "")}`, /\bcricket\b/, "never lower case");
  assert.match(e.text, /See the game: https:\/\/www\.tapturf\.in\/game\/cricket-kings-turf-baner-pune-sat-14-nov-7pm-dddddddd$/m);
  const rem = renderEmail(job("reminder", { when: "soon", game: game({ sport: "football", host_first: null }) }), LINKS)!;
  assert.match(rem.text, /^Football is on\.$/m, "a sentence never starts in lower case");

  // Welcome also goes to an account made by phone that added Google within 3 days.
  const w = renderEmail(job("welcome", { name: "Farah" }), LINKS)!;
  assert.match(w.text, /You made a TapTurf account, and Google confirmed this address for it\./);
  assert.doesNotMatch(w.text, /with this Google address/);

  // A game at 12:30 AM Thu, reminded at 6 PM Wed: "tonight, after midnight", never "tomorrow".
  for (const t of ["00:00", "00:30", "04:59"]) assert.ok(afterMidnight(t), t);
  for (const t of ["05:00", "19:00", "12:30", "", null]) assert.ok(!afterMidnight(t), String(t));
  const late = renderEmail(job("reminder", { when: "tomorrow", game: game({ date: "2026-11-12", start_time: "00:30", end_time: "01:30" }) }), LINKS)!;
  assert.equal(late.subject, "Tonight, after midnight: Football at 12:30 AM, Kings Turf");
  assert.match(late.text, /^Your game is tonight, after midnight$/m);
  assert.match(late.text, /Here are the details for tonight\./);
  assert.match(late.text, /When: Thu 12 Nov, 12:30 AM to 1:30 AM/);
  assert.doesNotMatch(`${late.subject} ${late.text}`, /tomorrow/i);
  const lateSoon = renderEmail(job("reminder", { when: "soon", game: game({ date: "2026-11-12", start_time: "00:30", end_time: "01:30" }) }), LINKS)!;
  assert.equal(lateSoon.subject, "In about 3 hours: Football at 12:30 AM, Kings Turf");
});

test("the mailto unsubscribe carries the link's token", () => {
  const key = offKey("test-account-key");
  const t = offToken(key, USER, "changes");
  assert.equal(mailtoOff(`https://www.tapturf.in/email/off?t=${t}`), `mailto:info@tapturf.in?subject=Unsubscribe%20${t}`);
  assert.equal(mailtoOff("not a link"), "mailto:info@tapturf.in?subject=Unsubscribe");
  assert.equal(mailtoOff("https://www.tapturf.in/email/off?t=a%20b%3Cx%3E"), "mailto:info@tapturf.in?subject=Unsubscribe", "only a token's characters");
});

test("every word a person typed is escaped", () => {
  const evil = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
  const e = renderEmail(
    job("join_request", { name: evil, requests: [{ name: evil }, { name: "Zoya" }], game: game({ sport: evil, host_first: evil, venue: { ...game().venue, name: evil, area: evil, city: evil } }) }),
    LINKS,
  )!;
  assert.doesNotMatch(e.html, /<script|<img|onerror=/i, "no markup gets through");
  assert.match(e.html, /&#60;script&#62;/);
  const w = renderEmail(job("welcome", { name: `"><a href="https://evil.example">` }), LINKS)!;
  assert.doesNotMatch(w.html, /href="https:\/\/evil/);
});

test("a game email without its game, or a path off the site, is not written as one", () => {
  assert.equal(renderEmail(job("reminder", { game: undefined }), LINKS), null);
  const e = renderEmail(job("request_accepted", { path: "//evil.example/x" }), LINKS)!;
  assert.match(e.text, /See the game: https:\/\/www\.tapturf\.in\/\n/, "a path that is not ours goes to the home page");
});

/* ---------------- the link that turns emails off ---------------- */

test("the turn off token: one account and one group, signed", () => {
  const key = offKey("test-account-key");
  const t = offToken(key, USER, "reminders");
  assert.match(t, /^[A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{22}$/);
  assert.ok(t.length < 50, "short enough for a link");
  assert.deepEqual(readOffToken(key, t), { userId: USER, group: "reminders" });
  for (const g of ["requests", "changes", "reminders", "all"] as const) assert.equal(readOffToken(key, offToken(key, USER, g))?.group, g);
  assert.equal(readOffToken(offKey("another-key"), t), null, "another key: no");
  const [p, s] = t.split(".");
  const flip = (x: string) => x.slice(0, -1) + (x.at(-1) === "A" ? "B" : "A");
  assert.equal(readOffToken(key, `${flip(p)}.${s}`), null, "another account or group: no");
  assert.equal(readOffToken(key, `${p}.${flip(s)}`), null, "a changed signature: no");
  for (const bad of [null, "", "x.y", t + "x", `${p}`, 42]) assert.equal(readOffToken(key, bad), null);
  assert.ok(!t.includes(USER.slice(0, 8)), "the id is not written out plainly");
  assert.throws(() => offToken(key, "not-a-uuid", "all"));
});

test("the page the link opens: asks first, noindex, every state", () => {
  const ask = offPage({ state: "ask", group: "changes", token: "abc.def" });
  assert.equal(ask.status, 200);
  assert.match(ask.html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(ask.html, /Turn off game change emails\?/);
  assert.match(ask.html, /<form method="post" action="\/email\/off\?t=abc\.def">/);
  assert.match(ask.html, /<button type="submit">Turn off<\/button>/);
  assert.match(ask.html, /href="\/dashboard\?tab=profile#emails">Manage all your emails on the Me tab/);
  assert.doesNotMatch(ask.html, /<script|<img/);
  const done = offPage({ state: "done", group: "all" });
  assert.match(done.html, /We won't send you all TapTurf emails any more\./);
  assert.equal(offPage({ state: "bad" }).status, 400);
  assert.equal(offPage({ state: "error", token: "a.b" }).status, 503);
  assert.match(offPage({ state: "ask", group: "requests", token: `"><script>` }).html, /&#34;&#62;&#60;script&#62;/, "the token is escaped");
});

/* ---------------- Resend ---------------- */

test("sends only with a key, and only on production (or a local stand-in off Vercel)", () => {
  assert.deepEqual(emailConfig({}), { ok: false, reason: "no_key" });
  assert.deepEqual(emailConfig({ RESEND_API_KEY: "  " }), { ok: false, reason: "no_key" });
  assert.deepEqual(emailConfig({ RESEND_API_KEY: "re_x", VERCEL: "1", VERCEL_ENV: "preview" }), { ok: false, reason: "not_production" });
  assert.deepEqual(emailConfig({ RESEND_API_KEY: "re_x" }), { ok: false, reason: "not_production" }, "a local build with no stand-in");
  const prod = emailConfig({ RESEND_API_KEY: "re_x", VERCEL: "1", VERCEL_ENV: "production", EMAIL_API_BASE: "http://127.0.0.1:9/resend" });
  assert.deepEqual(prod, { ok: true, apiKey: "re_x", base: "https://api.resend.com", from: "TapTurf <hello@tapturf.in>", replyTo: "info@tapturf.in" }, "production: Resend, the stand-in ignored");
  assert.equal(testApiBase({ EMAIL_API_BASE: "http://127.0.0.1:9/resend/" }), "http://127.0.0.1:9/resend");
  assert.equal(testApiBase({ EMAIL_API_BASE: "http://127.0.0.1:9/resend", VERCEL: "1" }), null, "never on Vercel");
  assert.equal(testApiBase({ EMAIL_API_BASE: "https://evil.example" }), null, "only a local address");
  assert.equal(fromOf({ EMAIL_FROM: "TapTurf Games <games@tapturf.in>" }), "TapTurf Games <games@tapturf.in>");
  assert.equal(fromOf({ EMAIL_FROM: "games@tapturf.in" }), "games@tapturf.in");
  assert.equal(fromOf({ EMAIL_FROM: "Someone <x@gmail.com>" }), "TapTurf <hello@tapturf.in>", "only our own domain");
});

test("one send: one recipient, the outbox id as the Idempotency-Key, the unsubscribe headers, a tag", async () => {
  const cfg = emailConfig({ RESEND_API_KEY: "re_test", EMAIL_API_BASE: "http://127.0.0.1:9/resend" });
  assert.ok(cfg.ok);
  if (!cfg.ok) return;
  const email = renderEmail(all[4][1], LINKS)!;
  const msg = { id: "eeeeeeee-eeee-4eee-8eee-000000000001", kind: "request_accepted" as const, to: "ravi.standin@example.com", email, offUrl: LINKS.off };
  const body = resendBody(cfg, msg);
  assert.deepEqual(body.to, ["ravi.standin@example.com"]);
  assert.equal(body.reply_to, "info@tapturf.in");
  assert.ok(!("cc" in body) && !("bcc" in body));
  assert.deepEqual(body.headers, {
    "List-Unsubscribe": `<${LINKS.off}>, <mailto:info@tapturf.in?subject=Unsubscribe%20TOKEN>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.deepEqual(body.tags, [{ name: "kind", value: "request_accepted" }]);
  const seen: { url: string; init: RequestInit }[] = [];
  const answer = (status: number, json: unknown) => async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), init: init! });
    return new Response(JSON.stringify(json), { status });
  };
  assert.deepEqual(await sendEmail(cfg, msg, answer(200, { id: "re_1" }) as typeof fetch), { result: "sent", id: "re_1" });
  const h = new Headers(seen[0].init.headers);
  assert.equal(seen[0].url, "http://127.0.0.1:9/resend/emails");
  assert.equal(h.get("authorization"), "Bearer re_test");
  assert.equal(h.get("idempotency-key"), msg.id);
  assert.deepEqual(await sendEmail(cfg, msg, answer(409, { name: "invalid_idempotent_request" }) as typeof fetch), { result: "sent", id: null }, "sent once before");
  assert.deepEqual(await sendEmail(cfg, msg, answer(409, { name: "concurrent_idempotent_requests" }) as typeof fetch), { result: "retry", error: "409 concurrent_idempotent_requests" });
  assert.deepEqual(await sendEmail(cfg, msg, answer(429, { name: "rate_limit_exceeded" }) as typeof fetch), { result: "retry", error: "429 rate_limit_exceeded" });
  assert.deepEqual(await sendEmail(cfg, msg, answer(500, {}) as typeof fetch), { result: "retry", error: "500" });
  assert.deepEqual(await sendEmail(cfg, msg, answer(401, { name: "missing_api_key" }) as typeof fetch), { result: "retry", error: "401 missing_api_key" }, "our key: later, never failed for the person");
  assert.deepEqual(await sendEmail(cfg, msg, answer(422, { name: "validation_error" }) as typeof fetch), { result: "failed", error: "422 validation_error" });
  assert.deepEqual(await sendEmail(cfg, msg, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch), { result: "retry", error: "network: TypeError" });
});

/* ---------------- Resend's webhook signature ---------------- */

test("the webhook's Svix signature", () => {
  const secret = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
  const key = svixKey(secret)!;
  assert.ok(key);
  assert.equal(svixKey("nope"), null);
  assert.equal(svixKey(""), null);
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["x@example.com"] } });
  const now = 1_800_000_000;
  const sig = svixSign(key, "msg_1", now, body);
  const h = { id: "msg_1", timestamp: String(now), signature: sig };
  assert.ok(svixVerify(key, h, body, now));
  assert.ok(svixVerify(key, { ...h, signature: `v1,bm9wZQ== ${sig}` }, body, now), "one of several signatures (a rotation)");
  assert.ok(!svixVerify(key, h, body + " ", now), "another body");
  assert.ok(!svixVerify(key, { ...h, id: "msg_2" }, body, now), "another id");
  assert.ok(!svixVerify(key, h, body, now + 301), "over 5 minutes late");
  assert.ok(!svixVerify(key, h, body, now - 301), "over 5 minutes early");
  assert.ok(!svixVerify(svixKey(`whsec_${Buffer.from("another-secret-another-secret!!").toString("base64")}`)!, h, body, now), "another secret");
  assert.ok(!svixVerify(key, { ...h, signature: null }, body, now));
  assert.ok(!svixVerify(key, { ...h, signature: sig.replace("v1,", "v2,") }, body, now));
});

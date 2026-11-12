import { test } from "node:test";
import assert from "node:assert/strict";
import { readReportToken, reportKey, reportToken, reportUrl, REPORT_TOKEN_VERSION } from "./token";
import { outreachMessage, timesText } from "./message";
import { beforeText, dayLabel, headline, REPORT_COPY, reportPage, SAID_MIN, saidHoursText, saidText, toReport, toSaid } from "./report";
import { getReport, REPORT_HEADERS, reportState } from "./server";
import { offKey } from "../email/token";
import { claimCopyProblem } from "../turfPage/claimPrompts";

// Made-up turfs and numbers only. The owner's lead report: its link's token, the WhatsApp message, the page.

const TURF = "dddddddd-dddd-4ddd-8ddd-000000000001";
const OTHER = "dddddddd-dddd-4ddd-8ddd-000000000002";
const KEY = reportKey("test-account-key");

/* ── The token ── */

test("a token names its turf, and only with the key that signed it", () => {
  const t = reportToken(KEY, TURF);
  assert.match(t, /^[0-9a-f]{66}$/);
  assert.deepEqual(readReportToken(KEY, t), { turfId: TURF });
  assert.equal(reportToken(KEY, TURF), t, "the same turf, the same link every time");
  assert.notEqual(reportToken(KEY, OTHER), t);
  assert.equal(readReportToken(reportKey("another-key"), t), null);
  assert.equal(reportToken(KEY, TURF.toUpperCase()), t, "the id's case doesn't matter");
  assert.throws(() => reportToken(KEY, "not-an-id"));
});

test("the key has its own label: an email link's key signs no report", () => {
  assert.notDeepEqual(reportKey("test-account-key"), offKey("test-account-key"));
  assert.equal(readReportToken(offKey("test-account-key"), reportToken(KEY, TURF)), null);
});

test("a tampered token is refused", () => {
  const t = reportToken(KEY, TURF);
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "0" ? "1" : "0") + s.slice(i + 1);
  for (let i = 0; i < t.length; i++) assert.equal(readReportToken(KEY, flip(t, i)), null, `character ${i} changed`);
  // Another turf's id under this turf's signature.
  const other = reportToken(KEY, OTHER);
  assert.equal(readReportToken(KEY, other.slice(0, 34) + t.slice(34)), null);
  for (const bad of [null, undefined, 7, "", "abc", t.slice(1), t + "0", t.toUpperCase(), `${t.slice(0, 33)}.${t.slice(34)}`, ` ${t}`, TURF])
    assert.equal(readReportToken(KEY, bad), null, String(bad));
});

test("a token of another version is refused, even when signed", async () => {
  const { createHmac } = await import("node:crypto");
  const payload = Buffer.concat([Buffer.from([REPORT_TOKEN_VERSION + 1]), Buffer.from(TURF.replace(/-/g, ""), "hex")]);
  const sig = createHmac("sha256", KEY).update(payload).digest().subarray(0, 16);
  assert.equal(readReportToken(KEY, payload.toString("hex") + sig.toString("hex")), null);
});

test("the link", () => {
  assert.equal(reportUrl(KEY, TURF), `https://www.tapturf.in/report/${reportToken(KEY, TURF)}`);
  assert.ok(!reportUrl(KEY, TURF).includes(TURF), "the bare id is not in the link's text as a uuid");
});

/* ── The WhatsApp message ── */

const LINK = "https://www.tapturf.in/report/abc";

test("the message: taps, pluralised", () => {
  assert.equal(
    outreachMessage({ name: "Kings Turf", taps: 12, views: 300, reportUrl: LINK }),
    "Hi, this is TapTurf (tapturf.in). In the last 30 days, players tapped Call or WhatsApp 12 times on Kings Turf's page on TapTurf.\n\nYour free report: https://www.tapturf.in/report/abc\n\nYou can claim your page for free to keep your prices, hours and photos right.",
  );
  assert.match(outreachMessage({ name: "Kings Turf", taps: 1, views: 300, reportUrl: LINK }), /tapped Call or WhatsApp 1 time on Kings Turf's page/);
  assert.match(outreachMessage({ name: "Kings Turf", taps: 1240, views: 0, reportUrl: LINK }), /1,240 times/);
  assert.equal(timesText(2), "2 times");
});

test("the message: no taps uses page views; neither says no number", () => {
  const v = outreachMessage({ name: "Kings Turf", taps: 0, views: 41, reportUrl: LINK });
  assert.match(v, /In the last 30 days, Kings Turf's page on TapTurf was opened 41 times\./);
  assert.doesNotMatch(v, /tapped/);
  assert.match(outreachMessage({ name: "Kings Turf", taps: 0, views: 1, reportUrl: LINK }), /was opened 1 time\./);
  const none = outreachMessage({ name: "Kings Turf", taps: 0, views: 0, reportUrl: LINK });
  assert.equal(none, "Hi, this is TapTurf (tapturf.in). Kings Turf has a page on TapTurf.\n\nYour free report: https://www.tapturf.in/report/abc\n\nYou can claim your page for free to keep your prices, hours and photos right.");
  assert.doesNotMatch(none, /\d+ (time|day)/);
  // Not a number: treated as none, never printed.
  assert.equal(outreachMessage({ name: "Kings Turf", taps: NaN, views: -3, reportUrl: LINK }), none);
});

test("the message: a claimed turf isn't asked to claim; the link stands alone on its line; honest words", () => {
  const c = outreachMessage({ name: "  Kings   Turf ", taps: 3, views: 9, reportUrl: LINK, claimed: true });
  assert.doesNotMatch(c, /claim/i);
  assert.match(c, /Kings Turf's page/);
  assert.match(c, /myTapturf/);
  for (const m of [c, outreachMessage({ name: "A", taps: 5, views: 5, reportUrl: LINK }), outreachMessage({ name: "A", taps: 0, views: 0, reportUrl: LINK })]) {
    assert.ok(m.split("\n").includes(`Your free report: ${LINK}`), "the link ends its own line, so no full stop joins it");
    assert.doesNotMatch(m, /called you|booking|\bbook\b|customers|leads|[—–]/i);
  }
});

/* ── The report ── */

const days = (calls: Record<number, number> = {}, wa: Record<number, number> = {}) =>
  Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 14 + i));
    return { day: d.toISOString().slice(0, 10), calls: calls[i] ?? 0, whatsapp: wa[i] ?? 0 };
  });
const RAW = {
  r: "ok",
  turf: { id: TURF, slug: "kings-turf-gachibowli", name: "Kings Turf", area: "Gachibowli", city: "hyderabad" },
  claimed: false,
  days: 30,
  since: "2026-10-14",
  today: "2026-11-12",
  now: { views: 240, calls: 9, whatsapp: 5, ask: 3 },
  prev: { views: 180, calls: 4, whatsapp: 0, ask: 1 },
  series: days({ 0: 2, 10: 3, 29: 4 }, { 10: 4, 20: 1 }),
};
const raw = (o: Record<string, unknown> = {}) => ({ ...RAW, ...o });

test("toReport takes a whole answer, and nothing less", () => {
  const r = toReport(RAW);
  assert.ok(r);
  assert.deepEqual(r.now, RAW.now);
  assert.deepEqual(r.turf, RAW.turf);
  assert.equal(r.series.length, 30);
  for (const bad of [
    null, "x", [], { r: "not_found" }, raw({ r: "unavailable" }), raw({ days: 90 }), raw({ claimed: "no" }), raw({ since: "14 Oct" }),
    raw({ turf: { ...RAW.turf, id: "nope" } }), raw({ turf: { ...RAW.turf, name: "  " } }),
    raw({ now: { ...RAW.now, calls: -1 } }), raw({ now: { ...RAW.now, views: "240" } }), raw({ prev: { views: 1 } }), raw({ now: { ...RAW.now, ask: 1.5 } }),
    raw({ series: RAW.series.slice(1) }), raw({ series: days({ 0: 1 }) }), raw({ now: { ...RAW.now, calls: 10 } }),
  ])
    assert.equal(toReport(bad), null, JSON.stringify(bad)?.slice(0, 80));
  // A slug or city that isn't one is left out, not trusted.
  const odd = toReport(raw({ turf: { ...RAW.turf, slug: "../admin", city: "Not A City!", area: null } }));
  assert.deepEqual([odd?.turf.slug, odd?.turf.city, odd?.turf.area], [null, null, null]);
});

test("the words: days, the 30 days before, the first sentence", () => {
  assert.equal(dayLabel("2026-11-02"), "2 Nov");
  assert.equal(dayLabel("2026-01-31"), "31 Jan");
  assert.equal(beforeText(0), "0 in the 30 days before");
  assert.equal(beforeText(1200), "1,200 in the 30 days before");
  assert.equal(headline({ views: 240, calls: 9, whatsapp: 5, ask: 0 }), "Players tapped Call or WhatsApp 14 times on your page in the last 30 days.");
  assert.equal(headline({ views: 5, calls: 1, whatsapp: 0, ask: 0 }), "Players tapped Call or WhatsApp 1 time on your page in the last 30 days.");
  assert.equal(headline({ views: 7, calls: 0, whatsapp: 0, ask: 2 }), "Your page was opened 7 times in the last 30 days. Nobody tapped Call or WhatsApp on it yet.");
  assert.equal(headline({ views: 0, calls: 0, whatsapp: 0, ask: 0 }), "Your turf has a page on TapTurf. Nobody opened it in the last 30 days.");
});

const visible = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/\s+/g, " ");

test("the page: the turf, the four counts with the 30 days before, the bars, the claim", () => {
  const { status, html } = reportPage({ state: "ok", report: toReport(RAW)! });
  assert.equal(status, 200);
  const text = visible(html);
  for (const w of [
    "Kings Turf on TapTurf", "Gachibowli, Hyderabad", "Last 30 days, 14 Oct to 12 Nov", "Players tapped Call or WhatsApp 14 times on your page in the last 30 days.",
    "240 Times your page was opened 180 in the 30 days before", "9 Tapped Call 4 in the 30 days before", "5 Tapped WhatsApp 0 in the 30 days before", "3 Shown in Ask TapTurf answers 1 in the 30 days before",
    "Most in a day: 7", "For bookings, players contact you directly.", "Claim your page — free",
    "Update your prices, hours and photos", "Mark your free hours so players see them", "See these numbers any time on myTapturf",
  ])
    assert.ok(text.includes(w), `says: ${w}`);
  assert.ok(html.includes(`href="/my?claim&#61;${TURF}&#38;owner&#61;1"`), "the button opens the claim flow, the yes already given");
  assert.ok(html.includes('href="/turf/kings-turf-gachibowli"'), "and links the turf's page by its slug");
  assert.equal((html.match(/class="bar"/g) ?? []).length, 30, "a bar for each day");
  assert.ok(html.includes("24 Oct: 3 Call, 4 WhatsApp"));
  assert.match(html, /aria-label="Bar chart of taps on each of the last 30 days\. Busiest day: 24 Oct, 7 taps\."/);
});

test("the page: no scripts, nothing fetched from anywhere, noindex", () => {
  for (const s of [{ state: "ok", report: toReport(RAW)! }, { state: "bad" }, { state: "error" }] as const) {
    const { html } = reportPage(s);
    assert.doesNotMatch(html, /<script|<img|<link|<iframe|@import|url\(|https?:\/\/|\son[a-z]+=/i, "no script, image, stylesheet, font or outside address");
    assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
    assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  }
});

test("the page: honest words only", () => {
  const pages = [RAW, raw({ claimed: true }), raw({ now: { views: 0, calls: 0, whatsapp: 0, ask: 0 }, series: days() })].map((r) => visible(reportPage({ state: "ok", report: toReport(r)! }).html));
  for (const text of pages) {
    assert.doesNotMatch(text, /called you|calls? (?:you )?(?:got|received)|\bleads?\b|customers|enquir|we don'?t take|doesn'?t take|guarantee|\bbest\b|hurry|limited/i);
    const rest = text.split("For bookings, players contact you directly.").join(" ");
    assert.doesNotMatch(rest, /\bbook(?:ing|ings|ed|s)?\b/i, "no booking word outside the approved line");
    assert.equal(claimCopyProblem(rest), null);
    assert.doesNotMatch(text, /\d+\s*%/, "no percentages worked out from small numbers");
  }
  assert.equal(claimCopyProblem(Object.values(REPORT_COPY).flat().filter((v) => typeof v === "string").join(" ").split("For bookings, players contact you directly.").join(" ")), null);
});

test("the page: a claimed turf is told so, with myTapturf instead of the claim", () => {
  const { html } = reportPage({ state: "ok", report: toReport(raw({ claimed: true }))! });
  const text = visible(html);
  assert.ok(text.includes("This page is already claimed"));
  assert.ok(html.includes('<a class="btn" href="/my">Open myTapturf</a>'));
  assert.doesNotMatch(html, /claim&#61;|Claim your page/);
});

test("the page: small numbers and zeros are shown as they are", () => {
  const quiet = reportPage({ state: "ok", report: toReport(raw({ now: { views: 2, calls: 0, whatsapp: 0, ask: 0 }, prev: { views: 0, calls: 0, whatsapp: 0, ask: 0 }, series: days() }))! });
  const text = visible(quiet.html);
  assert.ok(text.includes("Your page was opened 2 times in the last 30 days. Nobody tapped Call or WhatsApp on it yet."));
  assert.ok(text.includes("0 Tapped Call 0 in the 30 days before"));
  assert.ok(text.includes("No Call or WhatsApp taps in the last 30 days."));
  assert.doesNotMatch(quiet.html, /class="bar"/, "no empty chart");
  const one = reportPage({ state: "ok", report: toReport(raw({ now: { views: 2, calls: 1, whatsapp: 0, ask: 0 }, series: days({ 29: 1 }) }))! });
  assert.match(one.html, /Busiest day: 12 Nov, 1 tap\./);
});

test("the page: a turf's name can't break out of the page", () => {
  const r = toReport(raw({ turf: { ...RAW.turf, name: `<script>alert(1)</script> "Turf" & Sons`, area: "<b>x</b>" } }))!;
  const { html } = reportPage({ state: "ok", report: r });
  assert.doesNotMatch(html, /<script|<b>/);
  assert.ok(visible(html).includes(`<script>alert(1)</script> "Turf" & Sons on TapTurf`));
});

test("a link we didn't sign is a 404; a read that fails a 503", () => {
  assert.equal(reportPage({ state: "bad" }).status, 404);
  assert.equal(reportPage({ state: "error" }).status, 503);
  assert.ok(visible(reportPage({ state: "bad" }).html).includes("This link doesn't work"));
});

/* ── What players told us ── */

const SAID = { r: "ok", days: 30, since: "2026-10-14", today: "2026-11-12", answered: 6, got_slot: 4, hours: [{ hour: 20, n: 3 }, { hour: 21, n: 2 }, { hour: 6, n: 1 }] };

test("what players told us: read only when at least 3 answered, and only when it is a whole answer", () => {
  assert.equal(SAID_MIN, 3);
  assert.deepEqual(toSaid(SAID), { answered: 6, gotSlot: 4, hours: [20, 21, 6] });
  assert.deepEqual(toSaid({ ...SAID, answered: 3, got_slot: 0, hours: [] }), { answered: 3, gotSlot: 0, hours: [] });
  for (const few of [0, 1, 2]) assert.equal(toSaid({ ...SAID, answered: few, got_slot: null, hours: [] }), null, `${few} answered: nothing`);
  assert.equal(toSaid({ ...SAID, answered: 2, got_slot: 2 }), null, "below 3, whatever else it says");
  for (const bad of [null, "x", [], {}, { r: "not_found" }, { ...SAID, r: "unavailable" }, { ...SAID, days: 90 }, { ...SAID, answered: "6" }, { ...SAID, got_slot: null }, { ...SAID, got_slot: 7 }, { ...SAID, got_slot: -1 }, RAW])
    assert.equal(toSaid(bad), null, JSON.stringify(bad)?.slice(0, 50));
  assert.deepEqual(toSaid({ ...SAID, hours: [{ hour: 24, n: 1 }, { hour: 20, n: 0 }, null, { hour: 19, n: 2 }, { hour: 19, n: 1 }, { hour: 7, n: 1 }, { hour: 8, n: 1 }, { hour: 9, n: 1 }] })?.hours, [19, 7, 8], "real hours, each once, three at most");
  assert.deepEqual(toSaid({ ...SAID, hours: "x" })?.hours, []);
});

test("what players told us: the words say whose answer it is, never everyone", () => {
  assert.equal(saidText({ answered: 6, gotSlot: 4, hours: [] }), "Of the 6 players who told us how it went, 4 got a slot.");
  assert.equal(saidText({ answered: 3, gotSlot: 0, hours: [] }), "Of the 3 players who told us how it went, none got a slot.");
  assert.equal(saidText({ answered: 5, gotSlot: 5, hours: [] }), "Of the 5 players who told us how it went, all got a slot.");
  assert.equal(saidText({ answered: 1200, gotSlot: 1000, hours: [] }), "Of the 1,200 players who told us how it went, 1,000 got a slot.");
  assert.equal(saidHoursText({ answered: 6, gotSlot: 4, hours: [20, 21, 6] }), "The hours they asked for most: 8 PM, 9 PM and 6 AM.");
  assert.equal(saidHoursText({ answered: 6, gotSlot: 4, hours: [20, 0] }), "The hours they asked for most: 8 PM and 12 AM.");
  assert.equal(saidHoursText({ answered: 6, gotSlot: 4, hours: [19] }), "The hour they asked for most: 7 PM.");
  assert.equal(saidHoursText({ answered: 6, gotSlot: 4, hours: [] }), null);
  assert.match(REPORT_COPY.saidNote, /Only some answer/);
  assert.match(REPORT_COPY.saidNote, /not everyone who tapped/);
});

test("the page: a card about players' answers only from 3 answers up; the counts stay as they were", () => {
  const report = toReport(RAW)!;
  const plain = reportPage({ state: "ok", report }).html;
  for (const said of [null, undefined, toSaid({ ...SAID, answered: 2, got_slot: null, hours: [] }), { answered: 2, gotSlot: 2, hours: [20] }]) {
    const html = reportPage({ state: "ok", report, said }).html;
    assert.equal(html, plain, "below 3 answers the page is exactly the page without it");
    assert.doesNotMatch(html, /told us|got a slot|asked for most/);
  }
  const html = reportPage({ state: "ok", report, said: toSaid(SAID) }).html;
  const text = visible(html);
  assert.ok(text.includes("What players told us"));
  assert.ok(text.includes("Of the 6 players who told us how it went, 4 got a slot. The hours they asked for most: 8 PM, 9 PM and 6 AM."));
  assert.ok(text.includes(REPORT_COPY.saidNote.replace(/'/g, "&#39;")) || text.includes(REPORT_COPY.saidNote));
  assert.doesNotMatch(html, /<script/i, "still no script");
  // Everything else on the page is unchanged: taking the card out gives the plain page.
  const start = html.indexOf(`<div class="card">\n<h2>What players told us</h2>`);
  assert.ok(start > 0);
  const end = html.indexOf("</div>\n", start) + "</div>\n".length;
  assert.equal(html.slice(0, start) + html.slice(end), plain);
  assert.doesNotMatch(text.replace(REPORT_COPY.meaning, ""), /booking|booked|called you|customers/i);
});

test("the route: what players told us is shown from 3 answers; when that read is missing or fails the report still shows", async () => {
  const t = reportToken(KEY, TURF);
  const rpcWith = (said: unknown) => async (fn: string) => (fn === "owner_report" ? { data: RAW } : (said as { data: Record<string, unknown> }));
  const page = async (said: unknown) => {
    const res = await getReport(t, { accountKey: "test-account-key", rpc: rpcWith(said) });
    return [res.status, visible(await res.text()).includes("players who told us")];
  };
  assert.deepEqual(await page({ data: SAID }), [200, true]);
  assert.deepEqual(await page({ data: { ...SAID, answered: 2, got_slot: null, hours: [] } }), [200, false], "2 answers: nothing about it");
  assert.deepEqual(await page({ missing: true }), [200, false], "before 20261113_contact_outcomes.sql");
  assert.deepEqual(await page({ unavailable: true }), [200, false]);
  assert.deepEqual(await page({ data: { r: "not_found" } }), [200, false]);
  const thrown = await getReport(t, { accountKey: "test-account-key", rpc: async (fn: string) => { if (fn === "owner_report") return { data: RAW }; throw new Error("down"); } });
  assert.equal(thrown.status, 200, "a read that throws never takes the report down");
});

/* ── The route ── */

const okRpc = (data: Record<string, unknown>) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return { calls, rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data }) };
};

test("the route: a good link reads that turf's report and shows it, never cached, never indexed", async () => {
  const db = okRpc(RAW);
  const res = await getReport(reportToken(KEY, TURF), { accountKey: "test-account-key", rpc: db.rpc });
  assert.equal(res.status, 200);
  assert.deepEqual(db.calls, [{ fn: "owner_report", args: { p_turf_id: TURF } }, { fn: "owner_report_said", args: { p_turf_id: TURF } }], "the counts, and what players told us, for that turf alone");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("content-security-policy") ?? "", /^default-src 'none'; style-src 'unsafe-inline';/);
  assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
  assert.ok((await res.text()).includes("Kings Turf on TapTurf"));
  assert.doesNotMatch(REPORT_HEADERS["Content-Security-Policy"], /script-src|https?:/);
});

test("the route: a bad link is a 404 and asks the database nothing", async () => {
  const db = okRpc(RAW);
  for (const t of ["", "nope", TURF, reportToken(reportKey("another-key"), TURF), reportToken(KEY, TURF).replace(/.$/, "x")]) {
    const res = await getReport(t, { accountKey: "test-account-key", rpc: db.rpc });
    assert.equal(res.status, 404, t);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(db.calls.length, 0);
});

test("the route: a turf that is gone is a 404; anything else it can't show is a 503, never a guess", async () => {
  const t = reportToken(KEY, TURF);
  assert.equal((await reportState(t, { accountKey: "test-account-key", rpc: async () => ({ data: { r: "not_found" } }) })).state, "bad");
  assert.equal((await reportState(t, { accountKey: "test-account-key", rpc: async () => ({ unavailable: true }) })).state, "error");
  assert.equal((await reportState(t, { accountKey: "test-account-key", rpc: async () => ({ missing: true }) })).state, "error");
  assert.equal((await reportState(t, { accountKey: "test-account-key", rpc: async () => ({ data: { r: "ok" } }) })).state, "error");
  // An answer about another turf is never shown under this link.
  assert.equal((await reportState(t, { accountKey: "test-account-key", rpc: async () => ({ data: raw({ turf: { ...RAW.turf, id: OTHER } }) }) })).state, "error");
  assert.equal((await reportState(t, { accountKey: null, rpc: async () => ({ data: RAW }) })).state, "error");
  const res = await getReport(t, { accountKey: "test-account-key", rpc: async () => ({ unavailable: true }) });
  assert.deepEqual([res.status, res.headers.get("retry-after"), res.headers.get("cache-control")], [503, "60", "private, no-store"]);
});

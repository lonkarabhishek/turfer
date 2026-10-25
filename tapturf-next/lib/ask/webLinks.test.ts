import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { cleanWebText, deadPage, readWebAnswer, webDay, webLinks } from "./webLinks";

// Replies shaped like the API's: a search call, its results (a list, or an
// error object when the search failed), then the answer as text blocks,
// split where citations attach.

type Block = Anthropic.ContentBlock;
const direct = { type: "direct" as const };

const say = (text: string, cites: { url: string; title?: string | null }[] = []): Block => ({
  type: "text",
  text,
  citations: cites.length
    ? cites.map((c) => ({ type: "web_search_result_location", url: c.url, title: c.title === undefined ? "Cited page" : c.title, cited_text: "…", encrypted_index: "x" }))
    : null,
});
const search = (id: string): Block => ({ type: "server_tool_use", id, name: "web_search", input: { query: "box cricket lbw rule" }, caller: direct });
// Thinking that was cut off: the API sends the block with empty text.
const thought: Block = { type: "thinking", thinking: "", signature: "sig" };
const results = (id: string, pages: { url: string; title?: string }[]): Block => ({
  type: "web_search_tool_result",
  tool_use_id: id,
  caller: direct,
  content: pages.map((p) => ({ type: "web_search_result", url: p.url, title: p.title ?? `Page at ${p.url}`, encrypted_content: "x", page_age: null })),
});
const failed = (id: string, code: Anthropic.WebSearchToolResultErrorCode = "unavailable"): Block => ({
  type: "web_search_tool_result",
  tool_use_id: id,
  caller: direct,
  content: { type: "web_search_tool_result_error", error_code: code },
});

const PAGES = [
  { url: "https://www.cricketrules.example.in/box-cricket", title: "Box cricket rules" },
  { url: "https://indoorcricket.example.com/laws", title: "Indoor cricket laws" },
  { url: "https://news.example.org/lbw", title: "Why LBW is out in gully cricket" },
  { url: "https://www.example.net/four", title: "Fourth page" },
  { url: "https://example.co.in/five", title: "Fifth page" },
];

test("citations present: the cited pages, in order, and only the text after the search", () => {
  const got = readWebAnswer(
    [
      say("I'll look up the LBW rule for box cricket."),
      search("s1"),
      results("s1", PAGES),
      say("Most box cricket leagues "),
      say("drop LBW altogether", [{ url: PAGES[0].url, title: "Box cricket rules | Cricket Rules" }]),
      say(", because the short pitch makes it hard to judge. "),
      say("Some indoor formats keep it", [{ url: PAGES[1].url }]),
      say(", so check the house rules first."),
    ],
    "end_turn",
  );
  assert.ok(got);
  assert.equal(got.text, "Most box cricket leagues drop LBW altogether, because the short pitch makes it hard to judge. Some indoor formats keep it, so check the house rules first.");
  assert.deepEqual(got.links, [
    { label: "Box cricket rules | Cricket Rules", url: PAGES[0].url, host: "cricketrules.example.in" },
    { label: "Cited page", url: PAGES[1].url, host: "indoorcricket.example.com" },
  ]);
});

test("no citations: the first three results stand behind the answer", () => {
  const got = readWebAnswer([search("s1"), results("s1", PAGES), say("Most leagues play without LBW.")], "end_turn");
  assert.ok(got);
  assert.equal(got.text, "Most leagues play without LBW.");
  assert.deepEqual(
    got.links.map((l) => l.url),
    PAGES.slice(0, 3).map((p) => p.url),
  );
  assert.deepEqual(got.links[0], { label: "Box cricket rules", url: PAGES[0].url, host: "cricketrules.example.in" });
});

test("a failed search is no answer, even when the model writes one anyway", () => {
  assert.equal(readWebAnswer([search("s1"), failed("s1"), say("I couldn't search, but LBW is usually not given.")], "end_turn"), null);
  assert.equal(readWebAnswer([search("s1"), failed("s1", "too_many_requests"), search("s2"), failed("s2", "max_uses_exceeded"), say("Sorry.")], "end_turn"), null);
  // A search that ran but found nothing is no better.
  assert.equal(readWebAnswer([search("s1"), results("s1", []), say("Nothing found, but generally no.")], "end_turn"), null);
});

test("one failed search and one that worked: the answer stands on the one that worked", () => {
  const got = readWebAnswer([search("s1"), failed("s1"), search("s2"), results("s2", PAGES.slice(2, 3)), say("Gully and box cricket usually skip LBW.")], "end_turn");
  assert.ok(got);
  assert.deepEqual(got.links, [{ label: "Why LBW is out in gully cricket", url: PAGES[2].url, host: "news.example.org" }]);
});

test("no search at all: the model answering from memory is not a web answer", () => {
  assert.equal(readWebAnswer([say("LBW is not given in box cricket.")], "end_turn"), null);
  assert.equal(readWebAnswer([], "end_turn"), null);
});

test("no text after the search, a refusal or a paused turn: no answer", () => {
  assert.equal(readWebAnswer([say("Let me check."), search("s1"), results("s1", PAGES)], "end_turn"), null);
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), say("   ")], "end_turn"), null);
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), say("Most leagues drop it.")], "refusal"), null);
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), say("Let me search once more."), search("s2")], "pause_turn"), null);
});

test("cut off at max_tokens: only the sentences that finished", () => {
  const got = readWebAnswer([search("s1"), results("s1", PAGES), say("Most leagues drop LBW. Some indoor formats keep it, but only wh")], "max_tokens");
  assert.equal(got?.text, "Most leagues drop LBW.");
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), say("Most leagues drop LBW because the")], "max_tokens"), null);
});

test("cut off going on to more work: the text before it was a preamble, not the answer", () => {
  const preamble = say("The first results were thin. Let me search once more.");
  // A second search that never got its results.
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), preamble, search("s2")], "max_tokens"), null);
  // Thinking after the text, cut at the budget.
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), preamble, thought], "max_tokens"), null);
  // A search with no results after the last one is never the answer, however the turn ended.
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), preamble, search("s2")], "end_turn"), null);
  // Thinking first and then the answer, cut in its second sentence: the first stands.
  const got = readWebAnswer([search("s1"), results("s1", PAGES), thought, say("Most leagues drop LBW. Some indoor formats keep it, but only wh")], "max_tokens");
  assert.equal(got?.text, "Most leagues drop LBW.");
  // Thinking that finished before a whole answer is fine too.
  assert.equal(readWebAnswer([search("s1"), results("s1", PAGES), thought, say("Most leagues drop LBW.")], "end_turn")?.text, "Most leagues drop LBW.");
});

test("the text is the part after the last search, so a second search's preamble is dropped", () => {
  const got = readWebAnswer(
    [
      search("s1"),
      results("s1", PAGES.slice(0, 2)),
      say("The first results were thin, so I'll search again.", [{ url: PAGES[0].url }]),
      search("s2"),
      results("s2", PAGES.slice(2, 4)),
      say("Box cricket usually has no LBW.", [{ url: PAGES[3].url, title: null }]),
    ],
    "end_turn",
  );
  assert.ok(got);
  assert.equal(got.text, "Box cricket usually has no LBW.");
  // Only what the shown text cites; a citation title of null falls back to the result's title.
  assert.deepEqual(got.links, [{ label: "Fourth page", url: PAGES[3].url, host: "example.net" }]);
});

test("duplicate URLs: one link per page, #fragments included", () => {
  const got = readWebAnswer(
    [
      search("s1"),
      results("s1", [...PAGES.slice(0, 2), PAGES[0]]),
      say("No LBW", [{ url: PAGES[0].url }, { url: PAGES[0].url }]),
      say(" in most leagues", [{ url: `${PAGES[0].url}#rules` }, { url: PAGES[1].url }]),
      say("."),
    ],
    "end_turn",
  );
  assert.deepEqual(
    got?.links.map((l) => l.url),
    [PAGES[0].url, PAGES[1].url],
  );
  // Results repeated across searches count once too.
  assert.deepEqual(
    webLinks([search("s1"), results("s1", [PAGES[0], PAGES[0], PAGES[1]]), say("x")]).map((l) => l.url),
    [PAGES[0].url, PAGES[1].url],
  );
});

test("non-http URLs are dropped, and an answer left with no page is no answer", () => {
  const bad = [{ url: "javascript:alert(1)" }, { url: "ftp://files.example.in/rules.pdf" }, { url: "data:text/html,hi" }, { url: "not a url" }];
  const got = readWebAnswer([search("s1"), results("s1", [...bad, PAGES[1]]), say("No LBW.", bad)], "end_turn");
  assert.deepEqual(got?.links, [{ label: "Indoor cricket laws", url: PAGES[1].url, host: "indoorcricket.example.com" }]);
  assert.equal(readWebAnswer([search("s1"), results("s1", bad), say("No LBW.", bad)], "end_turn"), null);
});

test("at most four cited pages", () => {
  const got = readWebAnswer([search("s1"), results("s1", PAGES), say("A lot of pages agree.", PAGES)], "end_turn");
  assert.deepEqual(
    got?.links.map((l) => l.host),
    ["cricketrules.example.in", "indoorcricket.example.com", "news.example.org", "example.net"],
  );
});

test("the text is one plain paragraph: no markers, markdown, links, bullets or contact details", () => {
  assert.equal(cleanWebText("**Short answer:** LBW is usually off [1][2, 3]. See [the rules](https://x.example.in/r) 【4†source】."), "Short answer: LBW is usually off. See the rules.");
  assert.equal(cleanWebText("## Rules\n- No LBW\n- Six-ball overs\n1. Toss first"), "Rules No LBW Six-ball overs Toss first");
  assert.equal(cleanWebText("Most cages are rated 4.8 and cost ₹1.5 lakh a month to run. Read more at https://example.in/page."), "Most cages are rated 4.8 and cost ₹1.5 lakh a month to run.");
  assert.equal(cleanWebText("Book early. Call them on +91 98765 43210 to confirm. Or mail bookings@turf.example.in. Weekends fill up."), "Book early. Weekends fill up.");
  assert.equal(cleanWebText("Call 040-23456789 for slots. It costs ₹1,200 an hour."), "It costs ₹1,200 an hour.");
  assert.equal(cleanWebText("Slots open at 6am. Details on www.turf.example.in today."), "Slots open at 6am.");
  assert.equal(cleanWebText(""), "");
});

test("contact details in any common Indian format take their sentence with them", () => {
  const bad = [
    "+919876543210",
    "919876543210",
    "09876543210",
    "+91 98765 43210",
    "+91-98765-43210",
    "0091 98765 43210",
    "9876543210",
    "98765-43210",
    "9876 543 210",
    "98 76 54 32 10",
    "080 2345 6789",
    "(080) 2345 6789",
    "040-23456789",
    "022-2345-6789",
    "+91 80 2345 6789",
    "1800-123-4567",
    "18001234567",
    "1860 500 1515",
    "raju@okaxis",
    "9876543210@ybl",
    "bookings@turf.example.in",
    "@turfbook",
    "turfbook.in",
    "turfbook.co.in",
    "Playo.co",
  ];
  for (const b of bad) assert.equal(cleanWebText(`Slots fill fast. Reach them at ${b} to book. Weekends are busiest.`), "Slots fill fast. Weekends are busiest.", b);
});

test("numbers, prices, dates and abbreviations that aren't contact details stay", () => {
  const good = [
    "Most cages charge ₹1,200 an hour.",
    "It is rated 4.8 by 1,234 players.",
    "The 2025-26 season starts in March.",
    "A box cricket side is 6-8 players.",
    "Floodlit slots run between 6 am and 11 pm.",
    "The build cost ₹21.11 lakh.",
    "Over 1,00,000 players signed up.",
    "Prices are ₹600, 700 or 800 an hour.",
    "The final was on 25-10-2026.",
    "They chased 180/6 in 20 overs.",
    "Play 10-12 overs a side, e.g. in a 7-a-side game.",
    "It costs Rs.500 a slot, i.e. per hour.",
    "Morning a.m. slots are cheaper at St.Xavier ground.",
    "Cricket rules date from the 1800s.",
  ];
  for (const g of good) assert.equal(cleanWebText(g), g);
});

test("the day a web answer is kept for is India's, which turns at 18:30 UTC", () => {
  assert.equal(webDay(Date.parse("2026-10-24T18:29:59Z")), "2026-10-24");
  assert.equal(webDay(Date.parse("2026-10-24T18:30:00Z")), "2026-10-25");
  assert.equal(webDay(Date.parse("2026-12-31T20:00:00Z")), "2027-01-01");
  assert.match(webDay(), /^\d{4}-\d{2}-\d{2}$/);
});

test("the text is cut to 700 characters at a sentence", () => {
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is about box cricket rules.`).join(" ");
  const t = cleanWebText(long);
  assert.ok(t.length <= 700, String(t.length));
  assert.ok(t.endsWith("rules."), t.slice(-20));
  const oneLong = `${"word ".repeat(200)}end.`;
  const u = cleanWebText(oneLong);
  assert.ok(u.length <= 700 && u.endsWith("…"), u.slice(-10));
});

test("a page that is gone: 404, 410, or a title saying it wasn't found", () => {
  assert.ok(deadPage(404, ""));
  assert.ok(deadPage(410, "<html>"));
  assert.ok(deadPage(200, "<html><head><title>Page not found – KCS</title>"));
  assert.ok(deadPage(200, "<TITLE>\n  404 | Playo\n</TITLE>"));
  assert.ok(deadPage(200, "<title>This page does not exist</title>"));
  // Live pages, and blocks or errors that may pass (shown: the reader may get through).
  assert.ok(!deadPage(200, "<title>Box Cricket Rules: A Complete Guide</title>"));
  assert.ok(!deadPage(200, ""));
  assert.ok(!deadPage(403, "<title>Access denied</title>"));
  assert.ok(!deadPage(503, ""));
});

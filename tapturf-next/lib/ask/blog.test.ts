import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_CHIP, isSummaryAsk, looksLikeSearch, outlineOf } from "./blog";
import { ALL_POSTS } from "../../content/blog";

test("the chip and the ways people ask for the short version", () => {
  for (const q of [SUMMARY_CHIP, "summarise this", "Sumarize pls", "summerize karo", "give me a summary", "tl;dr", "TLDR?", "what's the gist", "key takeaways", "in short?", "what is this article about", "is blog ka saar batao", "सारांश"]) {
    assert.equal(isSummaryAsk(q), true, q);
  }
});

test("anything else on an article is a question, not a request for the short version", () => {
  for (const q of ["box cricket in Kothrud tonight", "summarize the reviews of Hindu Gymkhana", "cheapest turf near me", "what is box cricket", "summer camp turfs"]) {
    assert.equal(isSummaryAsk(q), false, q);
  }
});

test("without the model: the description and the section headings, minus FAQ and sources", () => {
  for (const p of ALL_POSTS) {
    const o = outlineOf(p);
    assert.equal(o.gist, p.description);
    assert.ok(o.points.length <= 6, p.slug);
    assert.ok(!o.points.some((h) => /^(faq|frequently asked|sources)/i.test(h)), p.slug);
  }
});

test("a search typed on an article goes to search; a question about it doesn't", () => {
  for (const q of ["box cricket near me tonight", "Football turf in Pune today", "any games this weekend?", "book a turf tomorrow", "host a game", "football turfs in Baner", "box cricket cages in Kothrud", "cheapest turf in Wakad"]) assert.equal(looksLikeSearch(q), true, q);
  for (const q of ["which of these are open tonight?", "is it good for night games?", "what does the article say about booking", "Which cages are open 24 hours?", "Summarize this blog", "which is the cheapest in the list?", "are the turfs in this article good for kids?"]) assert.equal(looksLikeSearch(q), false, q);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_CHIP, articleSearchChips, isSummaryAsk, looksLikeSearch, outlineOf } from "./blog";
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

test("the search chip under an answer fits the article", () => {
  const generic = ["Box cricket near me tonight", "Cheapest football turf near me", "Compare two turfs", "Calculate our NRR", "Host a game Saturday 7pm"];
  const city = ["Box cricket in Pune tonight", "Kothrud me sasta turf", "Football turf in Pune with floodlights", "Hotfut vs Turf Park", "Calculate our NRR"];
  const post = (slug: string, title: string) => ({ slug, title });
  assert.deepEqual(articleSearchChips(post("football-turf-shoes-guide", "Football Turf Shoes vs Regular Sports Shoes"), generic)[0], "Cheapest football turf near me");
  assert.deepEqual(articleSearchChips(post("best-box-cricket-turfs-hyderabad", "Best Box Cricket Turfs in Hyderabad"), generic)[0], "Box cricket near me tonight");
  assert.deepEqual(articleSearchChips(post("turf-prices-pune", "How Much Does It Cost to Book a Turf in Pune?"), city), ["Kothrud me sasta turf"]);
  assert.deepEqual(articleSearchChips(post("best-turfs-pune-football", "Best Football Turfs in Pune"), city), ["Football turf in Pune with floodlights", "Kothrud me sasta turf"]);
  assert.deepEqual(articleSearchChips(post("how-to-start-a-turf-business-nashik-pune-lease-guide", "How to Start a Turf Business on Leased Land"), city), [], "none for owners");
  assert.ok(!articleSearchChips(post("box-cricket-vs-full-cricket", "Box Cricket vs Full Cricket"), city).some((c) => /football|nrr|vs/i.test(c)), "no other sport, tool or comparison");
});

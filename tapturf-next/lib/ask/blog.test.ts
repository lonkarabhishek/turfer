import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_CHIP, articleSearchChips, englishChip, hinglishChip, isHinglish, isSummaryAsk, looksLikeSearch, outlineOf } from "./blog";
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
  // In the question's language: Hinglish chips for a Hinglish question, else in English.
  const prices = post("turf-prices-pune", "How Much Does It Cost to Book a Turf in Pune?");
  assert.deepEqual(articleSearchChips(prices, city, "Pune me sabse sasta turf kaunsa hai?"), ["Kothrud me sasta turf"]);
  assert.deepEqual(articleSearchChips(prices, city, "How do I split ₹1,200 between 10 players?"), ["Cheapest turf in Kothrud"]);
  assert.deepEqual(articleSearchChips(prices, city), ["Cheapest turf in Kothrud"]);
  assert.deepEqual(articleSearchChips(post("best-turfs-pune-football", "Best Football Turfs in Pune"), city, "kya yeh raat ko khule hain?"), ["Pune mein floodlights wala football turf", "Kothrud me sasta turf"]);
  assert.deepEqual(articleSearchChips(post("best-box-cricket-turfs-hyderabad", "Best Box Cricket Turfs in Hyderabad"), ["Box cricket in Hyderabad tonight"], "kya yeh turfs raat ko khule rehte hain?"), ["Hyderabad mein aaj raat box cricket"]);
  assert.deepEqual(articleSearchChips(post("how-to-start-a-turf-business-nashik-pune-lease-guide", "How to Start a Turf Business on Leased Land"), city), [], "none for owners");
  assert.ok(!articleSearchChips(post("box-cricket-vs-full-cricket", "Box Cricket vs Full Cricket"), city).some((c) => /football|nrr|vs/i.test(c)), "no other sport, tool or comparison");
});

test("Hinglish is told from English, and a Hinglish chip put in English", () => {
  for (const q of ["kya yeh turfs raat ko khule rehte hain?", "Pune me sabse sasta turf kaunsa hai", "kitne log chahiye", "नाशिक में टर्फ"]) assert.ok(isHinglish(q), q);
  for (const q of ["Summarize this blog", "Which cages are open 24 hours?", "box cricket near me tonight", "What does TF mean on the box?", "Is it ok to bring a speaker?", "Bata shoes for turf?"]) assert.ok(!isHinglish(q), q);
  assert.equal(englishChip("Kothrud me sasta turf"), "Cheapest turf in Kothrud");
  assert.equal(englishChip("Box cricket in Pune tonight"), "Box cricket in Pune tonight");
  // Both ways, for every city chip, and back again.
  for (const c of ["Box cricket in Pune tonight", "Football turf in Navi Mumbai tonight", "Cheapest turf in Nashik", "Open games in Pune this weekend", "Football turf in Pune with floodlights", "Box cricket near me tonight", "Cheapest football turf near me"]) {
    const hi = hinglishChip(c);
    assert.notEqual(hi, c, c);
    assert.ok(isHinglish(hi), hi);
    assert.equal(englishChip(hi), c, hi);
  }
  assert.equal(hinglishChip("Kothrud me sasta turf"), "Kothrud me sasta turf");
  assert.equal(hinglishChip("Calculate our NRR"), "Calculate our NRR");
});

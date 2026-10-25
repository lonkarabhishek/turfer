import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_CHIP, isSummaryAsk, outlineOf, postText } from "./blog";
import { ALL_POSTS } from "../../content/blog";

test("the chip and the ways people ask for the short version", () => {
  for (const q of [SUMMARY_CHIP, "summarise this", "Sumarize pls", "summerize karo", "give me a summary", "tl;dr", "TLDR?", "what's the gist", "key takeaways", "in short?", "what is this article about", "is blog ka saar batao", "सारांश"]) {
    assert.equal(isSummaryAsk(q), true, q);
  }
});

test("anything else on an article goes to the usual search", () => {
  for (const q of ["box cricket in Kothrud tonight", "summarize the reviews of Hindu Gymkhana", "cheapest turf near me", "what is box cricket", "summer camp turfs"]) {
    assert.equal(isSummaryAsk(q), false, q);
  }
});

test("every post: its text has the title, the body and none of the buttons, inside the limit", () => {
  assert.ok(ALL_POSTS.length > 30);
  for (const p of ALL_POSTS) {
    const t = postText(p);
    assert.ok(t.startsWith(`# ${p.title}\n`), p.slug);
    assert.ok(t.length > 1500, `${p.slug}: ${t.length}`);
    assert.ok(t.length <= 30_000, `${p.slug}: ${t.length}`);
    const first = p.blocks.find((b) => b.type === "p");
    if (first?.type === "p") assert.ok(t.includes(first.text.slice(0, 60)), `${p.slug}: body`);
  }
});

test("buttons, turf card rows, the calculator, images and sources add nothing", () => {
  const [p] = ALL_POSTS;
  const bare = postText({ ...p, blocks: [] });
  const noise = postText({
    ...p,
    blocks: [
      { type: "cta", text: "Book now", href: "/x-cta", label: "Go" },
      { type: "related-turfs", ids: ["t1"] },
      { type: "price-calc" },
      { type: "image", src: "/x.png", alt: "x-alt" },
      { type: "sources", items: [{ label: "x-src", url: "https://x.in" }] },
    ],
  });
  assert.equal(noise, bare);
  assert.ok(postText({ ...p, blocks: [{ type: "faq", items: [{ q: "Q1?", a: "A1." }] }, { type: "table", columns: ["a", "b"], rows: [["1", 2]] }] }).endsWith("Q: Q1?\nA: A1.\na | b\n1 | 2"));
});

test("without the model: the description and the section headings, minus FAQ and sources", () => {
  for (const p of ALL_POSTS) {
    const o = outlineOf(p);
    assert.equal(o.gist, p.description);
    assert.ok(o.points.length <= 6, p.slug);
    assert.ok(!o.points.some((h) => /^(faq|frequently asked|sources)/i.test(h)), p.slug);
  }
});

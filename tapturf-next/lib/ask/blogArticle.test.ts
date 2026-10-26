import { test } from "node:test";
import assert from "node:assert/strict";
import { backingSections, buildVisual, cleanFollowups, flatBars, hashText, inArticle, livelierBars, parseAmount, pickSections, pickSources, pickTurfs, readArticle, turfsNamed, type Article } from "./blogArticle";
import type { RawVisual } from "./blogReply";
import type { BlogVisual } from "./blogTypes";
import { ALL_POSTS, type Block, type Post } from "../../content/blog";
import { getBlogTurf } from "../../content/blog/data/turfs";
import { slugify } from "../utils/slugify";

const bySlug = (slug: string): Post => {
  const p = ALL_POSTS.find((x) => x.slug === slug);
  assert.ok(p, slug);
  return p;
};

function make(slug: string, blocks: Block[], extra: Partial<Post> = {}): Post {
  return {
    slug,
    title: "Test post",
    description: "A test post, priced at ₹450 in the description only.",
    hook: "A hook.",
    category: "Guides",
    city: null,
    readMinutes: 3,
    publishedAt: "2026-10-25",
    coverEmoji: "x",
    keywords: [],
    blocks,
    ...extra,
  };
}

const V = (over: Partial<RawVisual>): RawVisual => ({
  kind: "none",
  title: "",
  dataset: null,
  label_column: null,
  value_column: null,
  sort: "none",
  unit: null,
  bars: [],
  steps: [],
  ordered: null,
  columns: [],
  rows: [],
  stats: [],
  art_brief: null,
  alt: null,
  ...over,
});

const noArt = () => null;
const kind = <K extends BlogVisual["kind"]>(v: BlogVisual | null, k: K): Extract<BlogVisual, { kind: K }> => {
  assert.ok(v, `expected a ${k} visual`);
  assert.equal(v.kind, k);
  return v as Extract<BlogVisual, { kind: K }>;
};

const HYD = () => readArticle(bySlug("best-box-cricket-turfs-hyderabad"));
const NVP = () => readArticle(bySlug("nashik-vs-pune-turfs-listed-prices-2026"));
const LEASE = () => readArticle(bySlug("how-to-start-a-turf-business-nashik-pune-lease-guide"));
const byTitle = (a: Article, start: string) => {
  const d = a.datasets.find((x) => x.title.startsWith(start));
  assert.ok(d, start);
  return d;
};
// Two real venues from the related-turfs snapshot.
const FORZA = "788b7f84-df97-4eee-99e3-a1ec0281c487";
const SOLARIS = "aa4c9c4f-d806-4c2b-adcc-f10340768d4f";

/** The venue ids a post shows, in order: every turf card, then each related-turfs card not shown before. */
function venueIds(p: Post): string[] {
  const cards = new Set(p.blocks.flatMap((b) => (b.type === "turf" ? [b.id] : [])));
  const out: string[] = [];
  for (const b of p.blocks) {
    if (b.type === "turf") out.push(b.id);
    if (b.type === "related-turfs") for (const id of b.ids) if (getBlogTurf(id) && !cards.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// readArticle on every post

test("every post: sections are the opening plus the page's h2 anchors, in order", () => {
  assert.ok(ALL_POSTS.length > 30);
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    // The same anchors TableOfContents and BlockRenderer use.
    const toc = p.blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2").map((b) => ({ id: b.id ?? slugify(b.text), text: b.text.trim() }));
    assert.deepEqual(a.sections[0], { n: 0, title: "Opening", id: null }, p.slug);
    assert.deepEqual(a.sections.slice(1).map((s) => s.id), toc.map((t) => t.id), p.slug);
    assert.deepEqual(a.sections.slice(1).map((s) => s.title), toc.map((t) => t.text), p.slug);
    assert.deepEqual(a.sections.map((s) => s.n), a.sections.map((_, i) => i), p.slug);
    assert.equal(a.slug, p.slug);
    assert.equal(a.cta, p.cta ?? null);
  }
});

test("every post: each [S/D/R/V] number in the prompt is in the arrays, and each item is in the prompt", () => {
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    const seen: Record<string, Set<number>> = { S: new Set(), D: new Set(), R: new Set(), V: new Set() };
    for (const m of a.prompt.matchAll(/\[([SDRV])(\d+)\]/g)) seen[m[1]].add(Number(m[2]));
    const sorted = (s: Set<number>) => [...s].sort((x, y) => x - y);
    assert.deepEqual(sorted(seen.S), a.sections.map((s) => s.n), `${p.slug} S`);
    assert.deepEqual(sorted(seen.D), a.datasets.map((d) => d.n), `${p.slug} D`);
    assert.deepEqual(sorted(seen.R), a.sources.map((s) => s.n), `${p.slug} R`);
    assert.deepEqual(sorted(seen.V), a.turfs.map((t) => t.n), `${p.slug} V`);
    // Numbered from 1 in article order, and every dataset's rows are listed.
    assert.deepEqual(a.datasets.map((d) => d.n), a.datasets.map((_, i) => i + 1), p.slug);
    assert.deepEqual(a.sources.map((s) => s.n), a.sources.map((_, i) => i + 1), p.slug);
    assert.deepEqual(a.turfs.map((t) => t.n), a.turfs.map((_, i) => i + 1), p.slug);
    for (const d of a.datasets) {
      // A stat grid is marked as headline numbers, for tiles and not bars.
      const what = d.source === "stats" ? " (headline numbers: for stat tiles, never bars)" : "";
      assert.ok(a.prompt.includes(`\n[D${d.n}] "${d.title}"${what} columns: 0 `), `${p.slug} D${d.n} listed`);
    }
    // Each heading's marker comes in order.
    let at = -1;
    for (const s of a.sections) {
      const head = `[S${s.n}] ${s.title}`;
      const i = a.prompt.indexOf(head);
      assert.ok(i > at, `${p.slug} S${s.n} in order`);
      assert.ok([undefined, "\n"].includes(a.prompt[i + head.length]), `${p.slug} S${s.n} on its own line`);
      at = i;
    }
  }
});

test("every post: datasets have rows, rows fit their columns, and the prompt fits", () => {
  let tables = 0;
  let grids = 0;
  let venues = 0;
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    const hero = p.heroImage?.alt.trim() ? `\nHero image: ${p.heroImage.alt.replace(/\s+/g, " ").trim()}` : "";
    assert.ok(a.prompt.startsWith(`# ${p.title}\n${p.hook}${hero}\n\n[S0] Opening\n`), p.slug);
    assert.ok(a.prompt.length < 40_000, `${p.slug}: ${a.prompt.length}`);
    for (const d of a.datasets) {
      assert.ok(d.title.trim(), `${p.slug} D${d.n} title`);
      assert.ok(d.columns.length >= 2, `${p.slug} D${d.n} columns`);
      assert.ok(d.rows.length >= 1, `${p.slug} D${d.n} rows`);
      for (const r of d.rows) assert.equal(r.length, d.columns.length, `${p.slug} D${d.n} row ${r.join("|")}`);
    }
    const cards = p.blocks.filter((b) => b.type === "turf");
    assert.equal(a.datasets.filter((d) => d.source === "table").length, p.blocks.filter((b) => b.type === "table" && b.rows.length > 0).length, p.slug);
    assert.equal(a.datasets.filter((d) => d.source === "stats").length, p.blocks.filter((b) => b.type === "stat-grid").length, p.slug);
    // The turf cards are one venue dataset and the related-turfs cards (those not turf cards too) another.
    const relatedOnly = venueIds(p).length - cards.length;
    assert.equal(a.datasets.filter((d) => d.source === "turfs").length, (cards.length >= 2 ? 1 : 0) + (relatedOnly >= 2 ? 1 : 0), p.slug);
    tables += a.datasets.filter((d) => d.source === "table").length;
    grids += a.datasets.filter((d) => d.source === "stats").length;
    venues += a.datasets.filter((d) => d.source === "turfs").length;

    assert.deepEqual(a.turfs.map((t) => t.id), venueIds(p), p.slug);
    assert.deepEqual(a.questions, p.blocks.flatMap((b) => (b.type === "faq" ? b.items.map((i) => i.q.trim()) : [])), p.slug);
    for (const s of a.sources) {
      assert.match(s.url, /^https?:\/\//, p.slug);
      assert.ok(s.host && !s.host.startsWith("www."), `${p.slug} ${s.host}`);
      assert.ok(s.label, p.slug);
    }
    // Empty trailing parts are left out.
    assert.equal(a.prompt.includes("\n\nDATASETS ("), a.datasets.length > 0, p.slug);
    assert.equal(a.prompt.includes("\n\nSOURCES THE ARTICLE CITES\n"), a.sources.length > 0, p.slug);
    assert.equal(a.prompt.includes("\n\nVENUES IN THE ARTICLE\n"), a.turfs.length > 0, p.slug);
    // Buttons say nothing.
    const lines = new Set(a.prompt.split("\n"));
    for (const b of p.blocks) if (b.type === "cta") assert.ok(!lines.has(b.text.trim()) && !lines.has(b.label.trim()), `${p.slug} ${b.label}`);
  }
  // What the posts held in October 2026.
  assert.ok(tables >= 25 && grids >= 20 && venues >= 14, `${tables} ${grids} ${venues}`);
});

test("every post: each related-turfs card the page shows is a venue [V] in the prompt, written in full once", () => {
  let shown = 0;
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    const cards = new Set(p.blocks.flatMap((b) => (b.type === "turf" ? [b.id] : [])));
    for (const b of p.blocks) {
      if (b.type !== "related-turfs") continue;
      for (const id of b.ids) {
        const t = getBlogTurf(id);
        if (!t) continue;
        shown++;
        const v = a.turfs.find((x) => x.id === id);
        assert.ok(v, `${p.slug} ${id}`);
        assert.ok(a.prompt.includes(`\n[V${v.n}] `), `${p.slug} V${v.n}`);
        if (cards.has(id)) continue;
        // Name, area, rating and reviews, as the card shows them.
        assert.deepEqual([v.name, v.area, v.rating, v.reviews], [t.name, t.area, t.rating, t.reviews], p.slug);
        const full = `[V${v.n}] ${t.name}, ${t.area}${t.rating != null ? `, rated ${t.rating.toFixed(1)}` : ""}`;
        assert.equal(a.prompt.split("\n").filter((l) => l.startsWith(full)).length, 1, `${p.slug} ${full}`);
        if (t.rating != null) assert.ok(inArticle(a, t.rating), `${p.slug} ${t.name} rating`);
        if (t.reviews != null) assert.ok(inArticle(a, t.reviews), `${p.slug} ${t.name} reviews`);
      }
      // A titled block keeps its title over its cards.
      if (b.title && b.ids.some((id) => getBlogTurf(id))) assert.ok(a.prompt.includes(`\n### ${b.title.trim()}\n`), `${p.slug} ${b.title}`);
    }
  }
  assert.ok(shown >= 30, String(shown));
  // Pune's 12 football grounds are all listed cards: they are now its venues, by area.
  const fp = readArticle(bySlug("best-football-turfs-pune-2026"));
  assert.ok(fp.turfs.length >= 12);
  const kothrud = fp.prompt.slice(fp.prompt.indexOf("Kothrud & Karve Nagar"));
  assert.match(kothrud, /\n\[V1\] Solaris Sports World, Kothrud, rated 4\.3 from 1,898 reviews\n/);
  const list = byTitle(fp, "Venues in the article");
  assert.deepEqual(list.columns, ["Venue", "Area", "Rating", "Reviews", "Listed under"]);
  assert.deepEqual(list.rows[0], ["Solaris Sports World", "Kothrud", "4.3", "1,898", "Kothrud & Karve Nagar"]);
  // Nagpur's three CC Turfs are turf cards too: the block names them by their card's number, adding none.
  const ng = readArticle(bySlug("best-box-cricket-turfs-nagpur"));
  assert.equal(ng.turfs.length, 12);
  const cc = ng.prompt.slice(ng.prompt.indexOf("### The three CC Turfs")).split("\n").slice(1, 4);
  for (const line of cc) assert.match(line, /^\[V\d+\] CC Turf [^,]+, [^:]+$/);
});

test("every post: a price calculator is a line with its preset and the per-player cost the page shows", () => {
  let calcs = 0;
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    for (const b of p.blocks) {
      if (b.type !== "price-calc") continue;
      calcs++;
      const price = b.defaults?.pricePerHour ?? 800;
      const players = b.defaults?.players ?? 10;
      const hours = b.defaults?.hours ?? 1;
      const each = Math.round((price * hours) / players);
      const line = a.prompt.split("\n").find((l) => l.startsWith("Price calculator: "));
      assert.ok(line, p.slug);
      if (b.caption) assert.ok(line.includes(b.caption.trim().replace(/\.$/, "")), p.slug);
      assert.ok(line.endsWith(`Set to ₹${price.toLocaleString("en-IN")} an hour for ${players} players and ${hours} hour${hours === 1 ? "" : "s"}: ₹${each.toLocaleString("en-IN")} each.`), line);
      assert.ok(inArticle(a, each), p.slug);
    }
  }
  assert.ok(calcs >= 5, String(calcs));
});

test("every post: each amount in its datasets is a number the article states", () => {
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    for (const d of a.datasets) {
      for (const r of d.rows) {
        for (const cell of r) {
          const n = parseAmount(cell);
          if (n !== null) assert.ok(inArticle(a, n), `${p.slug} D${d.n}: ${cell}`);
        }
      }
    }
    for (const t of a.turfs) {
      if (t.rating !== null) assert.ok(inArticle(a, t.rating), `${p.slug} ${t.name} rating`);
      if (t.reviews !== null) assert.ok(inArticle(a, t.reviews), `${p.slug} ${t.name} reviews`);
    }
  }
});

test("readArticle is memoised per post and edit, and deterministic", () => {
  const p = bySlug("turf-prices-pune");
  const a = readArticle(p);
  assert.equal(readArticle(p), a);
  // A copy of the post (other objects, same content) reads the same.
  const copy: Post = JSON.parse(JSON.stringify(p));
  assert.deepEqual(readArticle(copy), a);
  // Same slug and date with other blocks is read afresh, not served stale.
  const edited = readArticle({ ...p, blocks: [{ type: "p", text: "Only this." }] });
  assert.notEqual(edited, a);
  assert.ok(edited.prompt.includes("Only this."));
  assert.equal(readArticle(p).prompt, a.prompt);
});

test("hash: FNV-1a 64, the same for the same article, different when anything an answer uses changes", () => {
  // The published FNV-1a 64-bit test values.
  assert.equal(hashText(""), "cbf29ce484222325");
  assert.equal(hashText("a"), "af63dc4c8601ec8c");
  assert.equal(hashText("foobar"), "85944171f73967e8");
  assert.equal(hashText("₹"), hashText("₹"));
  assert.notEqual(hashText("₹1,000"), hashText("₹1,001"));

  const hashes = ALL_POSTS.map((p) => readArticle(p).hash);
  for (const h of hashes) assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(new Set(hashes).size, ALL_POSTS.length);

  const p = bySlug("turf-prices-pune");
  const a = readArticle(p);
  const copy = (): Post => JSON.parse(JSON.stringify(p));
  assert.equal(readArticle(copy()).hash, a.hash);
  const differs = (edit: (q: Post) => void, why: string) => {
    const q = copy();
    edit(q);
    assert.notEqual(readArticle(q).hash, a.hash, why);
  };
  differs((q) => {
    const b = q.blocks.find((x) => x.type === "p");
    if (b?.type === "p") b.text += " Now ₹50 more.";
  }, "a paragraph");
  differs((q) => {
    const b = q.blocks.find((x) => x.type === "stat-grid");
    if (b?.type === "stat-grid") b.items[0].value = "₹250";
  }, "a stat tile");
  differs((q) => {
    const b = q.blocks.find((x) => x.type === "related-turfs");
    if (b?.type === "related-turfs") b.ids.reverse();
  }, "the venue cards' order");
  differs((q) => void (q.description += " Updated."), "the description (the numbers check reads it)");
  differs((q) => void (q.cta = { href: "/turfs?city=pune", label: "Find a turf" }), "the button");
  differs((q) => {
    const b = q.blocks.find((x) => x.type === "h2");
    if (b?.type === "h2") b.id = "another-anchor";
  }, "a heading's anchor");
  // Keywords and the cover emoji are not something an answer is built from.
  const same = copy();
  same.keywords = ["something else"];
  same.coverEmoji = "y";
  assert.equal(readArticle(same).hash, a.hash);
});

// ---------------------------------------------------------------------------
// The prompt, block by block

test("the prompt: every block type in its place, buttons left out", () => {
  const a = readArticle(
    make("blocks-test", [
      { type: "p", text: "Opening   text\nwith ₹1,100 in it." },
      { type: "table", columns: ["A", "B"], rows: [["x", "1"]] },
      { type: "h2", text: "First part" },
      { type: "h3", text: "A smaller head" },
      { type: "table", columns: ["Name", "Price", "Note"], rows: [["Turf | One", "₹900"], ["Turf Two", 1200, "late"]] },
      { type: "ul", items: ["one", "two"] },
      { type: "ol", items: ["first", "second"] },
      { type: "quote", text: "Great turf.", by: "A player" },
      { type: "quote", text: "No name." },
      { type: "callout", title: "Heads up", text: "Call first." },
      { type: "cta", text: "Book now", href: "/x-cta", label: "Go" },
      { type: "related-turfs", title: "Related", ids: ["t9"] },
      { type: "price-calc", caption: "Calculator caption", defaults: { pricePerHour: 777 } },
      { type: "image", src: "/x.png", alt: "Bar chart: 5 of 9", caption: "Saved card" },
      { type: "h2", text: "Second part", id: "second" },
      { type: "turf", rank: 1, id: "t1", name: "Alpha Arena", area: "Kothrud", rating: "4.8", reviews: 2239, note: "Good lights." },
      { type: "turf", id: "t2", name: "Beta | Turf", area: "Baner" },
      // Cards the page resolves from the snapshot; an id it can't find shows nothing, a repeat is named by number.
      { type: "related-turfs", title: "Also near", ids: [FORZA, "t9", SOLARIS, FORZA] },
      { type: "stat-grid", items: [{ value: "83", label: "Turfs", hint: "Oct 2026" }, { value: "₹800", label: "Typical" }] },
      { type: "faq", items: [{ q: "Is it open?", a: "Yes, 24 hours." }] },
      { type: "h2", text: "Sources" },
      {
        type: "sources",
        note: "Checked on 1 Oct.",
        items: [
          { label: "Paper", url: "https://www.example.com/a" },
          { label: "Bad", url: "javascript:alert(1)" },
          { label: "", url: "http://news.example.in/b" },
          { label: "Broken", url: "not a url" },
        ],
      },
    ]),
  );
  assert.deepEqual(a.sections, [
    { n: 0, title: "Opening", id: null },
    { n: 1, title: "First part", id: "first-part" },
    { n: 2, title: "Second part", id: "second" },
    { n: 3, title: "Sources", id: "sources" },
  ]);
  assert.equal(
    a.prompt,
    [
      "# Test post",
      "A hook.",
      "",
      "[S0] Opening",
      "Opening text with ₹1,100 in it.",
      "[D1] table: Table 1 (rows under DATASETS)",
      "",
      "[S1] First part",
      "### A smaller head",
      "[D2] table: A smaller head (rows under DATASETS)",
      "- one",
      "- two",
      "1. first",
      "2. second",
      '"Great turf." (A player)',
      '"No name."',
      "Heads up: Call first.",
      "Price calculator: Calculator caption. Set to ₹777 an hour for 10 players and 1 hour: ₹78 each.",
      "Image: Bar chart: 5 of 9 (Saved card)",
      "",
      "[S2] Second part",
      "[V1] #1 Alpha Arena, Kothrud, rated 4.8 from 2,239 reviews: Good lights.",
      "[V2] Beta | Turf, Baner",
      "### Also near",
      "[V3] Forza Football, Anand Nagar, rated 4.5 from 1,394 reviews",
      "[V4] Solaris Sports World, Kothrud, rated 4.3 from 1,898 reviews",
      "[V3] Forza Football, Anand Nagar",
      "[D5] Turfs: 83 (Oct 2026); Typical: ₹800",
      "Q: Is it open?",
      "A: Yes, 24 hours.",
      "",
      "[S3] Sources",
      "[R1] Paper (example.com)",
      "[R2] news.example.in (news.example.in)",
      "Checked on 1 Oct.",
      "",
      "DATASETS (rows of the article's tables, stat tiles and venue cards; columns numbered from 0)",
      '[D1] "Table 1" columns: 0 A | 1 B',
      "x | 1",
      "",
      '[D2] "A smaller head" columns: 0 Name | 1 Price | 2 Note',
      "Turf / One | ₹900 | -",
      "Turf Two | 1200 | late",
      "",
      '[D3] "Venues in the article" columns: 0 Venue | 1 Area | 2 Rating | 3 Reviews',
      "Alpha Arena | Kothrud | 4.8 | 2,239",
      "Beta / Turf | Baner | - | -",
      "",
      '[D4] "More venues in the article" columns: 0 Venue | 1 Area | 2 Rating | 3 Reviews | 4 Listed under',
      "Forza Football | Anand Nagar | 4.5 | 1,394 | Also near",
      "Solaris Sports World | Kothrud | 4.3 | 1,898 | Also near",
      "",
      '[D5] "Key numbers" (headline numbers: for stat tiles, never bars) columns: 0 Stat | 1 Value',
      "Turfs | 83",
      "Typical | ₹800",
      "",
      "SOURCES THE ARTICLE CITES",
      "[R1] Paper (example.com)",
      "[R2] news.example.in (news.example.in)",
      "",
      "VENUES IN THE ARTICLE",
      "[V1] Alpha Arena, Kothrud",
      "[V2] Beta | Turf, Baner",
      "[V3] Forza Football, Anand Nagar",
      "[V4] Solaris Sports World, Kothrud",
    ].join("\n"),
  );
  // The datasets keep the article's own text; only the prompt swaps "|" and fills blanks.
  assert.deepEqual(a.datasets[1].rows, [["Turf | One", "₹900", ""], ["Turf Two", "1200", "late"]]);
  assert.deepEqual(a.datasets[2].rows[1], ["Beta | Turf", "Baner", "", ""]);
  assert.deepEqual(a.sources, [
    { n: 1, label: "Paper", url: "https://www.example.com/a", host: "example.com" },
    { n: 2, label: "news.example.in", url: "http://news.example.in/b", host: "news.example.in" },
  ]);
  assert.deepEqual(a.turfs, [
    { n: 1, id: "t1", name: "Alpha Arena", area: "Kothrud", rating: 4.8, reviews: 2239 },
    { n: 2, id: "t2", name: "Beta | Turf", area: "Baner", rating: null, reviews: null },
    { n: 3, id: FORZA, name: "Forza Football", area: "Anand Nagar", rating: 4.5, reviews: 1394 },
    { n: 4, id: SOLARIS, name: "Solaris Sports World", area: "Kothrud", rating: 4.3, reviews: 1898 },
  ]);
  assert.deepEqual(a.questions, ["Is it open?"]);
  // Buttons, and a related-turfs block the page can't resolve (it shows nothing), are left out.
  for (const gone of ["Book now", "/x-cta", "Related", "t9"]) assert.ok(!a.prompt.includes(gone), gone);
  for (const n of [777, 78, 4.5, 1394, 1898]) assert.ok(inArticle(a, n), String(n));
});

test("the prompt: a related-turfs card that is also a turf card keeps the card's number, wherever the card is", () => {
  const before = readArticle(
    make("related-first-test", [
      { type: "related-turfs", ids: [FORZA, SOLARIS] },
      { type: "turf", id: FORZA, name: "Forza Football", area: "Anand Nagar, Pune", rating: 4.5 },
    ]),
  );
  // In article order: Forza is shown first by the related block, but its number is the card's.
  assert.deepEqual(before.turfs.map((t) => [t.n, t.id]), [[1, SOLARIS], [2, FORZA]]);
  assert.ok(before.prompt.includes("\n[S0] Opening\n[V2] Forza Football, Anand Nagar, Pune\n[V1] Solaris Sports World, Kothrud, rated 4.3 from 1,898 reviews\n[V2] Forza Football, Anand Nagar, Pune, rated 4.5\n"));
  // One related venue that isn't a card is no dataset.
  assert.equal(before.datasets.length, 0);
});

test("the prompt: a caption names a table first, one turf card is a venue but no dataset, rows longer than the header keep their cells", () => {
  const a = readArticle(
    make("caption-test", [
      { type: "h2", text: "Rates" },
      { type: "table", caption: "Listed rates", columns: ["Turf", "Rate"], rows: [["A", "₹1", "extra"]] },
      { type: "table", columns: ["Empty"], rows: [] },
      { type: "turf", id: "only", name: "Solo", area: "Wakad", rating: 4.2 },
      { type: "stat-grid", items: [] },
    ]),
  );
  assert.equal(a.datasets.length, 1);
  assert.equal(a.datasets[0].title, "Listed rates");
  assert.deepEqual(a.datasets[0].columns, ["Turf", "Rate", ""]);
  assert.deepEqual(a.datasets[0].rows, [["A", "₹1", "extra"]]);
  assert.ok(a.prompt.includes('[D1] "Listed rates" columns: 0 Turf | 1 Rate | 2 (no name)\nA | ₹1 | extra'));
  assert.deepEqual(a.turfs.map((t) => t.name), ["Solo"]);
  assert.ok(a.prompt.includes("\n[V1] Solo, Wakad, rated 4.2\n"));
  // With no headings at all, the whole article is the opening.
  const bare = readArticle(make("bare-test", [{ type: "p", text: "Just text." }]));
  assert.deepEqual(bare.sections, [{ n: 0, title: "Opening", id: null }]);
  assert.equal(bare.prompt, "# Test post\nA hook.\n\n[S0] Opening\nJust text.");
});

// ---------------------------------------------------------------------------
// parseAmount

test("parseAmount: one amount, or null", () => {
  const cases: [string | number, number | null][] = [
    ["₹1,500", 1500],
    ["1500", 1500],
    ["₹ 1,500", 1500],
    ["Rs. 1,500", 1500],
    ["Rs 900", 900],
    ["INR 2,000", 2000],
    ["₹900/hr", 900],
    ["₹900 / hr", 900],
    ["₹1,000 per hour", 1000],
    ["₹900 an hour", 900],
    ["₹200 a head", 200],
    ["₹1500/-", 1500],
    ["4.18", 4.18],
    ["4.70", 4.7],
    ["5.0", 5],
    ["83", 83],
    ["0", 0],
    ["₹0", 0],
    ["₹1,00,000", 100000],
    ["₹12,34,567", 1234567],
    ["1,064", 1064],
    ["12,345,678", 12345678],
    ["31%", 31],
    ["24 hrs", 24],
    ["60 min", 60],
    ["60m", 60],
    ["1 tap", 1],
    ["0 ads", 0],
    ["₹7.5 lakh", 750000],
    ["₹7.5L", 750000],
    ["₹2 crore", 20000000],
    ["5k", 5000],
    ["  ₹800  ", 800],
    [1500, 1500],
    [4.39, 4.39],
    [0, 0],
    [NaN, null],
    [Infinity, null],
    // Ranges and pairs.
    ["₹600–₹800", null],
    ["₹600-₹800", null],
    ["600-800", null],
    ["600 - 800", null],
    ["₹80–150", null],
    ["60–90 min", null],
    ["6am to 11pm", null],
    ["₹7.5 to 10.5 lakh", null],
    ["4.8 (585)", null],
    ["22 of 63", null],
    ["129 of 1,235", null],
    ["2 or 4", null],
    ["44'×20'", null],
    ["5 v 5 + subs", null],
    ["24/7", null],
    // Words and blanks.
    ["Call", null],
    ["—", null],
    ["–", null],
    ["-", null],
    ["", null],
    ["   ", null],
    ["Yes", null],
    ["No", null],
    ["Free", null],
    ["Loss", null],
    ["Not listed", null],
    ["✓ Yes — the default", null],
    // Qualified amounts and times are not the amount.
    ["Over 120", null],
    ["About ₹25 lakh", null],
    ["100+", null],
    ["125+", null],
    ["~60", null],
    ["≤5 km", null],
    ["11 pm", null],
    ["6am", null],
    ["₹500 onwards", null],
    ["5-a", null],
    // Labels with a number in them.
    ["Phase 2", null],
    ["Turf 10 Wakad", null],
    ["Pune, ₹1,125", null],
    ["Champions Field 2.0", null],
    ["1,2,3", null],
    ["-5", null],
  ];
  for (const [cell, want] of cases) assert.equal(parseAmount(cell), want, JSON.stringify(cell));
});

test("parseAmount: every real price cell parses, every 'Call' and range does not", () => {
  const a = HYD();
  const rates = a.datasets.find((d) => d.source === "table" && d.columns.includes("Evening"));
  assert.ok(rates);
  const evening = rates.rows.map((r) => parseAmount(r[2]));
  assert.deepEqual(evening, [1000, 600, null, 1000, 1000, 2400, 1100, 1000, 1100, 800]);
  assert.deepEqual(rates.rows.map((r) => parseAmount(r[4])), rates.rows.map(() => null));
  const india = readArticle(bySlug("india-turf-price-map-2026")).datasets.find((d) => d.source === "table");
  assert.ok(india);
  for (const r of india.rows) for (const c of r.slice(1)) assert.notEqual(parseAmount(c), null, c);
});

// ---------------------------------------------------------------------------
// inArticle

test("inArticle: numbers the article states, however they're written", () => {
  const a = HYD();
  for (const n of [1100, 1000, 2400, 3500, 800, 83, 30, 54, 255, 585, 4.39, 4.18, 4.7, 4.67, 5, 4.9, 2026, 11, 12, 100]) assert.ok(inArticle(a, n), String(n));
  for (const n of [1234, 999, 4.45, 2500, 0.5, -800, NaN, Infinity]) assert.equal(inArticle(a, n), false, String(n));
  // The turf ids ("31e07fe7-89ca-4111-…") are not article text.
  assert.equal(inArticle(a, 4111), false);
});

test("inArticle: description, number words, lakhs and Indian grouping count; our own numbering doesn't", () => {
  const a = readArticle(
    make("numbers-test", [
      { type: "p", text: "Twelve players, a build of ₹7.5L and rent of ₹1,00,000 a month." },
      { type: "h2", text: "One" },
      { type: "h2", text: "Two" },
      { type: "h2", text: "Three" },
      { type: "h2", text: "Four" },
      { type: "h2", text: "Five" },
      { type: "h2", text: "Six" },
      { type: "h2", text: "Seven" },
      { type: "table", columns: ["X", "Y"], rows: [["a", "₹50 lakh"]] },
    ]),
  );
  assert.ok(a.prompt.includes("[S7] Seven"));
  for (const n of [12, 7.5, 750000, 100000, 1, 2, 7, 50, 5000000, 450]) assert.ok(inArticle(a, n), String(n));
  // [S8] doesn't exist and 8 is never written; [D1] is ours, not the article's.
  for (const n of [8, 9, 100001, 75000]) assert.equal(inArticle(a, n), false, String(n));
  const plain = readArticle(make("plain-numbers-test", [{ type: "h2", text: "A" }, { type: "h2", text: "B" }, { type: "h2", text: "C" }, { type: "p", text: "₹500" }]));
  assert.ok(plain.prompt.includes("[S3] C"));
  assert.equal(inArticle(plain, 3), false);
  assert.ok(inArticle(plain, 500));
});

test("inArticle: an Article built by hand falls back to its prompt", () => {
  const a: Article = { slug: "x", title: "x", cta: null, sections: [], datasets: [], sources: [], turfs: [], questions: [], prompt: "[S0] Opening\nRates from ₹1,250.", hash: "0" };
  assert.ok(inArticle(a, 1250));
  assert.equal(inArticle(a, 1300), false);
});

test("inArticle: a range shares its rupees, lakh and percent ('₹50 to 60 lakh' states ₹50 lakh)", () => {
  const a = readArticle(
    make("range-test", [
      { type: "p", text: "A build costs ₹50 to 60 lakh, a court Rs 7.5–10.5 lakh, and lights ₹3 to 8 lakh. Plan on 30 to 50% booked." },
      { type: "p", text: "Rent runs from ₹25,000 to ₹1 lakh a month." },
    ]),
  );
  for (const n of [5e6, 6e6, 7.5e5, 1.05e6, 3e5, 8e5, 50, 60, 30, 25000, 1e5]) assert.ok(inArticle(a, n), String(n));
  // A range start bigger than its end isn't scaled: ₹25,000 is not 25,000 lakh.
  assert.equal(inArticle(a, 25000 * 1e5), false);
  const lease = LEASE();
  for (const n of [5e6, 1.4e6, 3e5, 7.5e5, 1.2e6, 1.5e5]) assert.ok(inArticle(lease, n), String(n));
});

// ---------------------------------------------------------------------------
// buildVisual

test("buildVisual: none, and unknown kinds, are no visual", () => {
  const a = HYD();
  assert.equal(buildVisual(a, V({ kind: "none", title: "x", bars: [{ label: "a", value: 800 }, { label: "b", value: 1000 }] }), noArt), null);
});

test("bars from a dataset: the article's own cells, 'Call' left out and said so, sorted", () => {
  const a = HYD();
  const rates = a.datasets.find((d) => d.source === "table" && d.columns.includes("Evening"));
  assert.ok(rates);
  const v = kind(buildVisual(a, V({ kind: "bars", title: "Evening rates", dataset: rates.n, label_column: 0, value_column: 2, sort: "desc", unit: "₹ per hour" }), noArt), "bars");
  assert.equal(v.title, "Evening rates");
  assert.equal(v.unit, "₹ per hour");
  // The note names the table, the column the numbers are from, and the row it couldn't draw.
  assert.ok(v.note?.startsWith("From the article: Listed per-hour rates on 8 October 2026"), v.note ?? "");
  assert.ok(v.note?.endsWith(", Evening column. Left out: AJ Cricket Club (Call)."), v.note ?? "");
  assert.ok((v.note ?? "").length <= 160);
  assert.equal(v.bars.length, 9);
  assert.deepEqual(v.bars[0], { label: "GSS Lords Big Box Cricket", value: 2400, display: "₹2,400" });
  assert.deepEqual(v.bars.at(-1), { label: "NexGen Box Cricket & Cafe", value: 600, display: "₹600" });
  assert.ok(!v.bars.some((b) => b.label === "AJ Cricket Club"));
  for (let i = 1; i < v.bars.length; i++) assert.ok(v.bars[i - 1].value >= v.bars[i].value);

  const asc = kind(buildVisual(a, V({ kind: "bars", dataset: rates.n, label_column: 0, value_column: 1, sort: "asc" }), noArt), "bars");
  for (let i = 1; i < asc.bars.length; i++) assert.ok(asc.bars[i - 1].value <= asc.bars[i].value);
  // No title from the model: the dataset's, cut to fit, and the note doesn't name it again.
  assert.ok(asc.title.length <= 70 && asc.title.startsWith("Listed per-hour rates"));
  assert.equal(asc.unit, null);
  assert.equal(asc.note, "From the article's table, Day column. Left out: AJ Cricket Club (Call).");

  // sort none keeps the article's order.
  const none = kind(buildVisual(a, V({ kind: "bars", dataset: rates.n, label_column: 0, value_column: 1, sort: "none" }), noArt), "bars");
  assert.deepEqual(none.bars.map((b) => b.label), rates.rows.filter((r) => parseAmount(r[1]) !== null).map((r) => r[0]));
});

test("bars from a dataset: ratings from the turf cards, area table; a 14-city table whole", () => {
  const a = HYD();
  const venues = a.datasets.find((d) => d.source === "turfs");
  assert.ok(venues);
  const r = kind(buildVisual(a, V({ kind: "bars", title: "Ratings", dataset: venues.n, label_column: 0, value_column: 2, sort: "desc", unit: "rating" }), noArt), "bars");
  assert.equal(r.bars.length, 10);
  assert.deepEqual(r.bars[0], { label: "ASR Sports Arena", value: 5, display: "5.0" });
  assert.equal(r.note, "From the article: Venues in the article, Rating column.");
  const reviews = kind(buildVisual(a, V({ kind: "bars", dataset: venues.n, label_column: 0, value_column: 3, sort: "desc" }), noArt), "bars");
  assert.deepEqual(reviews.bars[0], { label: "AJ Cricket Club (Box Cricket)", value: 585, display: "585" });

  const areas = a.datasets.find((d) => d.columns.includes("Avg rating"));
  assert.ok(areas);
  const avg = kind(buildVisual(a, V({ kind: "bars", dataset: areas.n, label_column: 0, value_column: 2, sort: "desc" }), noArt), "bars");
  assert.deepEqual(avg.bars.slice(0, 2), [
    { label: "Kukatpally", value: 4.7, display: "4.70" },
    { label: "Kondapur", value: 4.67, display: "4.67" },
  ]);

  // 14 cities, all of them: a cut would drop the cheapest or the costliest (Delhi, the article's headline).
  const india = readArticle(bySlug("india-turf-price-map-2026"));
  const cities = india.datasets.find((d) => d.source === "table");
  assert.ok(cities && cities.rows.length === 14);
  const chart = (sort: RawVisual["sort"]) => kind(buildVisual(india, V({ kind: "bars", title: "Median by city", dataset: cities.n, label_column: 0, value_column: 2, sort, unit: "₹ per hour" }), noArt), "bars");
  const top = chart("desc");
  assert.equal(top.bars.length, 14);
  assert.deepEqual(top.bars[0], { label: "Delhi", value: 1500, display: "₹1,500" });
  assert.deepEqual(top.bars[13], { label: "Nashik", value: 600, display: "₹600" });
  assert.ok(top.note?.endsWith(", Median column."), top.note ?? "");
  const low = chart("asc");
  assert.deepEqual(low.bars[0], { label: "Nashik", value: 600, display: "₹600" });
  assert.deepEqual(low.bars[13], { label: "Delhi", value: 1500, display: "₹1,500" });
  assert.ok(!/of 14/.test(chart("none").note ?? ""));
});

test("bars from every real dataset, column pair and unit: in bounds or none, one kind on the axis, never a number the cell doesn't say", () => {
  let charts = 0;
  let tiles = 0;
  for (const p of ALL_POSTS) {
    const a = readArticle(p);
    for (const d of a.datasets) {
      for (let lc = 0; lc < d.columns.length; lc++) {
        for (let vc = 0; vc < d.columns.length; vc++) {
          for (const sort of ["desc", "asc", "none"] as const) {
            for (const unit of [null, "₹ per hour", "%", "turfs"]) {
              const v = buildVisual(a, V({ kind: "bars", dataset: d.n, label_column: lc, value_column: vc, sort, unit }), noArt);
              if (!v) continue;
              const at = `${p.slug} D${d.n} ${lc}/${vc} ${unit}`;
              // A stat grid is shown as its own tiles, never as bars.
              if (d.source === "stats") {
                const { stats } = kind(v, "stats");
                tiles++;
                for (const s of stats) assert.ok(d.rows.some((r) => r[0] === s.label && r[1] === s.value), at);
                continue;
              }
              const { bars, title, note } = kind(v, "bars");
              charts++;
              assert.ok(bars.length >= 2 && bars.length <= 16, at);
              assert.ok(title.length <= 70 && (note ?? "").length <= 160, at);
              const header = d.columns[vc] ? `${d.columns[vc].slice(0, 20)}` : `column ${vc + 1}`;
              assert.ok(note?.includes(header), `${at}: ${note}`);
              assert.equal(new Set(bars.map((b) => b.label.toLowerCase())).size, bars.length, at);
              for (const b of bars) {
                assert.ok(b.label && b.label.length <= 40 && b.display && b.display.length <= 24);
                assert.ok(Number.isFinite(b.value) && b.value >= 0);
                assert.equal(parseAmount(b.display), b.value, `${at}: ${b.display}`);
                assert.ok(inArticle(a, b.value), `${at}: ${b.value}`);
                if (unit === "₹ per hour") assert.match(b.display, /^₹/, at);
                if (unit === "%") assert.match(b.display, /%$/, at);
                if (unit === "turfs") assert.match(b.display, /^[^₹].*[^%]$|^\d$/, at);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(charts > 100 && tiles > 20, `${charts} ${tiles}`);
});

test("bars from a dataset: a stat grid is its own tiles, never counts, prices and ratings on one axis", () => {
  const a = HYD();
  const stats = a.datasets.find((d) => d.source === "stats");
  assert.ok(stats);
  const v = kind(buildVisual(a, V({ kind: "bars", title: "Key numbers", dataset: stats.n, label_column: 0, value_column: 1, sort: "none" }), noArt), "stats");
  assert.deepEqual(v, {
    kind: "stats",
    title: "Key numbers",
    stats: [
      { value: "83", label: "Box cricket turfs" },
      { value: "30", label: "Open 24 hours" },
      { value: "₹800", label: "Typical starting rate" },
      { value: "4.39", label: "Average rating" },
    ],
  });
  // The tie that charted 291 and 63 turfs under "Median listed hourly price, ₹ per hour".
  const nvp = NVP();
  const key = kind(buildVisual(nvp, V({ kind: "bars", title: "Median listed hourly price", dataset: 1, label_column: 0, value_column: 1, unit: "₹ per hour", bars: [{ label: "Pune", value: 291 }, { label: "Nashik", value: 63 }] }), noArt), "stats");
  assert.equal(key.title, "Key numbers");
  assert.deepEqual(key.stats.map((s) => s.value), ["291", "63", "₹1,000", "₹600"]);
  // The prompt says so too.
  assert.ok(nvp.prompt.includes('[D1] "Key numbers" (headline numbers: for stat tiles, never bars) columns: 0 Stat | 1 Value'));
});

test("bars from a dataset: the unit says which kind of number; no unit and mixed kinds is no chart", () => {
  const a = readArticle(
    make("mixed-kinds-test", [
      { type: "table", columns: ["Item", "Value"], rows: [["Pune median", "₹1,000"], ["Nashik median", "₹600"], ["Pune turfs", "291"], ["Mumbai median", "₹1,250"], ["Delhi median", "₹1,500"]] },
    ]),
  );
  const bars = (unit: string | null) => buildVisual(a, V({ kind: "bars", title: "Medians", dataset: 1, label_column: 0, value_column: 1, sort: "desc", unit }), noArt);
  const rupees = kind(bars("₹ per hour"), "bars");
  assert.deepEqual(rupees.bars.map((b) => b.display), ["₹1,500", "₹1,250", "₹1,000", "₹600"]);
  assert.equal(rupees.note, "From the article: Table 1, Value column. Left out: Pune turfs (291).");
  // Plain words for a price still mean rupees.
  assert.equal(kind(bars("hourly rate"), "bars").bars.length, 4);
  assert.equal(bars(null), null);
  assert.equal(bars("turfs"), null);
  assert.equal(bars("%"), null);
  // A rating unit on a price column: the wrong column, so no chart.
  const wakad = readArticle(bySlug("turfs-in-wakad-pune"));
  const prices = byTitle(wakad, "Listed hourly prices");
  assert.equal(buildVisual(wakad, V({ kind: "bars", dataset: prices.n, label_column: 0, value_column: 1, unit: "rating" }), noArt), null);
  assert.equal(kind(buildVisual(wakad, V({ kind: "bars", dataset: prices.n, label_column: 0, value_column: 1, unit: "price per hour" }), noArt), "bars").bars.length, 9);
  // The column the model chose is on the chart, so a wrong one shows: reviews asked, ratings given.
  const venues = byTitle(wakad, "Venues in the article");
  const wrong = kind(buildVisual(wakad, V({ kind: "bars", title: "Google reviews per venue", unit: "Google reviews", dataset: venues.n, label_column: 0, value_column: 2 }), noArt), "bars");
  assert.equal(wrong.note, "From the article: Venues in the article, Rating column.");
});

test("bars from a dataset: a column mostly without numbers is no chart; a few gaps are named in the note", () => {
  const a = LEASE();
  const months = byTitle(a, "Illustrative: months to earn back");
  const col = (vc: number) => buildVisual(a, V({ kind: "bars", title: "Months to earn back", dataset: months.n, label_column: 0, value_column: vc, unit: "months" }), noArt);
  // 24, 79, Loss, Loss, Loss: the losses are the table's point, so two bars would mislead.
  assert.equal(col(1), null);
  assert.equal(col(3), null);
  const v = kind(col(4), "bars");
  assert.deepEqual(v.bars.map((b) => b.display), ["14", "17", "24", "46"]);
  assert.ok(v.note?.endsWith(", Pune-type at 60% booked column. Left out: ₹2,00,000 (Over 120)."), v.note ?? "");
  assert.ok((v.note ?? "").length <= 160);
  assert.ok(v.note?.startsWith("From the article: Illustrative: months to earn back"));
  // Many rows left out are counted rather than listed.
  const t = readArticle(
    make("gaps-test", [
      {
        type: "table",
        columns: ["Venue with a long name for this", "Rate"],
        rows: [["Alpha Sports Arena Kothrud", "₹900"], ["Beta Sports Arena Baner", "Call"], ["Gamma Sports Arena Aundh", "₹1,100"], ["Delta Sports Arena Wakad", "Ask on WhatsApp"], ["Eta Arena", "₹700"], ["Theta Arena", "₹800"], ["Iota Arena", "₹600"]],
      },
    ]),
  );
  const gaps = kind(buildVisual(t, V({ kind: "bars", dataset: 1, label_column: 0, value_column: 1, unit: "₹" }), noArt), "bars");
  assert.equal(gaps.bars.length, 5);
  assert.ok(gaps.note?.endsWith(" Left out: 2 rows (Call, Ask on WhatsApp)."), gaps.note ?? "");
});

test("bars from a dataset: labels that repeat are told apart by another column, or no chart", () => {
  const a = NVP();
  const areas = byTitle(a, "Areas with the most listed turfs");
  const v = kind(buildVisual(a, V({ kind: "bars", dataset: areas.n, label_column: 0, value_column: 2, sort: "desc" }), noArt), "bars");
  assert.deepEqual(v.bars.slice(0, 2), [
    { label: "Pune · Kothrud", value: 13, display: "13" },
    { label: "Pune · Wakad", value: 11, display: "11" },
  ]);
  // By area they were distinct already.
  assert.equal(kind(buildVisual(a, V({ kind: "bars", dataset: areas.n, label_column: 1, value_column: 2 }), noArt), "bars").bars[0].label, "Kothrud");
  const same = readArticle(make("same-labels-test", [{ type: "table", columns: ["City", "Turfs"], rows: [["Pune", "13"], ["Pune", "11"], ["Nashik", "3"]] }]));
  assert.equal(buildVisual(same, V({ kind: "bars", dataset: 1, label_column: 0, value_column: 1 }), noArt), null);
});

test("bars: an unknown dataset or column uses the model's bars only when it gave some", () => {
  const a = HYD();
  const bars = [{ label: "Day", value: 900 }, { label: "Evening", value: 1000 }, { label: "Weekend", value: 1100 }];
  const text = kind(buildVisual(a, V({ kind: "bars", title: "ASR rates", dataset: 99, label_column: 0, value_column: 1, sort: "desc", unit: "₹ per hour", bars }), noArt), "bars");
  assert.equal(text.note, "Numbers from the article");
  assert.deepEqual(text.bars.map((b) => b.display), ["₹1,100", "₹1,000", "₹900"]);
  assert.equal(buildVisual(a, V({ kind: "bars", dataset: 99, label_column: 0, value_column: 1 }), noArt), null);
  const rates = a.datasets.find((d) => d.columns.includes("Evening"));
  assert.ok(rates);
  // Columns that aren't there, the same column twice, or a column of words.
  const dataset = rates.n;
  for (const [lc, vc] of [[0, 9], [-1, 1], [0, 0], [0.5, 1], [null, 1], [0, 4]] as [number | null, number][]) {
    assert.equal(buildVisual(a, V({ kind: "bars", dataset, label_column: lc, value_column: vc }), noArt), null, `${lc} ${vc}`);
    const back = buildVisual(a, V({ kind: "bars", dataset, label_column: lc, value_column: vc, bars }), noArt);
    assert.equal(kind(back, "bars").note, "Numbers from the article");
  }
});

test("bars from the text: every value must be in the article, or no chart", () => {
  const a = HYD();
  // "The middle of the market is ₹800 off-peak and ₹1,200 at night": rupees, as the article writes them.
  const ok = kind(buildVisual(a, V({ kind: "bars", title: "  Rates  ", sort: "none", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: 1200 }] }), noArt), "bars");
  assert.equal(ok.title, "Rates");
  assert.deepEqual(ok.bars, [{ label: "Off-peak", value: 800, display: "₹800" }, { label: "Night", value: 1200, display: "₹1,200" }]);
  // One invented number sinks the chart.
  assert.equal(buildVisual(a, V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: 1250 }] }), noArt), null);
  assert.equal(buildVisual(a, V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: -1200 }] }), noArt), null);
  assert.equal(buildVisual(a, V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: NaN }] }), noArt), null);
  // A single bar is no chart.
  assert.equal(buildVisual(a, V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }] }), noArt), null);
  // Unlabelled bars drop out; long labels, titles and units are cut.
  const cut = kind(
    buildVisual(
      a,
      V({ kind: "bars", title: "T".repeat(90), unit: "rupees for one hour of a slot", bars: [{ label: "", value: 800 }, { label: "ASR Sports Arena in Bolarum, Secunderabad, evenings", value: 1000 }, { label: "Night", value: 1200 }] }),
      noArt,
    ),
    "bars",
  );
  assert.equal(cut.bars.length, 2);
  assert.ok(cut.bars[0].label.length <= 40 && cut.bars[0].label.endsWith("…"));
  assert.ok(cut.title.length <= 70);
  assert.ok((cut.unit ?? "").length <= 24);
  assert.equal(kind(buildVisual(a, V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: 1200 }] }), noArt), "bars").title, "From the article");
  // Percent and Indian grouping.
  const big = readArticle(make("grouping-test", [{ type: "p", text: "Rent is ₹1,00,000 and the deposit ₹50,000. Pune sells 67% of slots and Nashik 53%." }]));
  assert.deepEqual(kind(buildVisual(big, V({ kind: "bars", unit: "%", bars: [{ label: "Pune", value: 67 }, { label: "Nashik", value: 53 }] }), noArt), "bars").bars.map((b) => b.display), ["67%", "53%"]);
  assert.deepEqual(kind(buildVisual(big, V({ kind: "bars", unit: "₹", bars: [{ label: "Rent", value: 100000 }, { label: "Deposit", value: 50000 }] }), noArt), "bars").bars.map((b) => b.display), ["₹1,00,000", "₹50,000"]);
});

test("bars from the text: each number must be stated where its label is", () => {
  const a = HYD();
  // The cards say Night Riders 4.8, Offside 4.8, ASR 5.0: each number is somewhere in the article, but not on its venue.
  assert.equal(buildVisual(a, V({ kind: "bars", unit: "rating", bars: [{ label: "Night Riders", value: 5 }, { label: "Offside", value: 4.9 }, { label: "ASR Sports Arena", value: 4.8 }] }), noArt), null);
  const right = kind(buildVisual(a, V({ kind: "bars", unit: "rating", bars: [{ label: "ASR Sports Arena", value: 5 }, { label: "NexGen Box Cricket & Cafe", value: 4.9 }, { label: "Night Riders", value: 4.8 }, { label: "MM Box Cricket", value: 4.7 }] }), noArt), "bars");
  assert.deepEqual(right.bars.map((b) => b.display), ["5.0", "4.9", "4.8", "4.7"]);
  // Swapped city medians are both stated, in one sentence even, but the tiles and table give each city its own.
  const nvp = NVP();
  const medians = (pune: number, nashik: number) => buildVisual(nvp, V({ kind: "bars", unit: "₹ per hour", bars: [{ label: "Pune", value: pune }, { label: "Nashik", value: nashik }] }), noArt);
  assert.deepEqual(kind(medians(1000, 600), "bars").bars.map((b) => b.display), ["₹1,000", "₹600"]);
  assert.equal(medians(600, 1000), null);
  // A place the article never names.
  assert.equal(buildVisual(nvp, V({ kind: "bars", bars: [{ label: "Kharadi", value: 13 }, { label: "Wakad", value: 11 }] }), noArt), null);
  assert.equal(buildVisual(nvp, V({ kind: "bars", bars: [{ label: "Kothrud", value: 13 }, { label: "Wakad", value: 11 }] }), noArt)?.kind, "bars");
  const wakad = readArticle(bySlug("turfs-in-wakad-pune"));
  assert.equal(buildVisual(wakad, V({ kind: "bars", bars: [{ label: "Baner", value: 12 }, { label: "Wakad", value: 4 }] }), noArt), null);
});

test("bars from the text: one kind and scale for all; lakh amounts read as lakh", () => {
  const a = LEASE();
  // The article writes "₹7.5 lakh to ₹60 lakh": the bars say so, not "₹7.5" and "₹60".
  const lakh = kind(buildVisual(a, V({ kind: "bars", unit: "₹ lakh", bars: [{ label: "Box court", value: 7.5 }, { label: "7-a-side Kerala", value: 60 }] }), noArt), "bars");
  assert.deepEqual(lakh.bars, [
    { label: "Box court", value: 750000, display: "₹7.5 lakh" },
    { label: "7-a-side Kerala", value: 6000000, display: "₹60 lakh" },
  ]);
  for (const b of lakh.bars) assert.equal(parseAmount(b.display), b.value);
  // The same amounts in full rupees are the same bars.
  assert.deepEqual(kind(buildVisual(a, V({ kind: "bars", unit: "₹", bars: [{ label: "Box court", value: 750000 }, { label: "7-a-side Kerala", value: 6000000 }] }), noArt), "bars").bars, lakh.bars);
  // A rating unit on rupee amounts, or a rating and a price together, is no chart.
  const hyd = HYD();
  assert.equal(buildVisual(hyd, V({ kind: "bars", unit: "rating", bars: [{ label: "ASR evening", value: 1000 }, { label: "Offside evening", value: 1000 }] }), noArt), null);
  assert.equal(buildVisual(hyd, V({ kind: "bars", bars: [{ label: "ASR Sports Arena", value: 5 }, { label: "Offside evening", value: 1000 }] }), noArt), null);
});

test("bars from the text: a label twice is one bar, or no chart when its values differ", () => {
  const a = HYD();
  const once = kind(buildVisual(a, V({ kind: "bars", unit: "rating", bars: [{ label: "ASR Sports Arena", value: 5 }, { label: "asr sports arena", value: 5 }, { label: "Night Riders", value: 4.8 }] }), noArt), "bars");
  assert.deepEqual(once.bars.map((b) => b.label), ["ASR Sports Arena", "Night Riders"]);
  assert.equal(buildVisual(a, V({ kind: "bars", unit: "₹ per hour", bars: [{ label: "ASR Sports Arena", value: 900 }, { label: "ASR Sports Arena", value: 1100 }, { label: "Night Riders", value: 1000 }] }), noArt), null);
});

test("bars from the text: more than 16 are cut after sorting, and the note says so", () => {
  const nums = Array.from({ length: 19 }, (_, i) => 100 + i);
  const a = readArticle(make("many-bars-test", [{ type: "p", text: nums.map((n) => `T${n} scored ${n}.`).join(" ") }]));
  const v = kind(buildVisual(a, V({ kind: "bars", sort: "desc", bars: nums.map((n) => ({ label: `T${n}`, value: n })) }), noArt), "bars");
  assert.equal(v.bars.length, 16);
  assert.equal(v.bars[0].value, 118);
  assert.equal(v.bars[15].value, 103);
  assert.equal(v.note, "Numbers from the article. Highest 16 of 19.");
});

test("steps: empty ones dropped, cut to size, two to six", () => {
  const a = HYD();
  const steps = Array.from({ length: 8 }, (_, i) => ({ title: `Step ${i + 1}`, detail: "Do it." }));
  const v = kind(buildVisual(a, V({ kind: "steps", title: "How to book", steps: [{ title: " ", detail: "orphan" }, ...steps] }), noArt), "steps");
  assert.equal(v.title, "How to book");
  assert.equal(v.steps.length, 6);
  assert.deepEqual(v.steps[0], { title: "Step 1", detail: "Do it." });
  const long = kind(buildVisual(a, V({ kind: "steps", steps: [{ title: "W ".repeat(50), detail: "D ".repeat(120) }, { title: "Two", detail: "" }] }), noArt), "steps");
  assert.ok(long.steps[0].title.length <= 60 && long.steps[0].detail.length <= 160);
  assert.deepEqual(long.steps[1], { title: "Two", detail: "" });
  assert.equal(long.title, "Step by step");
  assert.equal(buildVisual(a, V({ kind: "steps", steps: [{ title: "Only one", detail: "x" }, { title: "", detail: "y" }] }), noArt), null);
});

test("compare: two or three named columns, rows that fit, two to eight", () => {
  const a = HYD();
  const rows = Array.from({ length: 10 }, (_, i) => ({ label: `Aspect ${i}`, values: ["a", "b"] }));
  const v = kind(buildVisual(a, V({ kind: "compare", columns: ["Box cricket", "Full cricket"], rows: [{ label: "Bad", values: ["only one"] }, ...rows] }), noArt), "compare");
  assert.equal(v.title, "Box cricket vs Full cricket");
  assert.deepEqual(v.columns, ["Box cricket", "Full cricket"]);
  assert.equal(v.rows.length, 8);
  assert.ok(!v.rows.some((r) => r.label === "Bad"));
  // Four columns: the first three are kept and each row's values stay under their column.
  const india = readArticle(bySlug("india-turf-price-map-2026"));
  const four = kind(
    buildVisual(india, V({ kind: "compare", title: "Cities", columns: ["Pune", "", "Nashik", "Mumbai", "Delhi"], rows: [{ label: "Median", values: ["₹1,000", "?", "₹600", "₹1,250", "₹1,500"] }, { label: "Lowest", values: ["₹200", "?", "₹300", "₹700", "₹240"] }] }), noArt),
    "compare",
  );
  assert.deepEqual(four.columns, ["Pune", "Nashik", "Mumbai"]);
  assert.deepEqual(four.rows[0], { label: "Median", values: ["₹1,000", "₹600", "₹1,250"] });
  const cut = kind(buildVisual(a, V({ kind: "compare", columns: ["A", "B"], rows: [{ label: "L".repeat(50), values: ["v".repeat(100), "w"] }, { label: "Two", values: ["x", "y"] }] }), noArt), "compare");
  assert.ok(cut.rows[0].label.length <= 40 && cut.rows[0].values[0].length <= 80);
  assert.equal(buildVisual(a, V({ kind: "compare", columns: ["Only"], rows }), noArt), null);
  assert.equal(buildVisual(a, V({ kind: "compare", columns: ["A", " "], rows }), noArt), null);
  assert.equal(buildVisual(a, V({ kind: "compare", columns: ["A", "B"], rows: rows.slice(0, 1) }), noArt), null);
});

test("compare: a row with a number the article doesn't state is dropped", () => {
  const a = NVP();
  const compare = (rows: { label: string; values: string[] }[]) => buildVisual(a, V({ kind: "compare", title: "Nashik vs Pune", columns: ["Nashik", "Pune"], rows }), noArt);
  const v = kind(
    compare([
      { label: "Median hour", values: ["₹600", "₹1,000"] },
      // The article says ₹600 and ₹1,000, and 11 and 232.
      { label: "Median hour (made up)", values: ["₹450", "₹1,350"] },
      { label: "Box cricket venues", values: ["40", "500"] },
      { label: "Turfs listed", values: ["63 (22 Oct 2026)", "291"] },
      { label: "Football share", values: ["about 89%", "89%"] },
      // ₹ must be a rupee amount in the article and % a percentage: 63 is a count.
      { label: "Rate", values: ["₹63", "₹291"] },
      { label: "Football", values: ["Most venues", "Most venues"] },
    ]),
    "compare",
  );
  assert.deepEqual(v.rows.map((r) => r.label), ["Median hour", "Turfs listed", "Football share", "Football"]);
  assert.equal(compare([{ label: "Median hour", values: ["₹600", "₹1,000"] }, { label: "Box cricket venues", values: ["40", "500"] }]), null);
  // Lakh and crore count in full: "₹22 lakh" is not the 22 priced venues.
  assert.equal(compare([{ label: "Turfs", values: ["63", "291"] }, { label: "Turnover", values: ["₹22 lakh", "₹3 crore"] }]), null);
  const lease = LEASE();
  assert.equal(kind(buildVisual(lease, V({ kind: "compare", columns: ["Box court", "Kerala 7-a-side"], rows: [{ label: "Build", values: ["₹7.5 lakh", "₹50 lakh"] }, { label: "Top end", values: ["₹10.5 lakh", "₹60 lakh"] }] }), noArt), "compare").rows.length, 2);
});

test("stats: a tile whose number the article doesn't state is dropped; two to four", () => {
  const a = HYD();
  const v = kind(
    buildVisual(
      a,
      V({
        kind: "stats",
        title: "Hyderabad at a glance",
        stats: [
          { value: "83", label: "Box cricket cages" },
          { value: "₹1,100", label: "ASR weekend night" },
          { value: "₹1,350", label: "Invented" },
          { value: "30 of 83", label: "Open 24 hours" },
          { value: "Lots", label: "No digit" },
          { value: "₹800 to ₹1,200 an hour", label: "Too long" },
          { value: "4.39", label: "Average rating" },
          { value: "5.0", label: "ASR Sports Arena" },
        ],
      }),
      noArt,
    ),
    "stats",
  );
  assert.deepEqual(v.stats.map((s) => s.value), ["83", "₹1,100", "30 of 83", "4.39"]);
  assert.equal(v.title, "Hyderabad at a glance");
  assert.equal(buildVisual(a, V({ kind: "stats", stats: [{ value: "83", label: "Cages" }, { value: "₹1,350", label: "Invented" }] }), noArt), null);
  assert.equal(buildVisual(a, V({ kind: "stats", stats: [{ value: "83", label: "" }, { value: "30", label: "Open 24 hours" }] }), noArt), null);
  const t = kind(buildVisual(a, V({ kind: "stats", stats: [{ value: "83", label: "Box cricket turfs listed on TapTurf in Hyderabad, October 2026" }, { value: "30", label: "Open" }] }), noArt), "stats");
  assert.ok(t.stats[0].label.length <= 48 && t.stats[0].label.endsWith("…"));
  assert.equal(t.title, "Key numbers");
});

test("stats: a lakh, crore or k amount needs that amount, not just its bare number", () => {
  const tiles = (a: Article, stats: { value: string; label: string }[]) => buildVisual(a, V({ kind: "stats", stats }), noArt);
  // "₹3 crore" and "5k" pass on a stray 3 or 5 no more.
  for (const slug of ["best-box-cricket-turfs-hyderabad", "turfs-in-wakad-pune", "how-to-win-at-box-cricket", "nashik-vs-pune-turfs-listed-prices-2026"]) {
    const a = readArticle(bySlug(slug));
    assert.equal(tiles(a, [{ value: "₹3 crore", label: "Build cost" }, { value: "5k", label: "Monthly visitors" }]), null, slug);
  }
  // "₹22 lakh" from "22 priced venues".
  const nvp = NVP();
  assert.equal(tiles(nvp, [{ value: "₹22 lakh", label: "Nashik turnover" }, { value: "291", label: "Pune turfs listed" }]), null);
  // Real range starts, written "₹50 to 60 lakh", "₹14 to 20 lakh", "₹3 to 8 lakh".
  const lease = LEASE();
  const v = kind(
    tiles(lease, [
      { value: "₹50 lakh", label: "Kerala 7-a-side build" },
      { value: "₹14 lakh", label: "5-a-side football build" },
      { value: "₹3 lakh", label: "LED floodlights" },
      { value: "₹7.5 lakh", label: "Small box court" },
    ]),
    "stats",
  );
  assert.equal(v.stats.length, 4);
  // Rupees must be rupees: "₹22" is not 22 venues, and "22" lakh-less is not ₹22 lakh.
  assert.equal(tiles(nvp, [{ value: "₹22", label: "Nashik venues with a price" }, { value: "₹63", label: "Nashik turfs" }]), null);
});

test("stats: each number must be stated where its label is, and not given another by its own tile", () => {
  const nvp = NVP();
  const tiles = (stats: { value: string; label: string }[]) => buildVisual(nvp, V({ kind: "stats", stats }), noArt);
  // Swapped: the opening sentence names both cities and both amounts, but each city's tile says otherwise.
  assert.equal(tiles([{ value: "₹1,000", label: "Median listed price in Nashik" }, { value: "₹600", label: "Median listed price in Pune" }]), null);
  const right = kind(
    tiles([
      { value: "₹600", label: "Median listed price in Nashik" },
      { value: "₹1,000", label: "Pune median per hour" },
      { value: "232", label: "Pune venues with box cricket" },
      { value: "22 of 63", label: "Nashik venues with a price" },
    ]),
    "stats",
  );
  assert.equal(right.stats.length, 4);
  // A number stated in the article, but never for this.
  assert.equal(tiles([{ value: "291", label: "Nashik turfs listed" }, { value: "63", label: "Pune turfs listed" }]), null);
  const hyd = HYD();
  assert.equal(buildVisual(hyd, V({ kind: "stats", stats: [{ value: "4.8", label: "ASR Sports Arena rating" }, { value: "5.0", label: "Night Riders rating" }] }), noArt), null);
  assert.equal(kind(buildVisual(hyd, V({ kind: "stats", stats: [{ value: "5.0", label: "ASR Sports Arena rating" }, { value: "4.8", label: "Night Riders rating" }] }), noArt), "stats").stats.length, 2);
});

test("art: signed brief and alt; no token or no brief is no picture", () => {
  const a = HYD();
  const calls: [string, string][] = [];
  const sign = (b: string, alt: string) => {
    calls.push([b, alt]);
    return `tok:${b.length}`;
  };
  const cage = "A box cricket cage, top view, with the bowling crease and wall zones labelled.";
  const v = kind(buildVisual(a, V({ kind: "art", title: "The cage", art_brief: `  ${cage}  `, alt: " Top view of a box cricket cage " }), sign), "art");
  assert.deepEqual(v, { kind: "art", title: "The cage", alt: "Top view of a box cricket cage", token: `tok:${cage.length}` });
  assert.deepEqual(calls[0], [cage, "Top view of a box cricket cage"]);
  // No alt: the brief, cut to 160. Long briefs are cut to 900, long alts to 200.
  const long = kind(buildVisual(a, V({ kind: "art", art_brief: "word ".repeat(200), alt: null }), sign), "art");
  const [brief, alt] = calls[1];
  assert.ok(brief.length <= 900 && brief.length > 800 && alt.length <= 160 && long.alt === alt);
  assert.equal(long.title, "Illustration");
  kind(buildVisual(a, V({ kind: "art", art_brief: "A pitch", alt: "x".repeat(300) }), sign), "art");
  assert.ok(calls[2][1].length <= 200);
  assert.equal(buildVisual(a, V({ kind: "art", art_brief: "A pitch", alt: "A pitch" }), () => null), null);
  assert.equal(buildVisual(a, V({ kind: "art", art_brief: "   ", alt: "x" }), sign), null);
  assert.equal(buildVisual(a, V({ kind: "art", art_brief: null, alt: "x" }), sign), null);
  assert.equal(calls.length, 3);
});

// ---------------------------------------------------------------------------
// pick* and follow-ups

test("pickSections: known numbers, deduped, the model's first four, in the article's order", () => {
  const a = HYD();
  assert.deepEqual(pickSections(a, [3, 99, 0, 3, -1, 1.5]), [
    { n: 0, title: "Opening", id: null },
    { n: 3, title: "Rates at a glance", id: "rates-at-a-glance" },
  ]);
  // The model's first four (its most relevant), shown in order.
  assert.deepEqual(pickSections(a, [6, 2, 5, 1, 3, 4]).map((s) => s.n), [1, 2, 5, 6]);
  assert.deepEqual(pickSections(a, [6, 2, 5, 1, 3, 4], 6).map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(pickSections(a, []), []);
  // Copies: changing one doesn't change the memoised article.
  pickSections(a, [1])[0].title = "changed";
  assert.equal(a.sections[1].title, "How this list is ranked");
});

test("pickSources: known numbers, without n, deduped by URL, four at most", () => {
  const a = readArticle(bySlug("how-to-start-a-turf-business-nashik-pune-lease-guide"));
  assert.ok(a.sources.length > 6);
  const got = pickSources(a, [2, 2, 40, 1]);
  assert.deepEqual(got, [
    { label: a.sources[1].label, url: a.sources[1].url, host: a.sources[1].host },
    { label: a.sources[0].label, url: a.sources[0].url, host: a.sources[0].host },
  ]);
  assert.ok(!("n" in got[0]));
  assert.equal(pickSources(a, [1, 2, 3, 4, 5, 6]).length, 4);
  const twice = readArticle(make("twice-test", [{ type: "sources", items: [{ label: "A", url: "https://a.in/x" }, { label: "A again", url: "https://a.in/x" }] }]));
  assert.equal(pickSources(twice, [1, 2]).length, 1);
  assert.deepEqual(pickSources(HYD(), [1]), []);
});

test("pickTurfs: known numbers, just id, name and area, six at most", () => {
  const a = HYD();
  assert.deepEqual(pickTurfs(a, [2, 0, 2, 13]), [{ id: "4a0d9997-e49d-42aa-b5d9-b464c95282a0", name: "NexGen Box Cricket & Cafe", area: "Suraram" }]);
  // V11 is a venue card from the "just missed" related-turfs block, linkable like the turf cards.
  assert.deepEqual(pickTurfs(a, [11]), [{ id: "2a2ebf1f-7140-40c7-86ed-615fec395d0f", name: "MM Box Cricket", area: "Hayathnagar" }]);
  assert.equal(pickTurfs(a, [1, 2, 3, 4, 5, 6, 7, 8]).length, 6);
  // The same venue in two cards links once.
  const twice = readArticle(make("same-turf-test", [{ type: "turf", id: "t1", name: "Alpha", area: "Baner" }, { type: "turf", id: "t1", name: "Alpha", area: "Baner" }, { type: "turf", id: "t2", name: "Beta", area: "Aundh" }]));
  assert.deepEqual(pickTurfs(twice, [1, 2, 3]).map((t) => t.id), ["t1", "t2"]);
});

test("cleanFollowups: trimmed, short, distinct, not the question, two at most", () => {
  assert.deepEqual(cleanFollowups(["  Which is cheapest?  ", "which is CHEAPEST", "Which is cheapest?", "x".repeat(61), "", "   ", "Is it open late?", "Third one?"], "What does it cost?"), [
    "Which is cheapest?",
    "Is it open late?",
  ]);
  assert.deepEqual(cleanFollowups(["What does it cost", "What  does it cost?", "Where is it?"], "what does it cost?"), ["Where is it?"]);
  assert.deepEqual(cleanFollowups([], "x"), []);
  assert.equal(cleanFollowups(["a".repeat(60), "b"], "")[0].length, 60);
});

test("a chart's title can't call its numbers something else (ratings titled as rates, rupees as ratings)", () => {
  const post = ALL_POSTS.find((p) => p.slug === "best-box-cricket-turfs-hyderabad")!;
  const a = readArticle(post);
  const venues = a.datasets.find((d) => d.source === "turfs")!;
  const rating = venues.columns.findIndex((c) => /rating/i.test(c));
  const rates = a.datasets.find((d) => d.source === "table" && d.columns.some((c) => /eve/i.test(c)))!;
  const eve = rates.columns.findIndex((c) => /eve/i.test(c));
  const base = { kind: "bars" as const, title: "", dataset: null, label_column: 0, value_column: 0, sort: "desc" as const, unit: null, bars: [], steps: [], ordered: null, columns: [], rows: [], stats: [], art_brief: null, alt: null };
  // As seen in production: the right unit, a title that calls ratings "rates".
  const ratings = buildVisual(a, { ...base, title: "Published hourly rates for Hyderabad cages", unit: "rating out of 5", dataset: venues.n, value_column: rating }, () => null);
  assert.ok(ratings && ratings.kind === "bars");
  if (ratings?.kind === "bars") {
    assert.ok(!/rates|price|₹/i.test(ratings.title), ratings.title);
    assert.ok(/rating/i.test(ratings.title), ratings.title);
    assert.equal(ratings.unit, "rating out of 5");
  }
  // And a unit that says something else over a column it can't be (a rupee unit over ratings drops the chart).
  assert.equal(buildVisual(a, { ...base, title: "Rates", unit: "₹ per hour", dataset: venues.n, value_column: rating }, () => null), null);
  const rupees = buildVisual(a, { ...base, title: "Google rating of the top 10", unit: null, dataset: rates.n, value_column: eve }, () => null);
  assert.ok(rupees && rupees.kind === "bars");
  if (rupees?.kind === "bars") assert.ok(!/rating/i.test(rupees.title), rupees.title);
  const fine = buildVisual(a, { ...base, title: "Evening rate per hour", unit: "₹ per hour", dataset: rates.n, value_column: eve }, () => null);
  assert.ok(fine?.kind === "bars" && fine.title === "Evening rate per hour" && fine.unit === "₹ per hour");
});

test("venue links only for the venues the answer names", () => {
  const v = (name: string) => ({ id: name, name, area: "" });
  const all = [v("ASR Sports Arena"), v("NexGen Box Cricket & Cafe"), v("AJ Cricket Club (Box Cricket)"), v("The Turf Cafe – Sports Arena"), v("Offside")];
  const names = (text: string) => turfsNamed(all, text).map((t) => t.name);
  assert.deepEqual(names("ASR Sports Arena tops it; NexGen is open all night."), ["ASR Sports Arena", "NexGen Box Cricket & Cafe"]);
  assert.deepEqual(names("AJ Cricket Club and The Turf Cafe are both in the list."), ["AJ Cricket Club (Box Cricket)", "The Turf Cafe – Sports Arena"]);
  assert.deepEqual(names("Most sports arenas and turf cafes charge more for box cricket on weekends."), [], "common words name no venue");
  assert.deepEqual(names("offside, a rule in football"), ["Offside"], "a one-word name counts when it is said");
  assert.deepEqual(names(""), []);
});

test("backingSections: a section that alone holds a claim's amount or venue", () => {
  const india = readArticle(bySlug("india-turf-price-map-2026"));
  const record = india.sections.find((s) => /most expensive hour/i.test(s.title));
  assert.ok(record);
  // ₹3,600 (the record venue's morning rate) is only in that section.
  assert.deepEqual(backingSections(india, ["Its morning rate is ₹3,600."], [], 4), [record.n]);
  // Already cited, or no room: nothing more.
  assert.deepEqual(backingSections(india, ["Its morning rate is ₹3,600."], [record.n], 4), []);
  assert.deepEqual(backingSections(india, ["Its morning rate is ₹3,600."], [], 0), []);
  // ₹4,400 is in the tiles, the table, that section and the FAQ: it says nothing about where a claim came from.
  assert.deepEqual(backingSections(india, ["The highest listed rate is ₹4,400 an hour."], [], 4), []);
  // Small numbers and years never count.
  assert.deepEqual(backingSections(india, ["Split 6 ways in 2026, it is cheaper."], [], 4), []);
  // A venue card in one section only.
  const hyd = HYD();
  const one = hyd.turfs.find((t) => backingSections(hyd, [t.name], [], 4).length === 1);
  assert.ok(one, "some venue card sits in one section");
  // Plain words that start a venue's name ("night", Night Riders) are not the venue.
  const top = hyd.sections.find((s) => s.title === "The top 10");
  assert.ok(top);
  for (const claim of ["Thirty of the 83 cages are open 24 hours, so you can play at night.", "Night slots are generally charged at the evening rate."]) {
    assert.ok(!backingSections(hyd, [claim], [], 4).includes(top.n), claim);
  }
  // ₹2,000 is an amount, not the year 2000.
  const football = readArticle(bySlug("best-turfs-pune-football"));
  const at = football.sections.filter((s) => backingSections(football, ["The top rate is ₹2,000 an hour."], [], 4).includes(s.n));
  assert.ok(at.length <= 1);
});

test("turfsNamed strict: full or short names only", () => {
  const hyd = HYD();
  const riders = hyd.turfs.filter((t) => /^Night Riders/.test(t.name));
  assert.ok(riders.length);
  assert.ok(turfsNamed(riders, "We play at night").length === riders.length, "loose: the first word names it");
  assert.equal(turfsNamed(riders, "We play at night", { strict: true }).length, 0);
  assert.ok(turfsNamed(riders, `Try ${riders[0].name.split(/\s*[([]|\s+[–—-]\s+/)[0]} on weekends`, { strict: true }).length >= 1);
});

test("flatBars: bars that barely differ", () => {
  const bars = (values: number[]): BlogVisual => ({ kind: "bars", title: "t", unit: null, note: null, bars: values.map((v, i) => ({ label: `x${i}`, value: v, display: String(v) })) });
  assert.ok(flatBars(bars([5, 4.9, 4.8, 4.8])));
  assert.ok(!flatBars(bars([2400, 1100, 600])));
  assert.ok(!flatBars(bars([5])));
  assert.ok(!flatBars(null));
  assert.ok(!flatBars({ kind: "steps", title: "t", steps: [] }));
});

test("livelierBars: the short version swaps ratings that barely differ for the column that varies", () => {
  const a = HYD();
  const venues = a.datasets.find((d) => d.source === "turfs");
  assert.ok(venues);
  const ratings = V({ kind: "bars", title: "Google rating", dataset: venues.n, label_column: 0, value_column: 2, sort: "desc", unit: "rating out of 5" });
  const swapped = livelierBars(a, ratings);
  assert.equal(swapped.value_column, 3, "reviews vary, 140 to 585");
  assert.equal(swapped.unit, null);
  assert.equal(swapped.sort, "desc");
  assert.ok(swapped.title?.startsWith("Reviews"), swapped.title ?? "");
  const drawn = kind(buildVisual(a, swapped, noArt), "bars");
  assert.deepEqual(drawn.bars[0], { label: "AJ Cricket Club (Box Cricket)", value: 585, display: "585" });
  // A column that varies is kept, and so is anything that isn't dataset bars.
  const reviews = V({ ...ratings, value_column: 3 });
  assert.equal(livelierBars(a, reviews), reviews);
  const text = V({ kind: "bars", bars: [{ label: "Off-peak", value: 800 }, { label: "Night", value: 1200 }] });
  assert.equal(livelierBars(a, text), text);
  const steps = V({ kind: "steps", steps: [{ title: "a", detail: "b" }] });
  assert.equal(livelierBars(a, steps), steps);
});

test("steps: numbered for a process, a plain list for rules in any order", () => {
  const a = HYD();
  const steps = [{ title: "Book early", detail: "Weekends fill first." }, { title: "Bring water", detail: "None is sold." }];
  const numbered = kind(buildVisual(a, V({ kind: "steps", steps }), noArt), "steps");
  assert.equal(numbered.ordered, undefined);
  assert.equal(numbered.title, "Step by step");
  const list = kind(buildVisual(a, V({ kind: "steps", steps, ordered: false, title: "Rules with money at stake" }), noArt), "steps");
  assert.equal(list.ordered, false);
  assert.equal(list.title, "Rules with money at stake");
  assert.equal(kind(buildVisual(a, V({ kind: "steps", steps, ordered: false }), noArt), "steps").title, "In short");
});

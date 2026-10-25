import type { Block, Post } from "../../content/blog";
import { getBlogTurf } from "../../content/blog/data/turfs";
import type { BlogBar, BlogLink, BlogSection, BlogTurf, BlogVisual } from "./blogTypes";
import type { RawVisual } from "./blogReply";
import { slugify } from "../utils/slugify";

/**
 * A blog post as Ask TapTurf's answerer reads it, and the checks on what
 * it says back. readArticle numbers the article's sections [S], datasets
 * [D] (its tables, stat tiles and venue cards as rows), cited sources [R]
 * and venues [V] and writes them into one prompt; the model answers by
 * number, and the pick* helpers turn its numbers back into our own
 * headings and links, dropping any it made up. buildVisual makes the
 * chart, steps, comparison or stat tiles from what it chose: bars from a
 * dataset are built here from the article's own cells, and any number
 * the model typed itself must be one the article states, in the same
 * sentence, row or card as what it labels.
 * Pure (relative imports only), so node --test can run it.
 */

export type Dataset = { n: number; title: string; source: "table" | "turfs" | "stats"; columns: string[]; rows: string[][] };
export type ArticleSource = BlogLink & { n: number };
export type ArticleTurf = BlogTurf & { n: number; rating: number | null; reviews: number | null };
export type Article = {
  slug: string;
  title: string;
  cta: Post["cta"] | null;
  /** S0 is the opening, before the first heading (id null), then one per h2. */
  sections: BlogSection[];
  datasets: Dataset[];
  sources: ArticleSource[];
  /** Turf cards and the venue cards of related-turfs blocks, in article order. */
  turfs: ArticleTurf[];
  /** The FAQ questions, in order. */
  questions: string[];
  /** The article as the model sees it. Stable text: it is cached as a prompt prefix. */
  prompt: string;
  /** FNV-1a 64 (hex) of everything an answer is built from: changes whenever the article's text or numbers do. */
  hash: string;
};

type Turf = Extract<Block, { type: "turf" }>;

const tidy = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
// A title with its full stop off, so more can follow it.
const bare = (s: string) => s.replace(/[\s.,;:–-]+$/, "");

/** At most n characters, cut at a word with an ellipsis. */
function clip(s: unknown, n: number): string {
  const t = tidy(s);
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/** FNV-1a, 64-bit, over the UTF-8 bytes, as 16 hex digits. */
export function hashText(s: string): string {
  // Four 16-bit limbs, low first (the app targets ES2017: no BigInt). Offset basis cbf29ce484222325.
  let [h0, h1, h2, h3] = [0x2325, 0x8422, 0x9ce4, 0xcbf2];
  for (const byte of new TextEncoder().encode(s)) {
    h0 ^= byte;
    // h * 0x100000001b3 = h * 0x1b3 + (h << 40), kept to 64 bits.
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
    [h0, h1, h2, h3] = [t0 & 0xffff, t1 & 0xffff, t2 & 0xffff, t3 & 0xffff];
  }
  return [h3, h2, h1, h0].map((x) => x.toString(16).padStart(4, "0")).join("");
}

// ---------------------------------------------------------------------------
// Numbers as articles write them

// 1500, 1,500, 12,345,678, 1,00,000 (Indian grouping), 4.39.
const NUM = String.raw`\d{1,3}(?:(?:,\d{3})+|(?:,\d{2})+,\d{3})(?:\.\d+)?|\d+(?:\.\d+)?`;
const MULT = String.raw`lakhs?|lacs?|l|crores?|cr|k`;
const CURRENCY = String.raw`(?:₹|rs\.?|inr)`;
const NUMBER = new RegExp(String.raw`(?:(₹|\brs\b\.?|\binr\b)\s?)?(${NUM})(?:\s?(${MULT})\b)?(\s?%)?`, "gi");
// "₹50 to 60 lakh", "₹600–₹800", "30 to 50%".
const RANGE = /^\s*(?:-|–|—|to)\s*$/i;
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

// Rounded so 1.2 lakh and 120000, or 4.1 and 4.10, are the same number.
const round = (x: number) => Math.round(x * 1e6) / 1e6;

type Kind = "₹" | "%" | "";
type Mult = "lakh" | "crore" | "k";
/** A number as written: raw is the figure ("7.5"), abs the amount (750000 for ₹7.5 lakh); text is the figure as typed. */
type Num = { raw: number; abs: number; kind: Kind; mult: Mult | null; text: string };

function multOf(m: string | undefined): Mult | null {
  const x = (m ?? "").toLowerCase();
  if (!x) return null;
  if (x === "k") return "k";
  return x.startsWith("c") ? "crore" : "lakh";
}

const SCALE: Record<Mult, number> = { lakh: 1e5, crore: 1e7, k: 1e3 };
const scale = (m: Mult | null) => (m ? SCALE[m] : 1);

/**
 * Every number written in `s`, with its currency, percent and lakh/crore/k.
 * A range shares them: in "₹50 to 60 lakh" both ends are rupees in lakh,
 * in "30 to 50%" both are percentages. Number words count too ("Thirty").
 */
function numbersIn(s: string): Num[] {
  type Hit = { start: number; end: number; raw: number; text: string; cur: boolean; pct: boolean; mult: Mult | null };
  const hits: Hit[] = [];
  for (const m of s.matchAll(NUMBER)) {
    const raw = round(parseFloat(m[2].replace(/,/g, "")));
    if (!Number.isFinite(raw)) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, raw, text: m[2], cur: !!m[1], pct: !!m[4], mult: multOf(m[3]) });
  }
  for (let i = 0; i + 1 < hits.length; i++) {
    const [a, b] = [hits[i], hits[i + 1]];
    if (!RANGE.test(s.slice(a.end, b.start))) continue;
    if (a.cur && !b.cur && !b.pct) b.cur = true;
    // Only to a smaller start: "₹25,000 to ₹1 lakh" keeps ₹25,000 as it is.
    if (b.mult && !a.mult && a.raw < b.raw) a.mult = b.mult;
    if (b.pct && !a.pct && !a.cur && a.raw < b.raw) a.pct = true;
  }
  const out: Num[] = hits.map((h) => ({ raw: h.raw, abs: round(h.raw * scale(h.mult)), kind: h.cur ? "₹" : h.pct ? "%" : "", mult: h.mult, text: h.text }));
  for (const w of s.toLowerCase().match(/[a-z]+/g) ?? []) if (w in WORDS) out.push({ raw: WORDS[w], abs: WORDS[w], kind: "", mult: null, text: String(WORDS[w]) });
  return out;
}

/** A number as a chart shows it: "₹7.5 lakh", "₹1,100", "67%", "4.8". */
function shown(n: Num): string {
  const mult = n.mult === "k" ? "k" : n.mult ? ` ${n.mult}` : "";
  return `${n.kind === "₹" ? "₹" : ""}${n.text}${mult}${n.kind === "%" ? "%" : ""}`;
}

const AMOUNT = new RegExp(String.raw`^(?:${CURRENCY}\s?)?(${NUM})(?:\s?(${MULT})\b)?\s?(.*)$`, "i");
// What may follow an amount in a cell: a unit, never a qualifier ("Over 120", "100+", "~60") or a time ("6am").
const UNIT =
  /^(?:%|\/-|only|each|(?:\/\s?|(?:per|an?|each)\s)?(?:hrs?|hours?|h|head|players?|person|slot|months?|days?|weeks?|years?|yrs?|mins?|minutes?|secs?|seconds?|m|km|ft|turfs?|venues?|cages?|courts?|grounds?|reviews?|overs?|balls?|runs?|points?|sports?|ads?|taps?))\.?$/i;

/**
 * A table cell as one amount, or null when it isn't exactly one:
 * "₹1,500" 1500, "₹900/hr" 900, "4.18", "24 hrs" 24, "₹7.5 lakh" 750000.
 * Ranges and pairs ("₹600–₹800", "4.8 (585)", "22 of 63"), words ("Call",
 * "Yes", "Not listed"), dashes and qualified amounts ("Over 120", "100+")
 * are null, so a chart never draws a number the cell doesn't say.
 */
export function parseAmount(cell: string | number): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const m = AMOUNT.exec(tidy(cell));
  if (!m) return null;
  const rest = m[3].trim();
  if (rest && !UNIT.test(rest)) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? round(n * scale(multOf(m[2]))) : null;
}

// ₹ amounts, percentages and plain counts don't belong on one axis.
const cellKind = (cell: string): Kind => (/^(₹|rs\b|inr\b)/i.test(cell) ? "₹" : /%$/.test(cell) ? "%" : "");

/** What a chart's unit says its numbers are: rupees, percentages, plain numbers, or (no unit) not said. */
function unitKind(unit: string | null): Kind | null {
  const u = tidy(unit).toLowerCase();
  if (!u) return null;
  if (/%|\bper ?cent|\bshare\b|\boccupancy\b/.test(u)) return "%";
  if (/₹|\brs\b|\binr\b|rupee|\blakhs?\b|\blacs?\b|\bcrores?\b|\bprices?\b|\bpriced\b|\bcosts?\b|\brents?\b|\bfees?\b|\btariffs?\b|\brates?\b|\bhourly\b|\bper (?:hour|hr|head|player|person|slot)\b|\ban hour\b|\ba head\b|\/\s?(?:hr|hour)\b/.test(u)) return "₹";
  return "";
}

/** The lakh, crore or thousand a unit counts in ("₹ lakh"), or null. */
function unitScale(unit: string | null): number | null {
  const u = tidy(unit).toLowerCase();
  if (/\blakhs?\b|\blacs?\b/.test(u)) return 1e5;
  if (/\bcrores?\b|\bcr\b/.test(u)) return 1e7;
  if (/\bthousands?\b/.test(u)) return 1e3;
  return null;
}

// ---------------------------------------------------------------------------
// Where each number sits: sentences, table cells, stat tiles, venue cards

/**
 * A place in the article that states numbers: a sentence, a stat tile, a
 * venue card, or one table cell (with its row and column header for
 * words). fixed: it states one thing's value (a cell, a tile, a card's
 * rating), so a label it fully names should have its number there.
 */
type Unit = { words: string[]; nums: Num[]; fixed: boolean };
type Index = { units: Unit[]; values: Set<number>; all: Num[] };

const STOP = new Set(
  "a an the of in on at for to and or by with per vs versus v is are was be been has have had will would its it this that these those each all any our your their there here then as than into out up over under after before via near what which who how when where can you we they i s from not no yes one but if so do does also".split(" "),
);
// Words for what is measured, not which thing: a label is told apart by its other words.
const GENERIC = new Set(
  "median average avg mean typical usual total overall number numbers count listed listing listings list price prices priced pricing rate rates rating ratings rated cost costs fee fees charge charges hourly hour hours hr hrs slot slots turf turfs venue venues cage cages court courts ground grounds review reviews google star stars starting lowest highest cheapest dearest costliest priciest most least top best max min minimum maximum share percent percentage rupee rupees rs inr lakh lakhs crore crores amount value figure around about approx roughly nearly almost only just active live city cities area areas pick picks option options choice spot spots place places player players people person head month months monthly year years yearly week weeks daily".split(" "),
);

const wordsOf = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w));

/** The same word, give or take a plural, a possessive or a short form ("evenings", "Nashik's", "eve", "Oct"). */
function sameWord(t: string, w: string): boolean {
  if (t === w) return true;
  if (/\d/.test(t) || /\d/.test(w)) return false;
  const s = w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
  if (s.length >= 3 && t.startsWith(s) && (s.length >= 4 || t.length - s.length <= 2)) return true;
  return t.length >= 3 && w.startsWith(t) && (t.length >= 4 || w.length - t.length <= 4);
}

const hasWord = (u: Unit, w: string) => u.words.some((t) => sameWord(t, w));

function sentences(text: string): string[] {
  const t = tidy(text);
  const out: string[] = [];
  let from = 0;
  // A full stop, ! or ? and a space, before anything but a lowercase letter; "Rs. 900" and "vs. grass" are not ends.
  for (const m of t.matchAll(/[.!?]+["'”’)\]]*\s+(?=[^a-z])/g)) {
    if (/(?:^|\s)(?:rs|vs|no|approx|mr|mrs|ms|dr|st|e\.g|i\.e)$/i.test(t.slice(from, m.index))) continue;
    out.push(t.slice(from, m.index + m[0].length).trim());
    from = m.index + m[0].length;
  }
  out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

class Units {
  list: Unit[] = [];
  /** Running text: each sentence on its own. */
  prose(...texts: (string | null | undefined)[]) {
    for (const t of texts) for (const s of sentences(t ?? "")) this.list.push({ words: wordsOf(s), nums: numbersIn(s), fixed: false });
  }
  /** One thing's value: `words` name it, `value` states it. */
  fixed(words: string, value: string) {
    const nums = numbersIn(value);
    if (nums.length) this.list.push({ words: wordsOf(words), nums, fixed: true });
  }
  /** A block read whole (a venue card, a stat tile). */
  whole(text: string) {
    this.list.push({ words: wordsOf(text), nums: numbersIn(text), fixed: false });
  }
  index(): Index {
    const all = this.list.flatMap((u) => u.nums);
    const values = new Set<number>();
    for (const n of all) values.add(n.raw).add(n.abs);
    return { units: this.list, values, all };
  }
}

/**
 * The places that state something about `label`: they hold its rarer
 * words. Each of the label's naming words (not "median", "price", "turfs")
 * weighs by how few places use it; a place must hold at least half the
 * weight, and the weightiest word unless it holds three quarters. So
 * "ASR weekend night" needs ASR, and "Median price in Nashik" needs Nashik.
 */
function placesNaming(ix: Index, label: string): Unit[] {
  const words = [...new Set(wordsOf(label))];
  const letters = words.filter((w) => /\p{L}/u.test(w));
  // A city in the label counts even when the title names it: in "Nashik vs
  // Pune" the city is what tells two numbers apart. A tile this drops is
  // only a chart not shown, never a number put under the wrong name.
  const named = letters.filter((w) => !GENERIC.has(w));
  const cand = named.length ? named : letters.length ? letters : words;
  if (cand.length === 0) return [];
  const n = ix.units.length;
  const hits = cand.map((w) => ix.units.map((u) => hasWord(u, w)));
  const weight = hits.map((row) => Math.log((n + 1) / (row.filter(Boolean).length + 0.5)));
  const total = weight.reduce((x, y) => x + y, 0);
  const top = Math.max(...weight);
  return ix.units.filter((_, ui) => {
    let got = 0;
    let topHit = false;
    cand.forEach((_, wi) => {
      if (!hits[wi][ui]) return;
      got += weight[wi];
      if (weight[wi] >= top - 1e-9) topHit = true;
    });
    return got > 0 && got >= total / 2 && (topHit || got >= total * 0.75);
  });
}

/**
 * True when the article gives `label` another number: a cell, tile or
 * card rating that names every word of it states a number of this kind,
 * and none of those states this one ("Median price in Nashik ₹1,000"
 * when its tile says ₹600).
 */
function contradicted(ix: Index, label: string, states: (n: Num) => boolean, sameKind: (n: Num) => boolean): boolean {
  const words = [...new Set(wordsOf(label))];
  if (words.length === 0) return false;
  let other = false;
  for (const u of ix.units) {
    if (!u.fixed || !words.every((w) => hasWord(u, w))) continue;
    if (u.nums.some(states)) return false;
    if (u.nums.some(sameKind)) other = true;
  }
  return other;
}

// ---------------------------------------------------------------------------
// Reading the article

const indexes = new WeakMap<Article, Index>();

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const ratingOf = (r: Turf["rating"]): number | null => {
  const n = typeof r === "number" ? r : parseFloat(tidy(r));
  return Number.isFinite(n) ? n : null;
};
const count = (n: number) => n.toLocaleString("en-IN");
// Cells in the prompt: "|" splits columns there, and an empty cell still takes its place.
const cellText = (s: string) => s.replace(/\|/g, "/") || "-";

function turfLine(t: Turf, n: number): string {
  const rated = t.rating != null && tidy(t.rating) ? `, rated ${tidy(t.rating)}` : "";
  const reviews = typeof t.reviews === "number" ? `${rated ? " from" : ","} ${count(t.reviews)} reviews` : "";
  const note = tidy(t.note) ? `: ${tidy(t.note)}` : "";
  return `[V${n}] ${t.rank ? `#${t.rank} ` : ""}${tidy(t.name)}, ${tidy(t.area)}${rated}${reviews}${note}`;
}

/** A related-turfs venue as a card, the way the page shows it (rating to one place, reviews grouped). */
function cardOf(id: string): Turf | null {
  const t = getBlogTurf(id);
  if (!t) return null;
  return {
    type: "turf",
    id: t.id,
    name: t.name,
    area: t.area,
    ...(t.rating != null ? { rating: t.rating.toFixed(1) } : {}),
    ...(t.reviews != null ? { reviews: t.reviews } : {}),
  };
}

const venueRow = (t: Turf) => [tidy(t.name), tidy(t.area), tidy(t.rating), typeof t.reviews === "number" ? count(t.reviews) : ""];

function read(post: Post): { article: Article; index: Index } {
  const sections: BlogSection[] = [{ n: 0, title: "Opening", id: null }];
  const datasets: Dataset[] = [];
  const sources: ArticleSource[] = [];
  const questions: string[] = [];
  // Everything the reader is shown, by sentence, row and card: for inArticle and the label checks.
  const units = new Units();
  units.prose(post.title, post.hook, post.description, post.heroImage?.alt);
  const body: string[] = ["[S0] Opening"];

  // Venues first, so each has its V number wherever it shows: every turf
  // card, then each related-turfs card that isn't a turf card or listed already.
  const cards = post.blocks.filter((b): b is Turf => b.type === "turf");
  const cardIds = new Set(cards.map((c) => tidy(c.id)));
  const turfs: ArticleTurf[] = [];
  // The V number of each turf card, in order, and of each venue id where it first shows.
  const cardNs: number[] = [];
  const firstN = new Map<string, number>();
  const related: { card: Turf; group: string }[] = [];
  {
    let h2: string | null = null;
    let h3: string | null = null;
    for (const b of post.blocks) {
      if (b.type === "h2") [h2, h3] = [tidy(b.text), null];
      else if (b.type === "h3") h3 = tidy(b.text);
      const add = (t: Turf) => {
        const n = turfs.length + 1;
        turfs.push({ n, id: tidy(t.id), name: tidy(t.name), area: tidy(t.area), rating: ratingOf(t.rating), reviews: typeof t.reviews === "number" && Number.isFinite(t.reviews) ? t.reviews : null });
        if (!firstN.has(tidy(t.id))) firstN.set(tidy(t.id), n);
        return n;
      };
      if (b.type === "turf") cardNs.push(add(b));
      if (b.type === "related-turfs") {
        for (const id of b.ids) {
          const card = cardOf(tidy(id));
          if (!card || cardIds.has(card.id) || firstN.has(card.id)) continue;
          add(card);
          related.push({ card, group: clip(tidy(b.title) || (h3 ? (h2 ? `${h2}: ${h3}` : h3) : h2 ?? "Opening"), 80) });
        }
      }
    }
  }
  let cardsSeen = 0;
  let relatedListed = false;
  const written = new Set<number>();
  // A venue shown again (a related card of a turf card, or in two lists) is named by its number only.
  const again = (n: number) => body.push(`[V${n}] ${turfs[n - 1].name}, ${turfs[n - 1].area}`);
  const venue = (t: Turf, n: number) => {
    if (written.has(n)) return again(n);
    written.add(n);
    body.push(turfLine(t, n));
    units.whole(`${tidy(t.name)}, ${tidy(t.area)}${tidy(t.rating) ? `, rated ${tidy(t.rating)}` : ""}${typeof t.reviews === "number" ? `, ${count(t.reviews)} reviews` : ""}${tidy(t.note) ? `: ${tidy(t.note)}` : ""}`);
    units.fixed(`${t.name} ${t.area} rating`, tidy(t.rating));
    if (typeof t.reviews === "number") units.fixed(`${t.name} ${t.area} reviews`, count(t.reviews));
  };

  // The heading above a table names it when it has no caption.
  let heading: string | null = null;
  let grids = 0;

  for (const b of post.blocks) {
    switch (b.type) {
      case "p":
        body.push(tidy(b.text));
        units.prose(b.text);
        break;
      case "h2": {
        const n = sections.length;
        heading = tidy(b.text);
        sections.push({ n, title: heading, id: b.id ?? slugify(b.text) });
        body.push("", `[S${n}] ${heading}`);
        units.prose(b.text);
        break;
      }
      case "h3":
        heading = tidy(b.text);
        body.push(`### ${heading}`);
        units.prose(b.text);
        break;
      case "ul":
        body.push(...b.items.map((x) => `- ${tidy(x)}`));
        units.prose(...b.items);
        break;
      // Numbered, so a how-to keeps its order for the steps visual.
      case "ol":
        body.push(...b.items.map((x, i) => `${i + 1}. ${tidy(x)}`));
        units.prose(...b.items);
        break;
      case "quote":
        body.push(`"${tidy(b.text)}"${tidy(b.by) ? ` (${tidy(b.by)})` : ""}`);
        units.prose(b.text, b.by);
        break;
      case "callout":
        body.push(`${tidy(b.title)}: ${tidy(b.text)}`);
        units.prose(`${tidy(b.title)}: ${tidy(b.text)}`);
        break;
      case "turf": {
        // The cards are one dataset (a chart of ratings or reviews), placed where the first one is.
        if (cards.length >= 2 && cardsSeen === 0) {
          datasets.push({ n: datasets.length + 1, title: "Venues in the article", source: "turfs", columns: ["Venue", "Area", "Rating", "Reviews"], rows: cards.map(venueRow) });
        }
        venue(b, cardNs[cardsSeen++]);
        break;
      }
      case "related-turfs": {
        // The page shows the ids it can find in the snapshot, under the block's title when it has one.
        const shown = b.ids.map((id) => cardOf(tidy(id))).filter((t): t is Turf => t !== null);
        if (shown.length === 0) break;
        // Their venues are one dataset too, placed where the first block is; the group says which list each is in.
        if (related.length >= 2 && !relatedListed) {
          relatedListed = true;
          datasets.push({
            n: datasets.length + 1,
            title: cards.length >= 2 ? "More venues in the article" : "Venues in the article",
            source: "turfs",
            columns: ["Venue", "Area", "Rating", "Reviews", "Listed under"],
            rows: related.map((r) => [...venueRow(r.card), r.group]),
          });
        }
        if (tidy(b.title)) {
          heading = tidy(b.title);
          body.push(`### ${heading}`);
          units.prose(b.title);
        }
        for (const t of shown) {
          const n = firstN.get(t.id);
          if (n === undefined) continue;
          // A turf card's full line is written where the card is; here it is named by number.
          if (cardIds.has(t.id)) again(n);
          else venue(t, n);
        }
        break;
      }
      case "stat-grid": {
        const items = b.items.filter((i) => tidy(i.label) || tidy(i.value));
        if (items.length === 0) break;
        grids++;
        const n = datasets.length + 1;
        datasets.push({
          n,
          title: grids === 1 ? "Key numbers" : heading ? `Key numbers: ${heading}` : `Key numbers ${grids}`,
          source: "stats",
          columns: ["Stat", "Value"],
          rows: items.map((i) => [tidy(i.label), tidy(i.value)]),
        });
        body.push(`[D${n}] ${items.map((i) => `${tidy(i.label)}: ${tidy(i.value)}${tidy(i.hint) ? ` (${tidy(i.hint)})` : ""}`).join("; ")}`);
        for (const i of items) {
          units.whole(`${tidy(i.label)}: ${tidy(i.value)}${tidy(i.hint) ? ` (${tidy(i.hint)})` : ""}`);
          units.fixed(i.label, tidy(i.value));
        }
        break;
      }
      case "table": {
        const rows = b.rows.map((r) => r.map(tidy)).filter((r) => r.some(Boolean));
        // A row longer than the header keeps its cells under unnamed columns.
        const width = Math.max(b.columns.length, ...rows.map((r) => r.length));
        if (rows.length === 0 || width === 0) break;
        const n = datasets.length + 1;
        const title = tidy(b.caption) || heading || `Table ${n}`;
        const columns = Array.from({ length: width }, (_, i) => tidy(b.columns[i]));
        datasets.push({ n, title, source: "table", columns, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) });
        body.push(`[D${n}] table: ${title} (rows under DATASETS)`);
        units.prose(b.caption, ...b.columns);
        // Each cell is named by its row and its column's header.
        for (const r of rows) r.forEach((cell, i) => units.fixed(`${r.join(" ")} ${columns[i] ?? ""}`, cell));
        break;
      }
      case "faq":
        for (const i of b.items) {
          body.push(`Q: ${tidy(i.q)}`, `A: ${tidy(i.a)}`);
          questions.push(tidy(i.q));
          units.prose(i.q, i.a);
        }
        break;
      case "sources":
        for (const i of b.items) {
          const host = hostOf(tidy(i.url));
          if (!host) continue;
          const n = sources.length + 1;
          const label = tidy(i.label) || host;
          sources.push({ n, label, url: tidy(i.url), host });
          body.push(`[R${n}] ${label} (${host})`);
          units.prose(label);
        }
        if (tidy(b.note)) {
          body.push(tidy(b.note));
          units.prose(b.note);
        }
        break;
      // Charts drawn as pictures carry their numbers in the alt text.
      case "image":
        body.push(`Image: ${tidy(b.alt)}${tidy(b.caption) ? ` (${tidy(b.caption)})` : ""}`);
        units.prose(b.alt, b.caption);
        break;
      case "price-calc": {
        // The calculator as the page first shows it (PriceCalculator's own defaults when the block sets none).
        const price = b.defaults?.pricePerHour ?? 800;
        const players = b.defaults?.players ?? 10;
        const hours = b.defaults?.hours ?? 1;
        const each = players > 0 ? Math.round(Math.max(0, price * hours) / players) : 0;
        const caption = tidy(b.caption) ? `${bare(tidy(b.caption))}. ` : "";
        const line = `Price calculator: ${caption}Set to ₹${count(price)} an hour for ${players} players and ${hours} hour${hours === 1 ? "" : "s"}: ₹${count(each)} each.`;
        body.push(line);
        units.prose(line);
        break;
      }
      // Buttons say nothing to answer from.
      default:
        break;
    }
  }

  // The photo at the top, which a drawing of the thing can follow ("a floodlit box cricket cage").
  const hero = tidy(post.heroImage?.alt) ? `\nHero image: ${tidy(post.heroImage?.alt)}` : "";
  const parts = [`# ${tidy(post.title)}\n${tidy(post.hook)}${hero}`, body.join("\n")];
  if (datasets.length) {
    const sets = datasets.map((d) => {
      // Stat tiles are unrelated measures side by side: tiles, never one axis.
      const what = d.source === "stats" ? " (headline numbers: for stat tiles, never bars)" : "";
      return [`[D${d.n}] "${d.title}"${what} columns: ${d.columns.map((c, i) => `${i} ${c ? cellText(c) : "(no name)"}`).join(" | ")}`, ...d.rows.map((r) => r.map(cellText).join(" | "))].join("\n");
    });
    parts.push(`DATASETS (rows of the article's tables, stat tiles and venue cards; columns numbered from 0)\n${sets.join("\n\n")}`);
  }
  if (sources.length) parts.push(`SOURCES THE ARTICLE CITES\n${sources.map((s) => `[R${s.n}] ${s.label} (${s.host})`).join("\n")}`);
  if (turfs.length) parts.push(`VENUES IN THE ARTICLE\n${turfs.map((t) => `[V${t.n}] ${t.name}, ${t.area}`).join("\n")}`);

  const prompt = parts.join("\n\n");
  const cta = post.cta ?? null;
  // The prompt, plus what the reader is shown that the prompt leaves out (description, anchors, URLs, ids, the button).
  const hash = hashText(JSON.stringify([prompt, post.description, post.readMinutes, post.city, cta, sections, datasets, sources, turfs, questions]));
  const article: Article = { slug: post.slug, title: tidy(post.title), cta, sections, datasets, sources, turfs, questions, prompt, hash };
  return { article, index: units.index() };
}

const memo = new Map<string, { blocks: Block[]; article: Article }>();

/** The article as the answerer reads it. The same object every time for the same post and edit; treat it as read-only. */
export function readArticle(post: Post): Article {
  const key = `${post.slug}|${post.updatedAt ?? post.publishedAt}`;
  const hit = memo.get(key);
  // Same slug and date but other blocks is a draft or a test, not the post we read.
  if (hit && hit.blocks === post.blocks) return hit.article;
  const { article, index } = read(post);
  indexes.set(article, index);
  if (memo.size >= 200) memo.delete(memo.keys().next().value as string);
  memo.set(key, { blocks: post.blocks, article });
  return article;
}

function indexOf(a: Article): Index {
  let ix = indexes.get(a);
  if (!ix) {
    // An Article not made by readArticle: its prompt, without our own numbering, is near enough.
    const units = new Units();
    units.prose(...a.prompt.replace(/\[[SDRV]\d+\]/g, " ").split("\n"));
    ix = units.index();
    indexes.set(a, ix);
  }
  return ix;
}

/** True when the article states `value` as a number somewhere (1,100, 1100 and ₹1,100 are all 1100; 4.10 is 4.1). */
export function inArticle(a: Article, value: number): boolean {
  return Number.isFinite(value) && indexOf(a).values.has(round(value));
}

// ---------------------------------------------------------------------------
// The visual

// Room for a city table (14 rows) whole: a cut drops the rows at one end.
const MAX_BARS = 16;
const NOTE_MAX = 160;
const unitOf = (u: string | null) => clip(u, 24) || null;
const byValue = (sort: RawVisual["sort"]) => (x: BlogBar, y: BlogBar) => (sort === "desc" ? y.value - x.value : sort === "asc" ? x.value - y.value : 0);
const distinct = (labels: string[]) => new Set(labels.map((l) => l.toLowerCase())).size === labels.length;

type Left = { label: string; cell: string };

/**
 * Bars from a table's own cells, or null when its column can't be one
 * honest chart: rows of another kind than the unit says (or, with no
 * unit, ₹, % and plain numbers mixed), more than a third of the rows
 * without a number, or labels that name two bars alike. `left` is what
 * was left out, for the note.
 */
function datasetBars(d: Dataset, labelColumn: number, valueColumn: number, unit: string | null): { bars: BlogBar[]; left: Left[] } | null {
  const want = unitKind(unit);
  const kept: (BlogBar & { kind: Kind; row: string[] })[] = [];
  const left: Left[] = [];
  for (const row of d.rows) {
    const label = clip(row[labelColumn], 40);
    const cell = tidy(row[valueColumn]);
    const value = parseAmount(cell);
    const kind = cellKind(cell);
    if (!label || value === null || value < 0 || (want !== null && kind !== want)) left.push({ label, cell });
    else kept.push({ label, value, display: clip(cell, 24), kind, row });
  }
  if (want === null && new Set(kept.map((k) => k.kind)).size > 1) return null;
  if (kept.length < 2 || left.length * 3 > d.rows.length) return null;
  let labels = kept.map((k) => k.label);
  if (!distinct(labels)) {
    // "Pune 13, Pune 11": each bar named by another text column too ("Pune · Kothrud"), when that tells them apart.
    labels = [];
    for (let c = 0; c < d.columns.length && labels.length === 0; c++) {
      if (c === labelColumn || c === valueColumn) continue;
      const extra = kept.map((k) => tidy(k.row[c]));
      if (extra.some((x) => !x || parseAmount(x) !== null)) continue;
      const joined = kept.map((k, i) => clip(`${tidy(k.row[labelColumn])} · ${extra[i]}`, 40));
      if (distinct(joined)) labels = joined;
    }
    if (labels.length === 0) return null;
  }
  return { bars: kept.map((k, i) => ({ label: labels[i], value: k.value, display: k.display })), left };
}

/**
 * Bars from numbers the model typed. Each must be stated where its label
 * is (the same sentence, row, tile or card), all in one kind and scale,
 * and not given another number by a cell or tile that names it, or there
 * is no chart. Values and displays come from the article's own writing,
 * so "₹ lakh" bars read "₹7.5 lakh", not "₹7.5".
 */
function textBars(a: Article, v: RawVisual): BlogBar[] | null {
  const ix = indexOf(a);
  const wantKind = unitKind(v.unit);
  const wantScale = unitScale(v.unit);
  const items: { label: string; full: string; options: Map<string, Num> }[] = [];
  for (const b of v.bars) {
    if (!Number.isFinite(b.value) || b.value < 0) return null;
    const label = clip(b.label, 40);
    if (!label) continue;
    const value = round(b.value);
    // How this bar can be read: key "kind|scale" (₹|100000 is "₹7.5" meaning ₹7.5 lakh), with a place that writes it so.
    const options = new Map<string, Num>();
    const add = (n: Num, by: number) => {
      if ((wantKind === null || n.kind === wantKind) && (wantScale === null || scale(n.mult) === wantScale)) {
        if (!options.has(`${n.kind}|${by}`)) options.set(`${n.kind}|${by}`, n);
      }
    };
    for (const u of placesNaming(ix, b.label)) {
      for (const n of u.nums) {
        if (n.abs === value) add(n, 1);
        if (n.mult && n.raw === value) add(n, scale(n.mult));
      }
    }
    if (options.size === 0) return null;
    items.push({ label, full: tidy(b.label), options });
  }
  if (items.length === 0) return [];
  // One reading for all: plain amounts before lakh-scaled ones, then ₹, %, plain.
  const order = (k: string) => (k.endsWith("|1") ? 0 : 3) + ["₹", "%", ""].indexOf(k.split("|")[0]);
  const keys = [...items[0].options.keys()].filter((k) => items.every((i) => i.options.has(k))).sort((x, y) => order(x) - order(y));
  if (keys.length === 0) return null;
  const kind = keys[0].split("|")[0] as Kind;
  const bars: BlogBar[] = [];
  for (const i of items) {
    const n = i.options.get(keys[0]) as Num;
    const states = (x: Num) => x.abs === n.abs && x.kind === kind;
    if (contradicted(ix, i.full, states, (x) => x.kind === kind)) return null;
    const same = bars.find((x) => x.label.toLowerCase() === i.label.toLowerCase());
    // The same bar twice is once; one label with two values is no chart.
    if (same) {
      if (same.value !== n.abs) return null;
      continue;
    }
    bars.push({ label: i.label, value: n.abs, display: shown(n) });
  }
  return bars;
}

/** Stat tiles straight from a stat grid's rows, in the article's order. */
function gridStats(d: Dataset): BlogVisual | null {
  const stats = d.rows
    .map(([label, value]) => ({ value: tidy(value), label: clip(label, 48) }))
    .filter((s) => s.label && s.value.length <= 16 && /\d/.test(s.value))
    .slice(0, 4);
  return stats.length < 2 ? null : { kind: "stats", title: clip(d.title, 70), stats };
}

/** "Left out: AJ Cricket Club (Call)." — the rows a chart skips, by name when that fits. */
function leftNote(left: Left[], max: number): string {
  const named = `Left out: ${left.map((l) => `${l.label || "a row with no name"} (${l.cell || "blank"})`).join(", ")}.`;
  if (named.length <= max) return named;
  const counted = `Left out: ${left.length} rows (${[...new Set(left.map((l) => l.cell || "blank"))].join(", ")}).`;
  return counted.length <= max ? counted : `Left out: ${left.length} rows.`;
}

function barsVisual(a: Article, v: RawVisual): BlogVisual | null {
  const d = a.datasets.find((x) => x.n === v.dataset);
  // A count, a price and a rating side by side are stat tiles, never bars on one axis.
  if (d?.source === "stats") return gridStats(d);
  const column = (c: number | null): c is number => d !== undefined && c !== null && Number.isInteger(c) && c >= 0 && c < d.columns.length;
  let drawn: { bars: BlogBar[]; left: Left[] } | null = null;
  let from: Dataset | null = null;
  if (d && column(v.label_column) && column(v.value_column) && v.label_column !== v.value_column) {
    drawn = datasetBars(d, v.label_column, v.value_column, v.unit);
    if (drawn) from = d;
  }
  // No usable dataset or column: the model's own bars, checked against the text.
  if (!drawn && v.bars.length > 0) {
    const bars = textBars(a, v);
    drawn = bars && { bars, left: [] };
  }
  if (!drawn) return null;
  const bars = [...drawn.bars].sort(byValue(v.sort)).slice(0, MAX_BARS);
  if (bars.length < 2) return null;
  let title = clip(v.title, 70) || (from ? clip(from.title, 70) : "From the article");
  let unit = unitOf(v.unit);
  // The model's words must not say the numbers are something else: ratings
  // titled "hourly rates", rupees titled "rating". Then the column names them.
  if (from) {
    const kinds = bars.map((b) => cellKind(b.display));
    const barsKind = kinds.filter((k) => k === "₹").length * 2 > kinds.length ? "₹" : kinds.filter((k) => k === "%").length * 2 > kinds.length ? "%" : "";
    const says = (t: string | null) => {
      const k = unitKind(t);
      if (k === "₹" || k === "%") return k;
      return /\b(ratings?|rated|reviews?|stars?)\b/i.test(t ?? "") ? "rating" : null;
    };
    const clash = (t: string | null) => {
      const k = says(t);
      return k !== null && (k === "rating" ? barsKind !== "" : k !== barsKind);
    };
    if (clash(title)) {
      const header = tidy(from.columns[v.value_column as number]);
      const named = from.title.split(/(?<=\.)\s+/)[0].replace(/\.$/, "");
      title = clip(header ? `${header} (${named})` : named, 70);
    }
    if (clash(unit)) unit = null;
  }

  // What the reader is told about the numbers: their table and column, and any cut.
  const tail: string[] = [];
  if (bars.length < drawn.bars.length) tail.push(`${v.sort === "desc" ? "Highest" : v.sort === "asc" ? "Lowest" : "First"} ${bars.length} of ${drawn.bars.length}.`);
  if (drawn.left.length) tail.push(leftNote(drawn.left, 64));
  const end = tail.length ? ` ${tail.join(" ")}` : "";
  let note: string;
  if (!from) note = `Numbers from the article${end ? `.${end}` : ""}`;
  else {
    const header = clip(from.columns[v.value_column as number], 30);
    const said = `, ${header ? `${header} column` : `column ${(v.value_column as number) + 1}`}.${end}`;
    // Naming the table again under a title that already is its name says nothing.
    const sameAsTitle = title.toLowerCase() === clip(from.title, 70).toLowerCase();
    const room = NOTE_MAX - "From the article: ".length - said.length;
    // A long caption ("Listed per-hour rates on 8 October 2026. Day is ...") is named by its first sentence.
    const named = from.title.split(/(?<=\.)\s+/)[0].replace(/\.$/, "");
    note = !sameAsTitle && room >= 20 ? `From the article: ${bare(clip(named, room))}${said}` : `From the article's table${said}`;
  }
  return { kind: "bars", title, unit, note: clip(note, NOTE_MAX), bars };
}

/** True for a chart whose bars barely differ (under a tenth of the largest): drawn from zero, they look the same. */
export function flatBars(v: BlogVisual | null): boolean {
  if (v?.kind !== "bars" || v.bars.length < 2) return false;
  const values = v.bars.map((b) => b.value);
  const max = Math.max(...values);
  return max > 0 && (max - Math.min(...values)) / max < 0.1;
}

/**
 * For the short version: bars that differ enough to read. Ten ratings
 * between 4.8 and 5.0 drawn from zero look the same, so when the model's
 * column barely varies, the same table's column that varies most
 * (reviews, or the main rate) is drawn instead, when one varies well.
 * A rank or serial column never counts. Else the visual as asked.
 */
export function livelierBars(a: Article, v: RawVisual): RawVisual {
  if (v.kind !== "bars") return v;
  const d = a.datasets.find((x) => x.n === v.dataset);
  const label = v.label_column;
  if (!d || d.source === "stats" || label === null || v.value_column === null) return v;
  const spread = (c: number): number => {
    if (c < 0 || c >= d.columns.length || c === label) return -1;
    const drawn = datasetBars(d, label, c, null);
    if (!drawn || drawn.bars.length < 3) return -1;
    const values = drawn.bars.map((b) => b.value);
    const sorted = [...values].sort((x, y) => x - y);
    // 1, 2, 3 ... is a rank, not a measure.
    if (sorted.every((x, i) => x === i + 1) || /^(#|rank|no\.?|s\.? ?no\.?|position)$/i.test(tidy(d.columns[c]))) return -1;
    const max = sorted[sorted.length - 1];
    return max > 0 ? (max - sorted[0]) / max : -1;
  };
  const now = spread(v.value_column);
  if (now < 0 || now >= 0.1) return v;
  let best = -1;
  let at = -1;
  for (let c = 0; c < d.columns.length; c++) {
    const s = c === v.value_column ? -1 : spread(c);
    if (s > best) [best, at] = [s, c];
  }
  if (at < 0 || best < 0.25) return v;
  const header = tidy(d.columns[at]);
  const named = d.title.split(/(?<=\.)\s+/)[0].replace(/\.$/, "");
  return { ...v, value_column: at, unit: null, sort: "desc", title: clip(header ? `${header} (${named})` : named, 70), bars: [] };
}

function stepsVisual(v: RawVisual): BlogVisual | null {
  const steps = v.steps.map((s) => ({ title: clip(s.title, 60), detail: clip(s.detail, 160) })).filter((s) => s.title);
  if (steps.length < 2) return null;
  return { kind: "steps", title: clip(v.title, 70) || "Step by step", steps: steps.slice(0, 6) };
}

/** A number the article states somewhere as this amount: "₹" must be rupees, "%" a percentage, lakh/crore counted in full. */
const statedSomewhere = (ix: Index, t: Num) => ix.all.some((n) => n.abs === t.abs && (t.kind === "" || n.kind === t.kind));

function compareVisual(a: Article, v: RawVisual): BlogVisual | null {
  const ix = indexOf(a);
  // Columns with a name, up to three; each row keeps its value under each of them.
  const keep = v.columns.map((c, i) => ({ c: clip(c, 40), i })).filter((x) => x.c).slice(0, 3);
  if (keep.length < 2) return null;
  const rows = v.rows
    .filter((r) => r.values.length === v.columns.length)
    // A row with a number the article doesn't state is dropped.
    .filter((r) => keep.every((k) => numbersIn(tidy(r.values[k.i])).every((t) => statedSomewhere(ix, t))))
    .map((r) => ({ label: clip(r.label, 40), values: keep.map((k) => clip(r.values[k.i], 80)) }))
    .filter((r) => r.label);
  if (rows.length < 2) return null;
  const columns = keep.map((k) => k.c);
  return { kind: "compare", title: clip(v.title, 70) || columns.join(" vs "), columns, rows: rows.slice(0, 8) };
}

/**
 * A tile stands when each number in it is stated where its label is
 * (a lakh, crore or k amount in full: "₹3 crore" needs 3 crore, not a
 * 3), and a lone number isn't contradicted by the tile or cell naming it.
 */
function tileStands(ix: Index, label: string, value: string): boolean {
  const nums = numbersIn(value);
  if (nums.length === 0) return false;
  const near = placesNaming(ix, label);
  return nums.every((t) => {
    const sameKind = (n: Num) => t.kind === "" || n.kind === t.kind;
    const states = (n: Num) => n.abs === t.abs && sameKind(n);
    if (!near.some((u) => u.nums.some(states))) return false;
    // "30 of 83": its numbers play different parts, so only a lone number is held to its tile.
    return nums.length > 1 || !contradicted(ix, label, states, sameKind);
  });
}

function statsVisual(a: Article, v: RawVisual): BlogVisual | null {
  const ix = indexOf(a);
  const stats = v.stats
    .map((s) => ({ value: tidy(s.value), label: clip(s.label, 48), full: tidy(s.label) }))
    // A cut-off number would be wrong, so long values go.
    .filter((s) => s.label && s.value.length <= 16 && /\d/.test(s.value) && tileStands(ix, s.full, s.value))
    .map(({ value, label }) => ({ value, label }));
  if (stats.length < 2) return null;
  return { kind: "stats", title: clip(v.title, 70) || "Key numbers", stats: stats.slice(0, 4) };
}

function artVisual(v: RawVisual, signArt: (brief: string, alt: string) => string | null): BlogVisual | null {
  const brief = clip(v.art_brief, 900);
  if (!brief) return null;
  const alt = tidy(v.alt) ? clip(v.alt, 200) : clip(brief, 160);
  const token = signArt(brief, alt);
  if (!token) return null;
  return { kind: "art", title: clip(v.title, 70) || "Illustration", alt, token };
}

/** What the reader is shown for the model's visual, or null when it isn't one we can stand behind. */
export function buildVisual(a: Article, v: RawVisual, signArt: (brief: string, alt: string) => string | null): BlogVisual | null {
  switch (v.kind) {
    case "bars":
      return barsVisual(a, v);
    case "steps":
      return stepsVisual(v);
    case "compare":
      return compareVisual(a, v);
    case "stats":
      return statsVisual(a, v);
    case "art":
      return artVisual(v, signArt);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// The model's numbers back to our sections, links and venues

function pick<T extends { n: number }>(list: T[], ns: number[], max: number, same: (x: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const n of ns) {
    const hit = list.find((x) => x.n === n);
    if (!hit || seen.has(same(hit))) continue;
    seen.add(same(hit));
    out.push(hit);
    if (out.length === max) break;
  }
  return out;
}

/** The sections the model cited (its first `max`, unknown numbers dropped), in the article's order. */
export function pickSections(a: Article, ns: number[], max = 4): BlogSection[] {
  return pick(a.sections, ns, max, (s) => String(s.n))
    .sort((x, y) => x.n - y.n)
    .map((s) => ({ ...s }));
}

const sectionMemo = new WeakMap<Article, string[]>();

/**
 * Each section's text, by S number, as the model reads it: its prose,
 * cards and FAQ, and the rows of the tables and tiles placed in it.
 */
function sectionTexts(a: Article): string[] {
  const hit = sectionMemo.get(a);
  if (hit) return hit;
  // The body ends where the lists after it start.
  const body = a.prompt.split(/\n\n(?=DATASETS \(|SOURCES THE ARTICLE CITES\n|VENUES IN THE ARTICLE\n)/)[0];
  const texts = a.sections.map(() => "");
  let at = -1;
  for (const line of body.split("\n")) {
    const head = /^\[S(\d+)\] /.exec(line);
    if (head) at = Number(head[1]);
    if (at < 0 || at >= texts.length) continue;
    const parts = [line];
    for (const m of line.matchAll(/\[D(\d+)\]/g)) {
      const d = a.datasets.find((x) => x.n === Number(m[1]));
      if (d) parts.push(d.columns.join(" "), ...d.rows.map((r) => r.join(" ")));
    }
    texts[at] += `${parts.join("\n")}\n`;
  }
  sectionMemo.set(a, texts);
  return texts;
}

// Numbers worth tracing to a section: amounts, and figures of three digits or more.
const TRACE = /(₹\s?)?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)/g;
const plain = (s: string) => s.replace(/(\d),(?=\d)/g, "$1");

/**
 * Sections to cite that the model left out: for each claim (a point or
 * the answer), a section that alone holds one of its amounts or venues.
 * A number or venue found in two or more sections says nothing about
 * where the claim came from, so it adds none. In the article's order,
 * none already in `cited`, at most `room`.
 */
export function backingSections(a: Article, claims: string[], cited: number[], room: number): number[] {
  if (room <= 0) return [];
  const texts = sectionTexts(a).map((t) => ` ${plain(t).toLowerCase()} `);
  const holders = (needle: RegExp) => texts.flatMap((t, n) => (needle.test(t) ? [n] : []));
  const found = new Set<number>();
  for (const claim of claims) {
    const c = plain(claim);
    for (const m of c.matchAll(TRACE)) {
      const digits = m[2];
      // "6" or "24" is in every other section; an amount or a longer figure isn't.
      if (!m[1] && digits.replace(".", "").length < 3) continue;
      // A bare 2026 is a year; ₹2,000 is an amount.
      if (!m[1] && /^(19|20)\d\d$/.test(digits)) continue;
      const at = holders(new RegExp(`(?<![\\d.])${digits.replace(".", "\\.")}(?![\\d]|\\.\\d)`));
      if (at.length === 1) found.add(at[0]);
    }
    // By full or short name only: "night" is not Night Riders here.
    for (const v of turfsNamed(a.turfs, claim, { strict: true })) {
      const at = holders(new RegExp(`\\[v${v.n}\\]`));
      if (at.length === 1) found.add(at[0]);
    }
  }
  return [...found].filter((n) => !cited.includes(n)).sort((x, y) => x - y).slice(0, room);
}

export function pickSources(a: Article, ns: number[]): BlogLink[] {
  return pick(a.sources, ns, 4, (s) => s.url).map(({ label, url, host }) => ({ label, url, host }));
}

export function pickTurfs(a: Article, ns: number[]): BlogTurf[] {
  return pick(a.turfs, ns, 6, (t) => t.id).map(({ id, name, area }) => ({ id, name, area }));
}

// Words too common to tell one venue from another on their own.
const VENUE_WORDS = new Set("the box cricket turf turfs sports sport arena arenas club ground grounds cafe and football court courts zone hub park play".split(" "));

/**
 * The venues of `turfs` that `text` (the answer, its points and its
 * visual) actually names, so a card is never linked for a venue the
 * reader wasn't told about. A venue is named by its full name, the part
 * before a bracket or dash ("AJ Cricket Club" for "AJ Cricket Club (Box
 * Cricket)"), or its first word when that word is its own ("NexGen").
 * strict: the first word doesn't count, for text that names no venue on
 * purpose ("play at night" would be Night Riders).
 */
export function turfsNamed<T extends BlogTurf>(turfs: T[], text: string, opts: { strict?: boolean } = {}): T[] {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const has = (s: string) => {
    const k = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return k.length >= 3 && t.includes(` ${k} `);
  };
  return turfs.filter((v) => {
    const name = tidy(v.name);
    const short = name.split(/\s*[([]|\s+[–—-]\s+/)[0];
    const first = short.split(/\s+/)[0] ?? "";
    return has(name) || has(short) || (!opts.strict && first.length >= 4 && !VENUE_WORDS.has(first.toLowerCase()) && has(first));
  });
}

/** Follow-up chips: short, distinct, not the question just asked, two at most. */
export function cleanFollowups(list: string[], asked: string): string[] {
  const key = (s: string) => tidy(s).toLowerCase().replace(/[\s?.!]+$/, "");
  const seen = new Set([key(asked)]);
  const out: string[] = [];
  for (const raw of list) {
    const q = tidy(raw);
    const k = key(q);
    if (!k || q.length > 60 || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length === 2) break;
  }
  return out;
}

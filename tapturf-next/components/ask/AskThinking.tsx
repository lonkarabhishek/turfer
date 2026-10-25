"use client";

import { useEffect, useEffectEvent, useState, type CSSProperties } from "react";
import { useAsk } from "./AskProvider";
import { SPORT_PAGES, type SportPage } from "@/lib/sports";
import { CITIES, CITY_ALIASES, getCityPref, labelFor } from "@/lib/city";
import { isSummaryAsk, looksLikeSearch } from "@/lib/ask/blog";

/** What the reply will show under its text, so the placeholders take the same shape. */
export type CardsKind = "turf" | "game" | "compare";

type Stage = { at: number; text: string; say?: boolean };
export type ThinkingPlan = { stages: Stage[]; cards: CardsKind | null };

const SHOW = 250; // ms: a reply quicker than this never sees the loader
const CARDS = 1200; // ms: placeholder cards appear
const AT = { read: 0, search: 700, check: 2000, pick: 4000, slow: 9000 };
const SLOW = "Taking a little longer than usual. Still on it.";
const LINE = 42; // characters: longer status lines drop their least useful part (43 can wrap at 360px)

// ── A light reading of the message, in the player's own words ──────
// The server reads it properly; this only picks which status lines to
// show, so a miss just means a plainer line.

const SPORTS: [string, SportPage][] = (() => {
  const m = new Map<string, SportPage>();
  for (const s of SPORT_PAGES) for (const l of s.labels) m.set(l.toLowerCase(), s);
  for (const s of SPORT_PAGES) m.set(s.name.toLowerCase(), s);
  const alias: [string, string][] = [["soccer", "football"], ["box", "box-cricket"], ["nets", "cricket-nets"], ["net practice", "cricket-nets"], ["pickle ball", "pickleball"], ["frisbee", "ultimate-frisbee"], ["swim", "swimming"], ["pool", "swimming"], ["shuttle", "badminton"]];
  for (const [w, slug] of alias) {
    const s = SPORT_PAGES.find((p) => p.slug === slug);
    if (s && !m.has(w)) m.set(w, s);
  }
  // Longest first, so "box cricket" wins over "cricket".
  return [...m].sort((a, b) => b[0].length - a[0].length);
})();

const CITY_WORDS: [string, string][] = [
  ...CITIES.flatMap((c) => [[c.label.toLowerCase(), c.id] as [string, string], [c.id, c.id] as [string, string]]),
  ...Object.entries(CITY_ALIASES),
].sort((a, b) => b[0].length - a[0].length);

// Never an area: little words, times, prices, sports and asks.
const STOP = new Set(
  (
    "a an the my me our your this that these those it its one next coming here there near nearby around area city town side " +
    "today tonight tomorrow aaj aj kal raat rat shaam sham subah morning afternoon evening night late weekend weekday week day " +
    "monday tuesday wednesday thursday friday saturday sunday under below less within upto up budget cheap cheaper cheapest sasta saste sasti " +
    "affordable low price prices rate rates rs inr rupees turf turfs ground grounds court courts venue venues arena game games match matches " +
    "team teams player players with without for and or of to at by from on in which what where who how is are was any some all good best " +
    "top popular nice great hai hain kya koi ka ki ke me mein mai main madhe madhye mey wala wali wale accha acha achha mast bata batao " +
    "parking floodlights lights covered indoor outdoor open play playing khelna khelne find show book booking want need looking search " +
    "suggest recommend get give tell help please pls plz can could you i we us list available slot slots hour hours per " +
    // Fillers that sit next to a place: "bhai Baner me", "in Baner bro", "8 baje Kharadi me", "in front of".
    "bhai bhaiya bro dude boss yaar yar ji sir mujhe mereko humko chahiye chaiye chahie baje asap now abhi jaldi urgent only just also front"
  ).split(" "),
);
const POST = new Set(["me", "mein", "mai", "mey", "madhe", "madhye"]);

const word = (w: string | undefined) => !!w && /^[a-z]{3,}$/.test(w) && !STOP.has(w) && !SPORTS.some(([p]) => p === w) && !CITY_WORDS.some(([p]) => p === w);
const title = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

/** "in Kothrud", "near Baner Road", "Kothrud me", "Baner ke paas", "Kothrud javal". */
function areaIn(t: string[]): { name: string; near: boolean } | null {
  for (let i = 0; i < t.length; i++) {
    const w = t[i];
    if (w === "in" || w === "near" || w === "around" || w === "nr") {
      if (!word(t[i + 1])) continue;
      const two = word(t[i + 2]) || (/^(sector|phase|block)$/.test(t[i + 1]) && /^\d{1,3}$/.test(t[i + 2] ?? ""));
      return { name: title(two ? `${t[i + 1]} ${t[i + 2]}` : t[i + 1]), near: w !== "in" };
    }
    // "turf ke paas parking hai" is the turf's own parking: the word before "ke" must be a place.
    const back = POST.has(w) ? i - 1 : (w === "paas" || w === "pass") && t[i - 1] === "ke" ? i - 2 : w === "javal" ? (t[i - 1] === "ke" ? i - 2 : i - 1) : -1;
    if (back >= 0 && word(t[back])) {
      return { name: title(word(t[back - 1]) ? `${t[back - 1]} ${t[back]}` : t[back]), near: !POST.has(w) };
    }
  }
  return null;
}

function priceIn(q: string): { cheap: boolean; max: number | null } {
  const m =
    /(?:under|below|less than|within|upto|up to|max|budget|<)\s*(?:rs|₹|inr)?\s*(\d+)(k)?\b/.exec(q) ??
    /(?:rs|₹|inr)\s*(\d+)(k)?\b/.exec(q) ??
    /\b(\d+)(k)?\s*(?:rs|rupees|₹)?\s*(?:se kam|tak|ke andar|ke niche|paryant)\b/.exec(q);
  const n = m ? Number(m[1]) * (m[2] ? 1000 : 1) : NaN;
  return {
    cheap: /\b(cheap|cheaper|cheapest|budget|affordable|sasta|saste|sasti|swasta|kam paise|kam price|economical|value for money)\b/.test(q),
    max: n >= 100 && n <= 50000 ? n : null,
  };
}

function whenIn(q: string): string | null {
  if (/\b(tonight|aaj raat|aj raat)\b/.test(q)) return "for tonight";
  if (/\b(tomorrow|kal|udya)\b/.test(q)) return "for tomorrow";
  if (/\b(weekend|weekends)\b/.test(q)) return "this weekend";
  const day = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(q);
  if (day) return `on ${title(day[1])}`;
  if (/\b(today|aaj|aj)\b/.test(q)) return "for today";
  if (/\b(morning|subah|sakali)\b/.test(q)) return "for the morning";
  if (/\b(evening|shaam|sham)\b/.test(q)) return "for the evening";
  return null;
}

const LATE = /\b(midnight|late night|after midnight|24x7|24 hours|all night|[1-4] ?am)\b/;
const EVENING = /\b(tonight|evening|night|raat|shaam|sham|sandhyakali|(?:[5-9]|1[01]) ?pm)\b/;
const NEEDS: [RegExp, string][] = [
  [/\b(flood ?lights?|lights|night match)\b/, "Checking which ones have floodlights"],
  [/\bparking\b/, "Checking which ones have parking"],
  [/\b(covered|indoor|roof|rain)\b/, "Checking which ones are covered"],
  [/\b(washrooms?|toilets?|restrooms?)\b/, "Checking which ones have washrooms"],
  [/\bchanging rooms?\b/, "Checking which ones have changing rooms"],
  [/\b(cafeteria|canteen|cafe|food)\b/, "Checking which ones have a cafeteria"],
  [/\b(equipment|kit|bat and ball)\b/, "Checking which ones provide equipment"],
];
const TOOLS: [RegExp, string][] = [
  [/\b(nrr|net run ?rate)\b/, "Finding the NRR calculator"],
  [/\b(toss|coin flip|flip a coin|heads or tails)\b/, "Finding the cricket toss tool"],
  [/\b(score ?card|result card)\b/, "Finding the scorecard maker"],
  [/\b(points table|tournament scorer|league table|track (?:our|my) tournament)\b/, "Finding the tournament scorer"],
  [/\b(team generator|(?:make|divide|split|pick|random|balanced) (?:\w+ )?(?:into )?(?:two )?teams|teams? banao)\b/, "Finding the team generator"],
];
const GREETING = /^(hi+|hey+|hello+|helo|yo|namaste|namaskar|thanks?|thank you|thx|ty|ok|okay|cool|alright|got it|good (?:morning|afternoon|evening|night)|help|what can you do|who are you|how does this work)( (?:there|tapturf|bro|bhai|ji))?$/;
const HOST = /^(host|create|organi[sz]e|set up|setup|start|plan)\b.*\b(game|match)\b/;
const GAME = /\b(games?|match|matches|pickup|join)\b/;
const VENUE = /\b(turfs?|grounds?|courts?|venues?|book|booking)\b/;
const QUESTION = /^(what|whats|does|do|is|are|can|how|when|where|who|kya|kitna|kitne|kaisa|kaise|kab|kahan|kaha)\b|\b(kya hai|hai kya|it|this one|here|yahan|iska|iski|iske)\b/;
// Not a name: "these two", "turfs in Powai". "Turf Park" is one.
const GENERIC = /^(?:(?:two|2|both|them|these|those|the|top|first|it|this)\b|(?:turfs?|venues?|grounds?)(?:$|\s+(?:in|near|at|around|for|with|of)\b))/i;
const BOTH = /\b(these|those|them|both|top|two|2|first|second|1st|2nd|above)\b/;
// On an article: asking for a chart, or for a picture (prefixes, so "charts", "comparison", "drawing", "illustrate").
const CHART = /\b(chart|graph|plot|visual|numbers|compar)/;
const DRAW = /\b(draw|diagram|picture|illustrat|show me|layout|sketch)/;

/** "Hotfut vs Arena32", "compare Hotfut and Arena32", "Hotfut or Arena32, which is better". */
function compareNames(raw: string): string[] {
  const s = raw.replace(/[?!.,]+\s*$/, "").replace(/\s+/g, " ").trim();
  let parts = s.split(/\s+(?:vs\.?|versus|v\/s|or)\s+/i);
  if (parts.length !== 2) {
    const m = /^(?:compare|comparison)\s+(?:between\s+)?(.+?)(?:\s+(?:and|with|&|aur)\s+(.+))?$/i.exec(s);
    parts = m ? [m[1], m[2] ?? ""] : [];
  }
  const a = (parts[0] ?? "")
    .replace(/^(?:(?:compare|comparison)\s+)?(?:between\s+)?(?:(?:it|this(?: one)?)\s+)?(?:with\s+)?/i, "")
    // "what is better X", "which one is better X", "should I go X", "Is X better": just X.
    .replace(/^(?:(?:what|whats|which|one|is|are|should|shall|would|can|do|does|kya)\s+)+(?:(?:i|we)\s+)?(?:(?:go|play)\s+(?:to\s+|at\s+)?)?(?:(?:is|are)\s+)?(?:better\s+)?/i, "")
    .replace(/\s+(?:is\s+)?better$/i, "")
    .split(" ")
    .slice(-3)
    .join(" ");
  const b = (parts[1] ?? "").split(/\s+(?:for|in|which|kaunsa|konsa|kya|better|,)\b/i)[0].split(" ").slice(0, 3).join(" ");
  // Not a venue: "football vs cricket", "Pune or Mumbai", "morning or evening".
  const plain = (w: string) => STOP.has(w) || SPORTS.some(([p]) => p === w) || CITY_WORDS.some(([p]) => p === w);
  const ok = (n: string) => /^[\p{L}\p{N}][\p{L}\p{N}'&\- ]{1,23}$/u.test(n) && !GENERIC.test(n) && !SPORTS.some(([p]) => p === n.toLowerCase()) && !n.toLowerCase().split(" ").every(plain);
  return [a, b].filter(ok).map((n) => n.split(" ").map((w) => (/^\p{Ll}+\d*$/u.test(w) ? title(w) : w)).join(" "));
}

/** The first of these that fits on one line on a phone. */
const fit = (...lines: string[]) => lines.find((l) => l.length <= LINE) ?? lines[lines.length - 1];
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" ");

/**
 * Status lines for one message, from its words and the page it was
 * sent from: reading it, what we are searching for, one relevant check,
 * then picking. Each line only says what the server really does for
 * that kind of question; venue names only ever come from the player.
 */
export function thinkingPlan(text: string, ctx: { city: string | null; turf: string | null; located: boolean; retry?: boolean; blog?: boolean }): ThinkingPlan {
  const q = ` ${text.toLowerCase().replace(/(\d),(\d)/g, "$1$2").replace(/24\s*[x/]\s*7/g, "24x7").replace(/[^\p{L}\p{M}\p{N}₹\s]+/gu, " ").replace(/\s+/g, " ").trim()} `;
  const t = q.trim().split(" ");
  const read: Stage = { at: AT.read, text: ctx.retry ? "Trying again" : "Reading your question" };
  const slow: Stage = { at: AT.slow, text: SLOW, say: true };
  const plan = (cards: CardsKind | null, search?: string | null, check?: string | null, pick?: string | null): ThinkingPlan => ({
    cards,
    stages: [
      read,
      ...(search ? [{ at: AT.search, text: search, say: true }] : []),
      ...(check ? [{ at: AT.check, text: check }] : []),
      ...(pick ? [{ at: AT.pick, text: pick }] : []),
      slow,
    ],
  });

  const bare = q.trim();
  const asked = QUESTION.test(bare) || /\?\s*$/.test(text);
  if (GREETING.test(bare)) return { cards: null, stages: [{ ...read, text: ctx.retry ? read.text : "Reading your message" }, slow] };
  // On an article every message goes to the article first (lib/ai/blogAnswer.ts), so the lines say that.
  // No placeholder cards: the answer may be words, a chart, a picture, or a search after all.
  // A plain search that doesn't point at the article ("box cricket near me tonight") goes on to search, so it gets the search lines.
  if (ctx.blog && !looksLikeSearch(text)) {
    if (isSummaryAsk(text)) return plan(null, "Reading the article", "Picking out the key points", "Writing the short version");
    if (CHART.test(q)) return plan(null, "Reading the article", "Pulling the numbers from it", "Drawing the chart");
    if (DRAW.test(q)) return plan(null, "Reading the article", "Working out the picture", "Putting it together");
    return plan(null, "Reading the article", "Finding the part that answers this", "Writing your answer");
  }
  for (const [re, line] of TOOLS) if (re.test(q)) return plan(null, line);
  if (HOST.test(bare)) return plan(null);

  const sport = SPORTS.find(([p]) => q.includes(` ${p} `))?.[1] ?? null;
  const said = CITY_WORDS.find(([p]) => q.includes(` ${p} `))?.[1] ?? null;
  const area = areaIn(t);
  const near = /\b(near me|near to me|nearby|near by|nearest|around me|close to me|close by|aas ?paas|mere paas|paas (?:me|mein|mai)|najeek|nazdeek|idhar|majhya javal|mazya javal)\b/.test(q) && !area?.near;
  const price = priceIn(q);
  const when = whenIn(q);
  const need = NEEDS.find(([re]) => re.test(q))?.[1] ?? null;
  const late = LATE.test(q);
  const evening = EVENING.test(q);
  const pageCity = ctx.city ? labelFor(ctx.city) : null;

  // Two venues side by side.
  if (/\b(vs|versus|v s|compare|comparison)\b/.test(q) || (/ or /.test(q) && /\b(better|kaunsa|konsa|which one)\b/.test(q))) {
    let names = compareNames(text);
    if (names.length === 1 && ctx.turf && ctx.turf.toLowerCase() !== names[0].toLowerCase()) names = [ctx.turf, names[0]];
    // Two names, or "compare these two" / "the top 2" (the venues just shown).
    if (names.length === 2 || BOTH.test(q)) {
      const both = names.length === 2 ? `Pulling up ${names[0]} and ${names[1]} side by side` : "";
      return plan("compare", both && both.length <= LINE ? both : "Pulling up both venues side by side", "Lining up prices, timings and reviews", "Putting the comparison together");
    }
    // Two sports, two places or one name: no two venues to line up, so none promised.
    return plan(null, null, null, "Putting your answer together");
  }

  // "Near you" only once we have their location: before that the server can't search near them.
  const placeSaid = area ? `${area.near ? "near" : "in"} ${area.name}` : said ? `in ${labelFor(said)}` : near && ctx.located ? "near you" : null;
  const where = placeSaid ?? (near ? null : pageCity ? `in ${pageCity}` : null);

  // Open games to join.
  if (GAME.test(q) && !VENUE.test(q)) {
    const what = sport ? `open ${sport.name.toLowerCase()} games` : "open games";
    // "games tonight", "games in the morning", not "games for tonight".
    const day = when?.replace(/^for (the )?/, (_, the?: string) => (the ? "in the " : ""));
    return plan(
      "game",
      fit(join("Looking for", what, where, day), join("Looking for", what, placeSaid, day), join("Looking for", what, day), join("Looking for", what, where), join("Looking for", what)),
      price.max ? `Checking prices per player under ₹${price.max.toLocaleString("en-IN")}` : "Checking dates and timings",
      "Picking the best matches",
    );
  }

  // A question about the venue on screen ("does it have parking?").
  if (ctx.turf && !sport && !area && !said && asked) {
    const topic = price.max || price.cheap || /\b(price|prices|rate|rates|cost|charges?|kitna|kitne|fees?)\b/.test(q)
      ? "Checking its prices"
      : /\b(timings?|open|close|closing|opening|hours|kab)\b/.test(q)
        ? "Checking its timings"
        : need
          ? "Checking its facilities"
          : "Going through its details and reviews";
    return plan(null, fit(`Looking up ${ctx.turf}`, "Looking up this venue"), topic, "Putting your answer together");
  }

  const heard = sport || area || said || near || price.cheap || price.max || when || need || late || evening;
  if (!heard && asked) return plan(null, "Looking through our turf list", "Checking the details", "Putting your answer together");

  const venues = sport ? `${sport.name.toLowerCase()} ${sport.venue}s` : "turfs";
  const what = price.cheap ? `affordable ${venues}` : venues;
  const search = heard
    ? fit(join("Looking for", what, where, when), join("Looking for", what, placeSaid, when), join("Looking for", what, where), join("Looking for", what))
    : where
      ? `Searching turfs ${where}`
      : "Searching our turf list";
  const check = price.max
    ? `Comparing prices under ₹${price.max.toLocaleString("en-IN")}`
    : price.cheap
      ? "Comparing prices"
      : late
        ? "Checking which ones are open all night"
        : need
          ? need
          : evening
            ? "Checking which ones have floodlights"
            : "Checking ratings and reviews";
  return plan("turf", search, check, "Picking the best matches");
}

// ── Placeholders in the shape of the cards the reply brings ──────

const delay = (i: number) => ({ "--ask-d": `${i * 140}ms` }) as CSSProperties;
const Bar = ({ className }: { className: string }) => <span className={`ask-skel block rounded-full ${className}`} />;

function TurfBone({ i }: { i: number }) {
  return (
    <div className="shrink-0 w-[196px] sm:w-[208px] rounded-2xl bg-white border border-primary-100 shadow-soft overflow-hidden" style={delay(i)}>
      <div className="ask-skel aspect-[4/3]" />
      <div className="p-3">
        <div className="h-[17.5px] flex items-center"><Bar className="h-3 w-[72%]" /></div>
        <div className="mt-0.5 h-[18px] flex items-center"><Bar className="h-2.5 w-[50%]" /></div>
        <div className="mt-1.5 h-[18px] flex items-center"><Bar className="h-2.5 w-[34%]" /></div>
      </div>
    </div>
  );
}

// GameMiniCard's rows are inline boxes, so their gaps run a little wider than their margins.
function GameBone({ i }: { i: number }) {
  return (
    <div className="shrink-0 w-[248px] rounded-2xl bg-white border border-primary-100 shadow-soft px-3.5 pt-3.5 pb-[18.5px]" style={delay(i)}>
      <div className="h-5 flex items-center justify-between"><Bar className="h-2.5 w-16" /><Bar className="h-5 w-[72px]" /></div>
      <div className="mt-1.5 h-[17.5px] flex items-center"><Bar className="h-3 w-[70%]" /></div>
      <div className="mt-[6.5px] h-[18px] flex items-center"><Bar className="h-2.5 w-[60%]" /></div>
      <div className="mt-[9px] h-[18px] flex items-center"><Bar className="h-2.5 w-[45%]" /></div>
      <div className="mt-[11px] h-[18px] flex items-center"><Bar className="h-2.5 w-[35%]" /></div>
    </div>
  );
}

/** Filter chips and a row of cards for a search, or the verdict and table for a comparison. */
export function AskSkeleton({ kind, className = "" }: { kind: CardsKind; className?: string }) {
  if (kind === "compare") {
    return (
      <div data-skel className={`mt-2.5 ${className}`} aria-hidden>
        <div className="rounded-2xl bg-primary-50 px-4 py-3 mb-3" style={delay(0)}>
          {["w-[94%]", "w-[86%]", "w-[48%]"].map((wd) => (
            <div key={wd} className="h-[24.4px] flex items-center"><Bar className={`h-3 ${wd}`} /></div>
          ))}
        </div>
        {/* The header, the 6 to 9 rows the server asks for (values wrap to two lines on phones), then Best for. */}
        <div className="rounded-2xl border border-primary-100 bg-white overflow-hidden" style={delay(1)}>
          <div className="h-9 px-3 flex items-center gap-4 bg-primary-50">
            <span className="w-14" />
            <Bar className="h-2.5 flex-1" />
            <Bar className="h-2.5 flex-1" />
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
            <div key={r} className="h-14 px-3 pt-3 flex items-start gap-4 border-t border-primary-100">
              <Bar className="h-2.5 w-14" />
              {[0, 1].map((c) => (
                <span key={c} className="flex-1 space-y-2">
                  <Bar className="h-2.5 w-full" />
                  <Bar className="h-2.5 w-[60%]" />
                </span>
              ))}
            </div>
          ))}
          <div className="h-10 px-3 flex items-center gap-4 border-t border-primary-100 bg-primary-50/60">
            <Bar className="h-2.5 w-14" />
            <Bar className="h-2.5 flex-1" />
            <Bar className="h-2.5 flex-1" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-skel className={`mt-2.5 ${className}`} aria-hidden>
      <div className="flex gap-1.5 mb-2.5">
        <Bar className="h-6 w-16" />
        <Bar className="h-6 w-[88px]" />
        <Bar className="h-6 w-14" />
      </div>
      <div className="-mx-4 px-4 flex gap-3 overflow-hidden pb-1">
        {(kind === "game" ? [0, 1] : [0, 1, 2]).map((i) => (kind === "game" ? <GameBone key={i} i={i} /> : <TurfBone key={i} i={i} />))}
      </div>
    </div>
  );
}

// ── The loader ─────────────────────────────────────────────────────

/**
 * Shown while a reply is on its way. Nothing for the first quarter
 * second (quick answers never flash it), then the tennis ball that will
 * type the reply hops beside a status line that moves on through the
 * plan, and placeholder cards hold the space the answer will fill.
 * Timed from when the message went out, so a reopened panel picks up
 * where it was and a line never repeats. Screen readers hear only the
 * search line and the slow notice, through the thread's live region.
 */
export function AskThinking({ text, since, retry = false, onCards }: { text: string; since: number; retry?: boolean; onCards?: () => void }) {
  const { pageContext, hasLocation } = useAsk();
  const [plan] = useState(() => thinkingPlan(text, { city: pageContext.city ?? getCityPref(), turf: pageContext.turf?.name ?? null, located: hasLocation, retry, blog: !!pageContext.blog }));
  const [elapsed, setElapsed] = useState(() => Date.now() - since);
  const cardsShown = useEffectEvent(() => onCards?.());

  useEffect(() => {
    const marks = [SHOW, CARDS, ...plan.stages.map((s) => s.at)];
    const next = Math.min(...marks.filter((m) => m > elapsed));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => setElapsed(Math.max(next, Date.now() - since)), next - elapsed);
    return () => clearTimeout(id);
  }, [elapsed, since, plan]);

  const cards = plan.cards && elapsed >= CARDS ? plan.cards : null;
  useEffect(() => {
    if (cards) cardsShown();
  }, [cards]);

  let on = 0;
  plan.stages.forEach((s, i) => {
    if (s.at <= elapsed) on = i;
  });
  const said = plan.stages.slice(0, on + 1).filter((s) => s.say).pop();

  return (
    <div className={elapsed >= SHOW ? "ask-think-in" : "ask-think-wait"}>
      <div className="flex items-start gap-2.5 text-[14px] leading-[22px] text-primary-500">
        <span className="ask-think-ball" aria-hidden>
          <span className="ask-ball">
            <i />
          </span>
        </span>
        {/* Every line sits in one cell, so the height never changes as they swap. */}
        <span className="grid min-w-0 flex-1" aria-hidden>
          {plan.stages.map((s, i) => (
            <span key={s.at} className="ask-think-line" data-on={i === on ? "" : undefined} data-past={i < on ? "" : undefined}>
              {s.text}
            </span>
          ))}
        </span>
      </div>
      <span className="sr-only">{said?.text}</span>
      {cards && <AskSkeleton kind={cards} className="ask-reveal" />}
    </div>
  );
}

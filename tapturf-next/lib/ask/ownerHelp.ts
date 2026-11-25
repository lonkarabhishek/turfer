import { findNamedVenues, type VenueMatch } from "../ai/names";
import { CITIES, CITY_ALIASES, labelFor } from "../city";
import { claimOwnerUrl } from "../my/claimFlow";
import { areaFor } from "../utils/area";
import { cleanVenueName } from "../utils/bookingApps";
import type { Turf } from "../../types/turf";

// Relative imports only, so npm run test:ask runs this (lib/ask/ownerHelp.test.ts).

/**
 * Ask TapTurf for turf owners: "claim my turf page", "how do I list my
 * venue", "how long does verification take", "mera turf list karna hai".
 * The route (app/api/ask/route.ts) answers these from the words here,
 * before any reading and never by the model, which made a process up (a
 * "claim form with venue details", "a few working days": asks of 16 Nov
 * 2026). Every sentence says what myTapturf does (components/my/MyHome.tsx,
 * lib/my/claimFlow.ts, lib/my/turfTabs.ts); change those and change these.
 *
 * A player's search never comes here: "claimed turfs in Pune", "who owns X
 * turf", "list of turfs near me", "what does verified mean" and "owner's
 * number of X" are theirs (ownerAsk returns null).
 */

export type OwnerKind = "claim" | "list" | "not_listed" | "time" | "verify" | "manage" | "cost";

/** The page owners use, as a reply says it and as its button opens it. */
export const MY_URL = "/my";
export const MY_SAID = "tapturf.in/my";
export const TEAM_EMAIL = "info@tapturf.in";

// ── The words ───────────────────────────────────────────────────────────

/** Lower case, no apostrophes ("I'm" is "im"), "tap turf" as one word. */
export const ownerNorm = (q: string) =>
  q
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\btap turf\b/g, "tapturf")
    .replace(/\bmy tapturf\b(?!\s+(?:account|profile|games?|bookings?|requests?|password|number|email|id)\b)/g, "mytapturf")
    .trim();

const NOUN = "(?:turfs?|truf|venues?|grounds?|academy|academies|arenas?|courts?|club|facility|pitch|maidan|property)";
const MINE = "(?:my|our|mera|meri|mere|hamara|hamari|humara|humari|apna|apni|apne|maza|mazi|majha|majhi|aamcha|amcha)";
/** Words between "my" and the turf: "my new box cricket turf". */
const GAP = "(?:(?:new|own|box|cricket|football|futsal|sports?|pickleball|badminton|multi|multisport|small|second|is|ye|yeh)\\s+)";
/** "my turf", "our sports academy", "mera ground", "my turf page", "my listing". */
const MY_NOUN = `${MINE}\\s+${GAP}{0,3}(?:${NOUN}(?:\\s+(?:page|listing|profile))?|(?:tapturf|business)\\s+(?:page|listing)|listing)`;
const DET = "(?:(?:the|a|an|this|new|own|one)\\s+)";
const re = (s: string, f = "") => new RegExp(s, f);
const HAS_NOUN = re(`\\b${NOUN}\\b`);
const HAS_MY_NOUN = re(`\\b${MY_NOUN}\\b`);

/** Someone else's turf: "who owns X", "owner ka number", "contact the owner". */
const ABOUT_AN_OWNER =
  /\b(?:who|whos|whose|kaun|kon|kiska|kiski)\b|\bowners?\s+(?:ka\s+|ki\s+|ke\s+)?(?:number|no|contact|phone|name|naam|whatsapp|mobile|details)\b|\b(?:contact|call|number of|name of|talk to|speak to|reach|message|whatsapp)\s+(?:the\s+|its\s+)?(?:\w+\s+)?owner/;
/** What a mark means, or a search by it: lib/ai/quick.ts and the reading answer those. */
const MEANING = /\bwhat\s+(?:is|does|are|do)\b|\bmeaning\b|\bmatlab\b|\bmeans?\b/;
const SEARCHING = /\b(?:find|show|search|dikhao|dikha|batao|list of|near|nearby|nearest|paas|how many|kitne|which|konsa|kaunsa|best|top)\b/;
const HOW = /\b(?:how|kaise|kese|kaisa|kasa|kashi|kab|steps?|process|procedure|tarika)\b/;
/** A player's account, not a turf: "verify my phone", "blue tick". */
const ACCOUNT = /\b(?:phone|number|email|otp|mobile|account|profile|blue tick|tick|sim|password|username)\b/;
/** A game or a tournament, not a listing: "register my academy for the tournament", "add me to the game". */
const PLAYING = /\b(?:tournaments?|leagues?|match|matches|games?|teams?|players?|favou?rites?|saved|wishlist|compare|book|booking|bookings)\b/;
const NOT_A_LISTING_CLAIM = /\bclaim(?:ing)?\s+(?:\w+\s+){0,2}?(?:offers?|discounts?|refunds?|rewards?|prizes?|coupons?|cashback|points|vouchers?|slots?)\b/;

const KARNA = "(?:kar|kr|karn|krn|karw|kara|karu|kare|karo|kaise|kese|kasa|kashi|ho|hog|hon|chah)\\w*";
const LIST_VERB = "(?:list|listing|listed|enlist|add|adding|added|register|registering|registered|registration|onboard|onboarding|submit|put|post|upload)";

const RULES: [OwnerKind, (s: string) => boolean][] = [
  // myTapturf by name.
  ["claim", (s) => /\bmytapturf\b/.test(s)],
  // "claim my turf", "how to claim", "Kage claim kaise kare"; "is my turf claimed". Never "claimed turfs in Pune".
  ["claim", (s) => /\bclaim(?:ing)?\b/.test(s) && !NOT_A_LISTING_CLAIM.test(s) && !(MEANING.test(s) && !HOW.test(s))],
  ["claim", (s) => /\bclaimed\b/.test(s) && HAS_MY_NOUN.test(s)],
  // "list my turf", "Listing the my venue", "add my ground", "register our academy on TapTurf".
  ["list", (s) => re(`\\b(?:list|listing|listed|enlist)\\s+${DET}*${MY_NOUN}\\b`).test(s)],
  ["list", (s) => re(`\\b${LIST_VERB}\\s+${DET}*${MY_NOUN}\\b`).test(s) && !PLAYING.test(s)],
  // "how to add a turf on tapturf", "register venue with tapturf".
  ["list", (s) => re(`\\b${LIST_VERB}\\s+${DET}*${GAP}{0,3}${NOUN}\\b`).test(s) && /\btapturf\b/.test(s) && !PLAYING.test(s)],
  // "turf list karna hai", "mera turf add karna hai", "ground register kaise kare", "list karna hai mera turf".
  ["list", (s) => re(`\\b${NOUN}\\s+(?:ko\\s+|ka\\s+|ki\\s+)?(?:tapturf\\s+(?:pe|par|pr|me|mein|mai)\\s+)?${LIST_VERB}\\s+${KARNA}\\b`).test(s) && !PLAYING.test(s)],
  ["list", (s) => re(`\\b${LIST_VERB}\\s+${KARNA}\\b`).test(s) && (HAS_MY_NOUN.test(s) || /\btapturf\b/.test(s)) && HAS_NOUN.test(s) && !PLAYING.test(s)],
  // "is my turf on tapturf", "apna turf tapturf pe daalna hai".
  ["list", (s) => HAS_MY_NOUN.test(s) && /\btapturf\b/.test(s) && !PLAYING.test(s)],
  // "how to get listed", "listing process", "listing charges", "partner with tapturf".
  ["list", (s) => /\b(?:get|getting|be|become|being)\s+(?:listed|registered|onboarded)\b/.test(s) && !PLAYING.test(s)],
  ["list", (s) => /\blisting\s+(?:process|procedure|steps|fees?|charges?|cost|kaise|kese|free|request|form)\b|\b(?:free|new|get(?:\s+an?)?|create(?:\s+an?)?|apply for(?:\s+an?)?)\s+listing\b/.test(s)],
  ["list", (s) => /\b(?:partner(?:ship)?|tie ?up|collaborat\w+)\s+(?:\w+\s+)?with\s+tapturf\b|\bjoin\s+tapturf\s+as\b/.test(s)],
  // "my turf is not on TapTurf", "can't find my ground".
  ["not_listed", (s) => HAS_MY_NOUN.test(s) && /\b(?:not|isnt|nahi|nhi|nahin|nai|no)\s+(?:\w+\s+){0,2}?(?:listed|showing|show|shown|visible|there|found|dikh\w*|mil\w*|hai)\b/.test(s) && !PLAYING.test(s)],
  ["not_listed", (s) => re(`\\b(?:cant|cannot|couldnt|unable to|not able to)\\s+(?:find|see|search)\\s+${MY_NOUN}\\b`).test(s)],
  // "update my turf's prices", "edit my listing", "manage my turf page", "update my prices on tapturf".
  [
    "manage",
    (s) =>
      /\b(?:update|updating|change|changing|edit|editing|correct|fix|modify|add|upload|set|remove|wrong|badal\w*|manage|managing|control|handle)\b/.test(s) && HAS_MY_NOUN.test(s) && !PLAYING.test(s) && !/\b(?:delete|remove)\s+(?:my|our)\b/.test(s),
  ],
  ["manage", (s) => re(`\\b(?:update|change|edit|set|add|correct|upload)\\s+(?:${MINE}\\s+)?(?:\\w+\\s+)?(?:prices?|rates?|pricing|photos?|hours|timings?)\\s+(?:\\w+\\s+){0,2}?(?:on|in|at)\\s+tapturf\\b`).test(s)],
  // "how do I mark free slots", "how to take booking requests".
  ["manage", (s) => /\b(?:mark|set|update)\s+(?:\w+\s+){0,3}?(?:free|booked)\b/.test(s) && /\b(?:slots?|hours?)\b/.test(s) && (HAS_MY_NOUN.test(s) || /\bowner\b|\btapturf\b|\bhow (?:do|to|can)\b/.test(s))],
  ["manage", (s) => /\b(?:take|accept|receive|enable|start|turn on|switch on|get)\s+(?:\w+\s+){0,2}?booking requests?\b/.test(s) && (HAS_MY_NOUN.test(s) || /\bowner\b|\btapturf\b|\bhow (?:do|to|can)\b/.test(s))],
  // "how many views did my turf get".
  ["manage", (s) => HAS_MY_NOUN.test(s) && /\b(?:views?|analytics|stats|statistics|leads|enquir\w+|taps)\b/.test(s)],
  // "I am the owner", "I run a turf", "main turf ka malik hu", "owner login".
  ["claim", (s) => /\b(?:i am|im|i m|iam|we are|main|mai|mein|hum|myself|me)\s+(?:\w+\s+){0,4}?(?:owners?|malik|maalik|manager|proprietor)\b/.test(s) && !ABOUT_AN_OWNER.test(s)],
  ["claim", (s) => /\b(?:owner|malik|maalik|manager)\s+(?:hu|hun|hoon|hoo|hai hum|hain hum|here)\b/.test(s) && !ABOUT_AN_OWNER.test(s)],
  ["claim", (s) => re(`\\b(?:i|we)\\s+(?:own|run|manage|operate|started|opened)\\s+${DET}*${GAP}{0,3}${NOUN}\\b`).test(s) && !ABOUT_AN_OWNER.test(s)],
  ["claim", (s) => re(`\\b${NOUN}\\s+(?:ka|ki|ke|cha|chi)\\s+(?:malik|maalik|owner)\\b`).test(s) && !ABOUT_AN_OWNER.test(s)],
  ["claim", (s) => /\bowners?\s+(?:login|log in|sign ?in|sign ?up|dashboard|panel|app|account|portal|registration|access)\b|\b(?:for|as|as an?)\s+(?:the\s+)?(?:turf\s+|venue\s+|ground\s+|academy\s+)?owners?\b/.test(s) && !ABOUT_AN_OWNER.test(s)],
  // "how to get verified", "get my turf verified", "verify my listing", "verified badge kaise milega", "how long does verification take".
  ["verify", (s) => /\bverification\b/.test(s) && !ACCOUNT.test(s) && !(MEANING.test(s) && !HOW.test(s))],
  ["verify", (s) => re(`\\b(?:get|getting|got|become|be|apply for)\\s+(?:(?:my|our|the|a|this)\\s+)?(?:(?:${NOUN}|page|listing)\\s+)?(?:tapturf\\s+)?verified\\b`).test(s) && !ACCOUNT.test(s)],
  ["verify", (s) => re(`\\bverify\\s+(?:${MINE}|the|this|a)\\s+${GAP}{0,3}(?:${NOUN}|page|listing|ownership|claim)\\b`).test(s)],
  ["verify", (s) => /\bverif(?:y|ied)\b/.test(s) && HOW.test(s) && !ACCOUNT.test(s) && !SEARCHING.test(s) && !(MEANING.test(s) && !/\b(?:kaise|kese|how to|how do|how can)\b/.test(s))],
  // "promote my turf", "more players for my ground".
  ["claim", (s) => HAS_MY_NOUN.test(s) && /\b(?:promot\w+|advertis\w+|marketing|more (?:bookings|customers|players))\b/.test(s)],
  // "listing charges", "is TapTurf free for owners", "commission".
  ["cost", (s) => /\b(?:listing|registration|claim|claiming|onboarding|owners?)\s+(?:fees?|charges?|cost|plans?|subscription|commission)\b|\bcommission\b/.test(s)],
];

const TIME = /\bhow (?:long|much time|many days|soon)\b|\bkitn[ae] (?:time|din|der|samay|ghante)\b|\bkab (?:tak|hoga|hogi|milega|milegi)\b|\bwhen will\b|\b(?:pending|status|still waiting|not approved|approved)\b|\btakes? (?:time|long)\b/;
const COST =
  /\b(?:is|kya|are)\b.*\bfree\b(?!\s+(?:slots?|hours?))|\bfree\s+(?:hai|h|of cost|to (?:list|claim|register|add|join|use))\b|\b(?:fees?|charges?|commission|subscription|paid|paisa|paise|payment|pay)\b|\bkitn[ae] ka\b|\bcost\b/;
const NOT_LISTED = /\b(?:not|isnt|nahi|nhi|nahin|nai)\s+(?:\w+\s+){0,2}?(?:listed|there|found|showing|on tapturf|dikh\w*|mil\w*)\b|\b(?:cant|cannot|couldnt)\s+find\b/;
/** A follow-up that is the player's again: a search or a booking. */
const PLAYER_AGAIN = /\b(?:open|khula|play|khelna|games?|match|slots?|book|booking|near|nearby|price of|rate of)\b/;

/**
 * What an owner asks, or null for anything a player would say. carries:
 * the last answer was an owner's, so "how long does it take", "is it
 * free" and "it's not there" ask about the same.
 */
export function ownerAsk(q: string, carries = false): OwnerKind | null {
  const s = ownerNorm(q);
  if (!s) return null;
  let kind: OwnerKind | null = null;
  for (const [k, hit] of RULES) {
    if (hit(s)) {
      kind = k;
      break;
    }
  }
  if (!kind) {
    if (!carries || PLAYER_AGAIN.test(s)) return null;
    if (TIME.test(s)) return "time";
    if (COST.test(s)) return "cost";
    if (NOT_LISTED.test(s)) return "not_listed";
    if (/\b(?:what can i (?:do|change|edit|update)|after (?:that|claiming|the claim)|then what|uske baad|phir kya)\b/.test(s)) return "manage";
    return s.split(" ").length <= 6 && /^(?:how|kaise|kese|steps|process)\b/.test(s) ? "claim" : null;
  }
  // "how long does a claim take", "my claim is pending"; "is it free to list my turf"; "list my turf, it isn't there".
  if (TIME.test(s)) return "time";
  if (kind !== "manage" && COST.test(s)) return "cost";
  if (kind === "list" && NOT_LISTED.test(s)) return "not_listed";
  return kind;
}

// ── The turf they name ──────────────────────────────────────────────────

/** Words of an owner's question that are never a turf's name. */
const ASK_WORDS = new Set(
  (
    "how to do does did i im am is are was we you your it its a an the this that these of on in at for with from by as and or but if so " +
    "my our me mine mera meri mere hamara hamari humara humari apna apni apne maza mazi majha majhi aamcha amcha main mai mein hum " +
    "claim claims claiming claimed list listing listed enlist add adding added register registering registered registration onboard onboarding submit put post upload " +
    "verify verified verification verifying badge stamp tick mark owner owners malik maalik manager manage managing own owns run runs running operate " +
    "update updating change changing edit editing correct fix modify set remove wrong manage price prices pricing rate rates photo photos pics pictures images hours " +
    "timing timings time number phone whatsapp contact details info information address location name amenities facilities slots slot free booked booking requests request size roof " +
    "page pages profile account login log sign signin signup up dashboard panel app portal access tapturf mytapturf website site here there " +
    "want wanna need needs would like please pls plz help can could should will shall may kindly tell show give get getting got be become let " +
    "long much many take takes taking when what why where which who days day soon pending status approved waiting still yet not no isnt cant cannot dont " +
    "karna karni karne karo kare karein karu karun karwana krna kr kar kaise kese kab kya hai h hain hu hun hoon ho hoga hogi tha ko ka ki ke pe par me se bhi nahi nhi " +
    "chahiye chahta chahte chahti raha rahi wala wali kitna kitne kitni tak milega aur ya toh to bhai sir madam hi hello hey thanks thank ok okay " +
    "new newly opened open opening started recently just also only business charges charge fee fees cost commission paid process procedure steps step " +
    "views view analytics stats leads calls call promote advertise more players customers"
  ).split(" "),
);
/** What a venue is, which names carry too ("Dugout turf arena"): part of a name, never a name alone. */
const VENUE_WORDS = new Set(
  (
    "turf turfs truf venue venues ground grounds academy academies arena arenas court courts club facility pitch maidan property sports sport box cricket football futsal " +
    "pickleball badminton tennis multisport multisports complex hub zone coaching centre center"
  ).split(" "),
);
const CITY_WORDS = new Set([...CITIES.flatMap((c) => [c.id, c.label]), ...Object.keys(CITY_ALIASES)].flatMap((c) => c.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));

const tokenWord = (t: string) => t.toLowerCase().replace(/['’‘`]s\b/g, "").replace(/[^a-z0-9]+/g, "");

/**
 * The words of an owner's question that could be their turf's name, as
 * typed: "badri's sports arena" of "badri's sports arena claim", "Kage" of
 * "I am the owner of Kage, how do I change photos". Runs of words that are
 * no question word, each with at least one that is no venue word either;
 * the longest first. None for "claim my turf page".
 */
export function ownerNameSpans(q: string): string[] {
  const toks = q.replace(/\btap\s+turf\b/gi, "tapturf").trim().split(/\s+/);
  const spans: { text: string; own: number }[] = [];
  let run: string[] = [];
  let own = 0;
  const end = () => {
    // Venue words only at the edges are kept ("Dugout turf arena"); a run of them alone names nothing.
    if (own > 0) spans.push({ text: run.join(" ").replace(/[?.!,;:]+$/, ""), own });
    run = [];
    own = 0;
  };
  for (const t of toks) {
    const w = tokenWord(t);
    if (!w || ASK_WORDS.has(w) || (CITY_WORDS.has(w) && !run.length)) {
      end();
      continue;
    }
    run.push(t);
    if (!VENUE_WORDS.has(w) && !CITY_WORDS.has(w)) own++;
    if (/[?.!,;:]$/.test(t)) end();
  }
  end();
  return spans.sort((a, b) => b.own - a.own || b.text.length - a.text.length).map((x) => x.text).slice(0, 3);
}

/** A match sure enough to offer "Claim <name>": the words typed are in the venue's own name and are most of it. */
const sure = (m: VenueMatch) => m.tier <= 1 && m.inName && (m.whole || m.exact || m.cover >= 0.5);

export type OwnerVenue = {
  /** The turfs the name means: one, or up to three that share it. */
  turfs: Turf[];
  /** A name was typed and no turf we list has it: the words as typed. */
  missed: string | null;
};

/**
 * The turf an owner's question names, among the ones we list. cities: the
 * city the words name, the page's, the visitor's, which decide between
 * turfs with one name. pageTurf: the turf page the question was asked on,
 * for a question that names none ("claim this turf").
 */
export function ownerVenue(all: readonly Turf[], q: string, cities: readonly (string | null | undefined)[] = [], pageTurf: Turf | null = null): OwnerVenue {
  const spans = ownerNameSpans(q);
  for (const span of spans) {
    const named = findNamedVenues(all, span);
    let hits = (named?.matches ?? []).filter(sure);
    if (!hits.length) continue;
    if (hits.some((m) => m.whole)) hits = hits.filter((m) => m.whole);
    const rank = (t: Turf) => {
      const i = [named?.city, ...cities].findIndex((c) => c != null && c === t.city);
      return i < 0 ? 99 : i;
    };
    const turfs = hits.map((m) => m.turf).sort((a, b) => rank(a) - rank(b));
    // One in the city asked about (or theirs) is the one; else the few that share the name.
    const first = rank(turfs[0]);
    const top = first < 99 ? turfs.filter((t) => rank(t) === first) : turfs;
    return { turfs: (top.length === 1 ? top : turfs).slice(0, 3), missed: null };
  }
  if (pageTurf && !spans.length) return { turfs: [pageTurf], missed: null };
  // Said as not found only when the words read as a name: with a venue word ("badri's sports arena"), or all the message has besides its question.
  const s = spans[0];
  const named = s && (s.split(/\s+/).some((t) => VENUE_WORDS.has(tokenWord(t))) || spans.length === 1) && s.split(/\s+/).length <= 6;
  return { turfs: [], missed: named ? s : null };
}

// ── The answer ──────────────────────────────────────────────────────────

/** MyHome's own words, under its search box. */
export const CODE_LINE = "Have the phone with the number on your listing? We send it a code and you get in at once. Otherwise we check with you first, usually within a day.";
const SIGN_IN_STEP = `Sign in at ${MY_SAID} with Google or your phone.`;
const SEARCH_STEP = 'Under "Claim a turf", search your turf by name and tap "This is mine".';
const AFTER_LINE =
  "Once you're in you can update prices, hours, photos, numbers, ground size and roof, mark hours Free or Booked, turn on booking requests, and see your page's views and Call and WhatsApp taps.";
const NOT_LISTED_LINE = `Turf not on TapTurf yet? Email ${TEAM_EMAIL} with its name, area and city, Google Maps link, sports, phone or WhatsApp number, hours and prices. We add it, then you claim it at ${MY_SAID}.`;
/** A claim checked by hand is answered with a notice on TapTurf (admin_answer_owner_claim), never an email or SMS. */
const NOTICE_LINE = "When we check a claim by hand, the answer comes as a notification on TapTurf, not an email or SMS.";
/** myTapturf says the same after a claim is sent for a check (lib/my/claimFlow.ts CLAIM_FLOW_COPY.fasterBody; the site owner, 25 Nov 2026). */
export const FASTER_LINE = "To get a check by hand approved faster, send a DM from your turf's own Instagram account to TapTurf's Instagram, @tap_turf, with your name, your role and the turf's name.";

export type OwnerLink = { label: string; href: string; primary?: boolean };
export type OwnerAnswer = {
  kind: OwnerKind;
  /** The first lines, typed out as the reply. */
  reply: string;
  /** What to do, in order, under the reply. */
  steps: string[];
  /** Said after the steps. */
  notes: string[];
  links: OwnerLink[];
  /** The turfs the answer is about: ids only, for the log. */
  turfIds: string[];
  /** named: one turf we list; claimed: it has an owner already; several: a shared name; missed: a name we don't list; none: no name. */
  about: "named" | "claimed" | "several" | "missed" | "none";
  followups: string[];
};

const OPEN_MY: OwnerLink = { label: "Open myTapturf", href: MY_URL, primary: true };
const EMAIL_US: OwnerLink = { label: `Email ${TEAM_EMAIL}`, href: `mailto:${TEAM_EMAIL}` };

const CHIPS: [OwnerKind, string][] = [
  ["time", "How long does a claim take?"],
  ["cost", "Is it free for owners?"],
  ["not_listed", "My turf isn't on TapTurf"],
  ["manage", "What can I change on my turf's page?"],
];
/** What to ask next: the other owner questions, never the one just answered. */
export const ownerFollowups = (kind: OwnerKind): string[] => CHIPS.filter(([k]) => k !== kind).map(([, c]) => c).slice(0, 3);

const nameOf = (t: Turf) => cleanVenueName(t.name);
/** "Mansarovar, Jaipur", "Jaipur", or "" when the row has neither. */
function placeOf(t: Turf): string {
  const area = areaFor(t);
  const city = t.city ? labelFor(t.city) : null;
  return [area, city && city !== area ? city : null].filter(Boolean).join(", ");
}
const claimLink = (t: Turf, withPlace = false): OwnerLink => ({ label: `Claim ${nameOf(t)}${withPlace && placeOf(t) ? `, ${placeOf(t)}` : ""}`, href: claimOwnerUrl(t.id), primary: true });

/**
 * The answer, from the kind of question and the turf it names. Pure: the
 * same question and rows always say the same.
 */
export function ownerAnswer(kind: OwnerKind, venue: OwnerVenue = { turfs: [], missed: null }): OwnerAnswer {
  const followups = ownerFollowups(kind);
  const [one, ...more] = venue.turfs;
  const base = { kind, followups, turfIds: venue.turfs.map((t) => t.id) };

  // A turf we list, named: its own claim link, or that it has an owner already.
  if (one && !more.length) {
    const name = nameOf(one);
    const where = placeOf(one) ? ` in ${placeOf(one)}` : "";
    if (one.claimed) {
      return {
        ...base,
        about: "claimed",
        reply: `${name}${where} is already claimed on TapTurf: someone who runs it manages its page on myTapturf. If that's you or your team, sign in at ${MY_SAID}.`,
        steps: [],
        notes: [`You run ${name} and can't get in? Email ${TEAM_EMAIL}.`, ...(kind === "manage" ? [AFTER_LINE] : [])],
        links: [OPEN_MY, EMAIL_US],
      };
    }
    const lead =
      kind === "time"
        ? `${name}${where} is on TapTurf and nobody has claimed its page yet. With the phone whose number is on its listing you get in at once; otherwise we check with you first, usually within a day.`
        : kind === "verify"
          ? `${name}${where} is on TapTurf and nobody has claimed its page yet. TapTurf verified is what a claimed page shows, so claim it and that's it. It's free.`
          : `${name}${where} is on TapTurf and nobody has claimed its page yet. If you own or manage it, claim it. It's free.`;
    return {
      ...base,
      about: "named",
      reply: lead,
      steps: [`Tap Claim ${name} below and sign in with Google or your phone.`, CODE_LINE],
      notes: kind === "time" ? [NOTICE_LINE, FASTER_LINE] : [AFTER_LINE],
      links: [claimLink(one)],
    };
  }

  // A name several turfs share: each with its place, so they pick their own.
  if (more.length) {
    return {
      ...base,
      about: "several",
      reply: `More than one turf on TapTurf goes by that name. Pick yours below to claim its page, free. One that's claimed already says so once you sign in.`,
      steps: [CODE_LINE],
      notes: [AFTER_LINE],
      links: [...venue.turfs.filter((t) => !t.claimed).map((t) => claimLink(t, true)), ...(venue.turfs.some((t) => t.claimed) ? [{ ...OPEN_MY, primary: false }] : [])],
    };
  }

  const missed = venue.missed ? `I couldn't match "${venue.missed}" to a turf on TapTurf. ` : "";
  const about = venue.missed ? ("missed" as const) : ("none" as const);
  const both = [OPEN_MY, EMAIL_US];
  switch (kind) {
    case "time":
      return {
        ...base,
        about,
        reply: `${missed}With the phone whose number is on your listing, we send it a code and you get in at once. Otherwise we check with you first, usually within a day.`,
        steps: [SIGN_IN_STEP, SEARCH_STEP],
        notes: [NOTICE_LINE, FASTER_LINE],
        links: [OPEN_MY],
      };
    case "verify":
      return {
        ...base,
        about,
        reply: `${missed}There's no separate verification on TapTurf. A turf whose owner has claimed its page shows Claimed and TapTurf verified, so claim your page on myTapturf (${MY_SAID}). It's free.`,
        steps: [SIGN_IN_STEP, SEARCH_STEP, CODE_LINE],
        notes: [NOT_LISTED_LINE],
        links: both,
      };
    case "manage":
      return {
        ...base,
        about,
        reply: `${missed}Owners run their turf's page on myTapturf (${MY_SAID}), free: prices, hours, photos, numbers, ground size and roof on the Your page tab, hours Free or Booked and booking requests on Slots, and views and Call and WhatsApp taps on Analytics.`,
        steps: ["Not claimed your turf yet? Do that first.", SIGN_IN_STEP, SEARCH_STEP, CODE_LINE],
        notes: [NOT_LISTED_LINE],
        links: both,
      };
    case "cost":
      return {
        ...base,
        about,
        reply: `${missed}Claiming your turf's page and running it on myTapturf (${MY_SAID}) is free.`,
        steps: [SIGN_IN_STEP, SEARCH_STEP, CODE_LINE],
        notes: [AFTER_LINE, NOT_LISTED_LINE],
        links: both,
      };
    case "not_listed":
      return {
        ...base,
        about,
        reply: `${missed}There's no form to add a turf yourself yet. Email ${TEAM_EMAIL} and we add it, then you claim its page at ${MY_SAID}. It's free.`,
        steps: [
          `First search its name at ${MY_SAID}: it may be listed under another spelling.`,
          `If it isn't there, email ${TEAM_EMAIL} with the turf's name, area and city, Google Maps link, sports, phone or WhatsApp number, hours and prices.`,
          "Once it's on TapTurf, claim it the same way.",
        ],
        notes: [CODE_LINE],
        links: [{ ...EMAIL_US, primary: true }, { ...OPEN_MY, primary: false }],
      };
    case "list":
      return {
        ...base,
        about,
        reply: `${missed}If your turf is already on TapTurf, claim its page yourself on myTapturf (${MY_SAID}). It's free. If it isn't listed yet, email ${TEAM_EMAIL} and we add it.`,
        steps: [SIGN_IN_STEP, SEARCH_STEP, CODE_LINE],
        notes: [AFTER_LINE, NOT_LISTED_LINE],
        links: both,
      };
    default:
      return {
        ...base,
        about,
        reply: `${missed}You claim your turf's page yourself on myTapturf (${MY_SAID}). It's free.`,
        steps: [SIGN_IN_STEP, SEARCH_STEP, CODE_LINE],
        notes: [AFTER_LINE, NOT_LISTED_LINE],
        links: both,
      };
  }
}

/** The whole answer as one text: the reply, the numbered steps, the notes. For the log and for reading it in one go. */
export function ownerText(a: OwnerAnswer): string {
  return [a.reply, ...a.steps.map((s, i) => `${i + 1}. ${s}`), ...a.notes].join(" ");
}

/** What the answer must never say: a process the model made up (16 Nov 2026), or a booking claim either way. */
export const OWNER_BANNED = /\bverified stamp goes up\b|\bclaim form\b|\bworking days?\b|\bbusiness days?\b|\bvenue details\b|\b(?:takes?|doesn't take|don't take|does not take) bookings?\b/i;

/**
 * For the model's prompt (lib/ai/ask.ts): the claim flow as it is, for an
 * owner's question the words above didn't catch.
 */
export const OWNER_PROMPT_LINE = `- Turf owners (claiming, listing, verification, editing a page): never invent a process, a form, a stamp or a timeline. What is true: an owner signs in at ${MY_SAID} (myTapturf) with Google or a phone, searches the turf by name and claims its page, free. With the phone whose number is on the listing, a code gets them in at once; otherwise TapTurf checks with them first, usually within a day. Once the claim is active the page is marked as run by its owner: there is no separate verification step. After claiming they edit prices, hours, photos and numbers, mark hours Free or Booked and see views and Call and WhatsApp taps. A turf that isn't listed yet: email ${TEAM_EMAIL} with its name, area and city, Google Maps link, sports, number, hours and prices. Say only this, in one or two sentences, with intent other; when unsure, point to ${MY_SAID} or ${TEAM_EMAIL}.`;

import type { PriceMention } from "../../types/turf";

/**
 * TapTurf names no other turf-booking app, links to none and shows none of
 * their photos (the owner, 26 Oct: "Nothing related to Playo"). The apps:
 * Playo, Hudle, KheloMore, Playspots, Turf Town (the app), District
 * (Zomato's), Kixar, BookMyShow, Turfwala, TIDA Sports and Sporloc, and
 * the other marketplaces whose pages were stored as several unrelated
 * venues' websites (Sportomic, Lobbi, Zappo, bkysta booking links). Yappe
 * and ChattyBao are business directories, and a chain's own site
 * (Smash2Play, PlayAll, CoPlay) is the venue's: not one of them.
 *
 * The turf data came from research that read those apps (descriptions
 * said "It is publicly bookable on Playo." on 1,509 turfs, photos came
 * from playo.gumlet.io, price notes from booking grids), and the data team
 * is rewriting it, partly into stand-ins ("booking-app",
 * "external-listing"). Whatever the rows hold, the pages run what they
 * show through this module:
 *
 * - scrubBookingApps(text): the text without any sentence, clause or
 *   aside that names an app or a stand-in. A clause goes when the rest of
 *   the sentence stands on its own ("…chain and is bookable on Playo, with
 *   slots…" keeps "…chain, with slots…"); "Playo lists parking" says what
 *   the venue has, so it becomes "It has parking"; any other sentence that
 *   still names one goes whole.
 * - isBookingAppUrl / isBookingAppHost: the apps' hosts (photos, links).
 * - httpUrl, publicLink, googleMapsUrl: links a page may render.
 * - cleanPriceMentions: price notes without the app's name or its link.
 * - cleanVenueName: a stored name without an app's attribution
 *   ("FS Turf, Churchgate - by SPORLOC" is FS Turf, Churchgate).
 *
 * Venue names that look alike are other names and stay: PlayOn, PlayOrbit,
 * Huddle, The Turf Town, The Turf District, District 9, Khelo Noida,
 * KhelO, the Financial District and "district" as a plain word. So the
 * ambiguous names (Turf Town, District) count only in context: "the Turf
 * Town app", "on District", "District lists".
 *
 * Pure (a type import only), so node --test runs it.
 */

// ── Hosts ──

/** The apps' own domains; a subdomain of one is theirs too (link.district.in, cdn.district.in). */
export const BOOKING_APP_DOMAINS = [
  "playo.co",
  "playo.io",
  "playo.club",
  "playo.app",
  "playo.in",
  "playo.gumlet.io",
  "hudle.in",
  "khelomore.com",
  "playspots.in",
  "playspots.page.link",
  "turftown.in",
  "district.in",
  "kixar.in",
  "bookmyshow.com",
  "bmscdn.com",
  "turfwala.com",
  "tidasports.com",
  "sporloc.com",
  // Marketplaces stored as the website of several unrelated venues (26 Oct):
  // sportomic.com/<venue> (4), app.lobbi.in/venue-turf/<city>/<venue> (2),
  // zappoapp.com/venues/<id> (4), to.bkysta.com booking links (2).
  "sportomic.com",
  "lobbi.in",
  "zappoapp.com",
  "bkysta.com",
  // A booking app's photo store: the photos of it in turfs.images came in
  // with venue listings the data team relabelled external-listing
  // (photos_2026-09-26_batch2b), next to img1.hudle.in links.
  "d3mt0x61rkkfy3.cloudfront.net",
] as const;

/** A host with one of these as a whole label is the app's: playo.gumlet.io, img1.hudle.in. The stand-ins written in their place count too. */
const APP_LABELS = new Set([
  "playo",
  "hudle",
  "khelomore",
  "playspots",
  "turftown",
  "kixar",
  "bookmyshow",
  "turfwala",
  "tidasports",
  "sporloc",
  "booking-app",
  "bookingapp",
  "external-listing",
]);

/** True for a booking app's host: playo.co, www.playspots.in, cdn.district.in, playo.gumlet.io. district9.co.in and huddle.co.in are venues. */
export function isBookingAppHost(host: string | null | undefined): boolean {
  if (typeof host !== "string") return false;
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return false;
  if (BOOKING_APP_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  return h.split(".").some((label) => APP_LABELS.has(label));
}

/** The host of a link, with or without its scheme ("www.playspots.in/x"); null for a path or text. */
function hostOf(value: string): string | null {
  const s = value.trim();
  if (!s || /\s/.test(s) || (s.startsWith("/") && !s.startsWith("//"))) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/\//, "")}`);
    return u.hostname || null;
  } catch {
    return null;
  }
}

/** True when the value is a link to (or the bare host of) a booking app, or a stand-in such as "external-listing". */
export function isBookingAppUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const host = hostOf(url);
  return host != null && isBookingAppHost(host);
}

/** The link when it is an absolute http(s) URL to a named host, else null ("external-listing", "/turf/x", "javascript:"). */
export function httpUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const s = url.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? s : null;
  } catch {
    return null;
  }
}

/** A link a public page may show: absolute http(s) and not a booking app's. */
export function publicLink(url: unknown): string | null {
  const s = httpUrl(url);
  return s && !isBookingAppUrl(s) ? s : null;
}

/**
 * A Google Maps link for "Read them on Google": google.com/maps,
 * maps.google.*, maps.app.goo.gl, g.page or goo.gl/maps. Anything else
 * (another site, a Google search page) is null.
 */
export function googleMapsUrl(url: unknown): string | null {
  const s = httpUrl(url);
  if (!s) return null;
  const u = new URL(s);
  const host = u.hostname.toLowerCase();
  const mapsPath = /^\/maps(?:\/|$)/.test(u.pathname);
  const ok =
    ((host === "google.com" || host === "www.google.com") && mapsPath) ||
    /^maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host) ||
    host === "maps.app.goo.gl" ||
    host === "g.page" ||
    (host === "goo.gl" && mapsPath);
  return ok ? s : null;
}

// ── Text: what counts as naming an app ──

// Names that only ever mean the app. Word-bounded, so PlayOn, PlayOrbit,
// Huddle, Khelo Noida and Tidake are other names, and "play spots" is a
// plain phrase ("one of the best play spots in Kothrud").
const NAME = String.raw`playo|hudle|khelo\s?more|playspots|kixar|book\s?my\s?show|turf\s?wala|tida\s+sports|sporloc|sportomic|lobbi|zappo\s?app`;
const NAMED = new RegExp(String.raw`\b(?:${NAME})\b`, "i");
// Turf Town is also a venue name (Turf Town in Hatte Nagar, The Turf Town
// in Gwalior): the app only as "the Turf Town app", booked or listed "on
// Turf Town", "via Turf Town", "Turf Town lists". Never "The Turf Town"
// (the venue), "Turf Town's big pitch", "play on Turf Town" or "the Turf
// Town listing on Google Maps". Case is spelt out so "The" can tell them apart.
const TT = String.raw`(?<!The\s)\b[Tt](?:urf|URF)\s?[Tt](?:own|OWN)\b(?!['’]s)`;
const TT_VENUE = String.raw`(?!\s+(?:[Tt]urf|[Aa]rena|[Gg]round|[Ss]ports?|[Cc]lub|[Bb]ox|[Cc]ricket|[Ff]ootball))`;
const TURF_TOWN = new RegExp(
  [
    String.raw`\b[Tt](?:urf|URF)\s?[Tt](?:own|OWN)\s+[Aa](?:pp|PP)\b`,
    String.raw`\b(?:[Bb]ook(?:able|ed|ings?)?|[Ll]isted|[Aa]vailable|[Ss]old|[Ss]lots?|[Rr]eserved?)\b[^.!?]{0,40}?\b(?:on|via|through|using)\s+(?:the\s+)?${TT}${TT_VENUE}`,
    String.raw`\b(?:[Vv]ia|[Tt]hrough|[Uu]sing)\s+(?:the\s+)?${TT}${TT_VENUE}`,
    String.raw`${TT}\s+(?:lists?|sells?)\b`,
    String.raw`${TT}\s+(?:listing|page)\b(?!\s+(?:on|in)\s+(?:[Gg]oogle|[Mm]aps))`,
  ].join("|"),
);
// District is also a plain word and part of place and venue names (the
// Financial District, The Turf District, District 9, District Road): the
// app only capitalised and in context.
const DISTRICT =
  /\bDistrict\s+app\b|\bZomato['’]?s\s+District\b|\b(?:on|via|through|using|and|or)\s+(?:the\s+)?District\b(?!\s*[A-Z0-9])|(?:^|[.!?]\s+|[,;(]\s*)District\s+(?:lists?|listing|sells?|shows?|has|says|mentions?|notes?)\b/;
// Stand-ins for an app's name.
const STAND_IN = new RegExp(
  [
    String.raw`\bbooking[\s-]+(?:apps?|platforms?|portals?|aggregators?|listings?)\b`,
    String.raw`\bbookingapps?\b`,
    String.raw`\bexternal[\s-]+listings?\b`,
    String.raw`\b(?:both|all|several|many|multiple|various|major|main|popular|other|third[\s-]party|sports?|turf|venue|online)\s+(?:booking\s+)?(?:apps|platforms|aggregators)\b`,
    String.raw`\bapp\s+listings?\b`,
    String.raw`\b(?:on|via|through|from|using|in)\s+(?:the|an?)\s+app\b(?!\s+store)`,
  ].join("|"),
  "i",
);
// Hosts written in text: playo.co, www.district.in/play/…, booking-app.com.
const DOMAIN = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi;

function hasAppHost(text: string): boolean {
  for (const m of text.matchAll(DOMAIN)) if (isBookingAppHost(m[1])) return true;
  return false;
}

/** True when the text names a booking app, a stand-in for one, or one's host. */
export function mentionsBookingApp(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return NAMED.test(text) || TURF_TOWN.test(text) || DISTRICT.test(text) || STAND_IN.test(text) || hasAppHost(text);
}

// ── Text: taking it out ──

// One app, for the rewrites below (only run on a sentence that names one):
// a name, a stand-in, or a venue's own site or app listed beside one ("the
// ClayGrounds site and District"), so the whole list goes together.
const APP_WORD = String.raw`(?:(?:the\s+)?(?:${NAME}|turf\s?town(?:\s+app)?|district(?:\s+app)?|zomato['’]?s\s+district)|(?:(?:the|other|popular|major|main|several|many|multiple|third[\s-]party|sports?|online)\s+)*booking[\s-]+(?:apps?|platforms?|portals?|aggregators?|listings?)|external[\s-]+listings?|both\s+apps|(?:the|an?)\s+app|apps|(?:(?:the|its|their)\s+)?[\w'’-]+(?:\s+[\w'’-]+)?\s+(?:site|website|app))`;
/** "Playo", "Playo, KheloMore and Hudle", "the ClayGrounds website and on District". */
const APPS = String.raw`${APP_WORD}(?:\s*,\s*(?:and\s+)?(?:on\s+)?${APP_WORD}|\s+(?:and|or)\s+(?:on\s+)?${APP_WORD})*`;
/** Up to the end of the clause: a comma, a semicolon or the sentence's end. */
const CLAUSE_END = String.raw`(?=\s*(?:[,;]|[.!?]?\s*$))`;
/** "… as Fitbox Kompally", "… for box cricket bookings". */
const TAIL = String.raw`(?:\s+(?:as|for|under|with)\b[^,;.!?]*)?`;

const re = (s: string, flags = "i") => new RegExp(s, flags);

/** "(listed on Playo as X)", "[Playo]", "(by Sporloc)": asides that name an app. */
const ASIDE = /\s*[([]([^()[\]]*)[)\]]/g;
/** "…, operated by Sporloc." / "FS Turf - by SPORLOC". */
const RUN_BY = re(String.raw`(?:\s*,\s*|\s+[-–—]\s*|\s+)(?:operated|run|managed|powered|owned)?\s*by\s+(?:the\s+)?(?:${NAME})\b${CLAUSE_END}`, "gi");
/** "FS Turf, Churchgate - by SPORLOC suits…" (a venue's stored name, repeated): the dash and app go wherever they sit. */
const RUN_BY_DASH = re(String.raw`\s+[-–—]\s*(?:(?:operated|run|managed|powered|owned)\s+)?by\s+(?:the\s+)?(?:${NAME})\b`, "gi");
/** "According to Playo, it opens at 6." → "It opens at 6." */
const ACCORDING = /^(?:according\s+to|as\s+per|per)\s+([^,]+),\s*(.+)$/i;
/** "…box cricket, according to Playo, and most…" / "…, as Playo notes." : an aside in mid-sentence or at its end. */
const ACCORDING_MID = re(
  String.raw`\s*,\s*(?:(?:according\s+to|as\s+per|per)\s+(?:${APPS})(?:['’]s\s+[\w-]+)?|as\s+(?:${APPS})(?:['’]s\s+[\w-]+)?\s+(?:notes?|says?|states?|mentions?|puts\s+it|shows?))${CLAUSE_END}`,
  "gi",
);
/** "It does not appear on the main booking apps, so slots are booked directly with the venue." → "Slots are booked…" */
const SO_CLAUSE = /^([^,;]+),\s+(?:so|and\s+so|which\s+means)\s+(.+)$/i;
/** "Maps and Playo list it as open round the clock." → "Maps lists it as…" */
const MAPS_AND = re(String.raw`^((?:the\s+)?(?:google\s+)?maps(?:\s+listing)?|google)\s+and\s+(?:${APPS})\s+(list|show|say|mention|note)\b`);
const AND_MAPS = re(String.raw`^(?:${APPS})\s+and\s+((?:the\s+)?(?:google\s+)?maps(?:\s+listing)?|google)\s+(list|show|say|mention|note)\b`);
/** "Its Playo listing, under the name Blaze Box Cricket, offers a medium-size turf…" → "It offers a medium-size turf…" */
const ITS_LISTING = re(String.raw`^its\s+(?:${APPS})\s+(?:listing|page|profile)s?(?:\s*,\s*(?:under|as|named)\b[^,]+,)?\s+(offers|lists|shows|mentions|has|includes|names)\s+(.+)$`);
/** "Playo sells box cricket slots and lists drinking water." → "It has drinking water." */
const SELLS_LISTS = re(String.raw`^(?:${APPS})\s+(?:also\s+)?sells?\s+[^.!?;]*?\s+and\s+(?:also\s+)?lists?\s+(.+)$`);
/** "District lists washrooms, showers and parking." → "It has washrooms, showers and parking." */
const APP_LISTS = re(String.raw`^(?:${APPS})\s+(?:also\s+)?(?:lists?|mentions?|shows?)\s+(.+)$`);
/** "…chain and is bookable on Playo, KheloMore and Hudle, with slots…" → "…chain, with slots…" */
const AND_BOOKABLE = re(
  String.raw`(?:\s*,\s*|\s+)(?:and|but)\s+(?:(?:the\s+(?:venue|turf|ground|club)|it|they|slots|courts?)\s+)?(?:(?:is|are|can\s+(?:also\s+)?be)\s+)?(?:also\s+)?(?:publicly\s+)?(?:bookable|booked|listed|available|sold)\b[^,;.!?]*?\b(?:on|via|through|with)\s+(?:${APPS})${TAIL}${CLAUSE_END}`,
  "gi",
);
/** The sentence's own verb after an aside between commas: "Terna Turf, also listed on Playo, is…" keeps no comma before "is". */
const PREDICATE = String.raw`(?:is|are|was|were|has|have|had|offers?|includes?|provides?|features?|runs?|sits?|lies|lie|stands?|operates?|hosts?|opens?|closes?|charges?|costs?|can|will|also|comes?|gets?)\b`;
/**
 * "…in the MIDC area, listed on Playo." / "…Kompally, listed on Playo as Fitbox Kompally." /
 * "…and Arena32, all bookable on Playo." / "Its facilities, listed by booking platforms, include…"
 */
const COMMA_LISTED = re(
  String.raw`\s*,\s*(?:(?:it\s+is|and|all|both|each|(?:which|that)\s+(?:is|are))\s+)?(?:also\s+)?(?:publicly\s+)?(?:listed|bookable|available|sold|found)\s+(?:on|via|through|by)\s+(?:${APPS})${TAIL}(?:\s*,(?=\s*${PREDICATE})|${CLAUSE_END})`,
  "gi",
);
/** "…washrooms and parking listed by booking platforms." → "…washrooms and parking." (not "Parking is listed on Playo.") */
const LISTED_BY = re(
  String.raw`(\S+)\s+(?:as\s+)?(?:listed|mentioned|shown|noted|advertised|bookable|available)\s+(?:by|on|via|through)\s+(?:${APPS})${TAIL}${CLAUSE_END}`,
  "gi",
);
/** "…football and Playo notes it is split into two halves." / "…, and Playo also sells box cricket here." */
const AND_APP_DOES = re(String.raw`(?:\s*,\s*|\s+)(?:and|but|while|whereas|though)\s+(?:${APPS})\s+(?:also\s+)?[a-z]+\b[^;]*?(?=[.!?]?\s*$)`);
/** "…small-sided games, booking listings cover formats from 4- to 11-a-side, and coaching…" */
const MID_CLAUSE = re(String.raw`,\s*(?:the\s+|its\s+)?(?:${APPS})\b[^,;]*(?=,)`, "gi");
/**
 * "…with online booking and late-night hours." → "…with late-night hours."
 * Online booking names no app (a venue's own site has it too), so it is
 * only wording to take out of a description, never a reason to drop a
 * sentence or a reviewer's price ("Online booking shows ₹1000…").
 */
const WITH_ONLINE_AND = /\bwith\s+online\s+booking\s+and\s+/gi;
const WITH_ONLINE = /,?\s+with\s+online\s+booking(?=\s*(?:[,;]|[.!?]?\s*$))/gi;
const ONLINE_WORDING = /\bwith\s+online\s+booking\b/i;

/** What a sentence without an app may still lose: "with online booking". */
function withoutOnlineBooking(s: string): string {
  return ONLINE_WORDING.test(s) ? tidy(s.replace(WITH_ONLINE_AND, "with ").replace(WITH_ONLINE, "")) : s;
}

/** "is listed on Playo", "publicly bookable on Playo": the listing is the sentence's verb, not a note on a noun. "all bookable on Playo": no noun to keep. */
const BE = /^(?:is|are|was|were|be|been|being|also|not|now|still|only|currently|\w+ly|all|both|each|many|some|most|several|which|that|who)$/i;
/** A finite verb before the note: "It offers … parking listed by booking platforms" keeps "…parking"; "Morning slots available on Playo" has none, so it goes. */
const FINITE = /\b(?:is|are|was|were|has|have|had|offers?|includes?|provides?|features?|comes?|gets?|runs?|hosts?|boasts?|can|will|does|do)\b/i;
/** What "It has …" may be followed by: a list of things, not "it as…", hours or prices. */
const NOT_A_THING = /^(?:(?:it|its|it's|the\s+(?:venue|turf|ground|place|club)|this|that|them|these|those|as|hours?|timings?|opening|open|slots?|prices?|rates?|no|nothing|only|one\s+of|rs|inr)\b|₹)/i;
/** Words a sentence cannot end on: "Parking and washrooms are.", "It is listed on." */
const DANGLING = /\b(?:is|are|was|were|be|been|by|on|via|through|and|or|but|with|the|a|an|of|to|for|as|at|in|its|their|from|can|will|also|which|that|so|all|both|each)[.!?]?$|\b(?:is|are|was|were)\s+\w+ly[.!?]?$/i;

const cap = (s: string) => s.replace(/^(\W*)(\p{Ll})/u, (_, pre: string, c: string) => pre + c.toUpperCase());

function itHas(things: string): string | null {
  const t = things.trim();
  return t && !NOT_A_THING.test(t) ? `It has ${t}` : null;
}

function tidy(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*(?=[,;:])/g, "")
    .replace(/[,;:]+([.!?])/g, "$1")
    .replace(/^[\s,;:]+/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

/** A clause that can stand as a sentence of its own starts like this ("reviewers praise…", "it opens…"), not "costs ₹800". */
const SUBJECT = /^\s*(?:it|its|the|they|there|this|these|those|a|an|some|most|many|one|two|reviewers?|players?|regulars|visitors|staff|slots|parking|google|maps|coaching|floodlights|prices|rates)\b/i;
/**
 * A clause that leans on the one before it: "most ban metal studs", "most
 * venues follow the same rule", "these fill fast". Without that clause it
 * means nothing, so the sentence goes whole.
 */
const LEANS_BACK = /^\s*(?:(?:most|many|some|these|those|this|that|both|all|each|several|few|others?)\b(?!\s+(?:players?|reviewers?|regulars|visitors|people|users|reviews?)\b)|.*\b(?:the\s+same|too|either|as\s+well)\b)/i;

/**
 * A sentence of clauses joined by ", and" (", but", "; " …) where one
 * side names an app and the other doesn't: that side goes. The clauses
 * that go are the last ones (the most is kept), or a leading one when the
 * rest starts like a sentence of its own.
 */
function dropSide(s: string): string {
  const parts = s.split(/(,\s+(?:and|but|while|whereas|though)\s+|;\s+)/i);
  if (parts.length < 3) return s;
  const end = /[.!?]$/.test(s) ? s.slice(-1) : "";
  for (let i = parts.length - 2; i >= 1; i -= 2) {
    const head = parts.slice(0, i).join("");
    if (!mentionsBookingApp(head) && mentionsBookingApp(parts.slice(i + 1).join(""))) return head.replace(/[.!?]+$/, "") + end;
  }
  for (let i = 1; i < parts.length; i += 2) {
    const tail = parts.slice(i + 1).join("");
    // After a semicolon the rest is a clause of its own; after ", and" only when it starts like one.
    const standsAlone = (parts[i].startsWith(";") || SUBJECT.test(tail)) && !LEANS_BACK.test(tail);
    if (mentionsBookingApp(parts.slice(0, i).join("")) && !mentionsBookingApp(tail) && standsAlone) return cap(tail.trim());
  }
  return s;
}

/** One sentence without what names an app: rewritten when the rest stands on its own, else null. */
function cleanSentence(sentence: string): string | null {
  const s = sentence.trim();
  if (!s) return null;
  if (!mentionsBookingApp(s)) return withoutOnlineBooking(s);
  const end = /[.!?]$/.test(s) ? s.slice(-1) : "";

  let out = s
    .replace(ASIDE, (m, inner: string) => (mentionsBookingApp(inner) ? "" : m))
    .replace(RUN_BY_DASH, "")
    .replace(RUN_BY, "")
    .replace(ACCORDING_MID, "");

  const according = ACCORDING.exec(out);
  if (according && mentionsBookingApp(according[1]) && !mentionsBookingApp(according[2])) out = cap(according[2]);
  const so = SO_CLAUSE.exec(out);
  if (so && mentionsBookingApp(so[1]) && !mentionsBookingApp(so[2])) out = cap(so[2]);

  out = out.replace(MAPS_AND, (_, maps: string, verb: string) => `${cap(maps)} ${verb}s`).replace(AND_MAPS, (_, maps: string, verb: string) => `${cap(maps)} ${verb}s`);

  const listing = ITS_LISTING.exec(out);
  if (listing) {
    const verb = listing[1].toLowerCase();
    out = verb === "offers" || verb === "names" ? `It offers ${listing[2]}` : (itHas(listing[2]) ?? out);
  }
  const sellsLists = SELLS_LISTS.exec(out);
  if (sellsLists) out = itHas(sellsLists[1]) ?? out;

  out = out
    .replace(AND_BOOKABLE, "")
    .replace(COMMA_LISTED, "")
    .replace(LISTED_BY, (m, before: string, offset: number, whole: string) => (BE.test(before) || !FINITE.test(whole.slice(0, offset)) ? m : before))
    .replace(AND_APP_DOES, "")
    .replace(MID_CLAUSE, "")
    .replace(WITH_ONLINE_AND, "with ")
    .replace(WITH_ONLINE, "");

  const lists = APP_LISTS.exec(out);
  if (lists) out = itHas(lists[1]) ?? out;

  out = dropSide(tidy(out));
  out = cap(tidy(out));
  if (!out || mentionsBookingApp(out)) return null;
  if (end && !/[.!?]$/.test(out)) out += end;
  // A fragment is no sentence: "Slots.", "It.", "Parking and washrooms are."
  const words = out.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 3 || DANGLING.test(out)) return null;
  return out;
}

/**
 * A period after one of these ends no sentence: "Rs. 800", "Plot No. 5",
 * "St. Xavier School", "Sy. No. 12", "opp. D-Mart", "Dr. Ambedkar Road".
 */
const ABBREV = /(?:^|[\s(.,/-])(?:rs|no|nos|st|sr|sy|dr|opp|nr|rd|approx|bldg|ph|sec|sect|govt|dist|mr|mrs|ms|jr|vs)\.$/i;

/**
 * The text as [sentence, the whitespace after it] pairs. Line breaks end a
 * sentence too (an owner's lines often have no full stop), and a period
 * after an abbreviation, or before a lower-case word or a number, doesn't.
 */
function sentencesOf(text: string): [string, string][] {
  const out: [string, string][] = [];
  const lines = text.split(/(\s*\n\s*)/);
  for (let i = 0; i < lines.length; i += 2) {
    const lineBreak = lines[i + 1] ?? "";
    const parts = lines[i].split(/(?<=[.!?])(\s+)/);
    const line: [string, string][] = [];
    for (let j = 0; j < parts.length; j += 2) {
      const prev = line[line.length - 1];
      if (prev && (ABBREV.test(prev[0]) || /^[\p{Ll}\d₹]/u.test(parts[j]))) {
        prev[0] += prev[1] + parts[j];
        prev[1] = parts[j + 1] ?? "";
      } else line.push([parts[j], parts[j + 1] ?? ""]);
    }
    line[line.length - 1][1] += lineBreak;
    out.push(...line);
  }
  return out;
}

/**
 * The text without what names a booking app or a stand-in for one; null
 * when nothing is left. Sentences that don't name one come back as they
 * were, and paragraph and line breaks stay.
 */
export function scrubBookingApps(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  if (!mentionsBookingApp(text) && !ONLINE_WORDING.test(text)) return text.trim() || null;
  let out = "";
  let gap = "";
  for (const [sentence, after] of sentencesOf(text)) {
    const kept = cleanSentence(sentence);
    if (kept) {
      out += (out ? gap : "") + kept;
      gap = after;
    } else if (countBreaks(after) > countBreaks(gap)) {
      // A dropped sentence that ended a paragraph keeps the break.
      gap = after;
    }
  }
  return out.trim() || null;
}

function countBreaks(s: string): number {
  return (s.match(/\n/g) ?? []).length;
}

// ── Venue names ──

const BY_APP = String.raw`(?:(?:operated|run|managed|powered|owned|hosted)\s+)?by\s+`;
const APP_NAME = String.raw`(?:the\s+)?(?:(?:${NAME})(?:\s+app)?|turf\s?town\s+app|district\s+app)`;
/** "(by Sporloc)", "[Playo]", "(on Hudle)" anywhere in the name. */
const NAME_ASIDE = re(String.raw`\s*[([]\s*(?:${BY_APP}|on\s+|via\s+)?${APP_NAME}\s*[)\]]`, "gi");
/** " - by SPORLOC", " | Hudle", ", operated by Sporloc", " by Playo" at the end. */
const NAME_TAIL = re(String.raw`(?:\s*[-–—|:,]\s*(?:${BY_APP})?|\s+${BY_APP})${APP_NAME}\s*$`);

/**
 * A venue's name without a booking app's attribution: "FS Turf, Churchgate
 * - by SPORLOC" is "FS Turf, Churchgate". Only a bracketed or trailing
 * attribution goes, never the whole name, and names that look alike stay
 * (PlayOn, PlayOrbit, The Turf Town, District 9, Khelo Noida).
 */
export function cleanVenueName<T>(name: T): T {
  if (typeof name !== "string") return name;
  const out = name.replace(NAME_ASIDE, "").replace(NAME_TAIL, "").replace(/\s{2,}/g, " ").replace(/[\s,;:|–—-]+$/, "").trim();
  return (out.length >= 2 ? out : name) as T;
}

// ── Price notes ──

/**
 * Where a note says it came from, when it starts with the app: up to its
 * first colon ("booking-app listing: ", "booking-app live booking grid
 * (hourly = 2×30-min slots): ", "Kixar venue listing 'X' (owner-created): ",
 * "Playo: "), or the words before the price ("booking-app listing price
 * range ", "booking-app listing shows ").
 */
const NOTE_SOURCE = re(String.raw`^\s*(?:${APP_WORD})(?:['’]s)?[^:\n]{0,120}?:\s*`);
const NOTE_LEAD = re(String.raw`^\s*(?:${APP_WORD})(?:['’]s)?(?:\s+(?:listing|page|grid))?\s+(?:price\s+range|shows|says|lists?|header|from)\s+`);
/** A bare number said as a price: "1000 per hour", "800/-", "1500 rs", "1300₹", "1000 for an hour", "2600 for two hours". */
const BARE_PRICE = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(?:₹|\/-|\/\s*(?:hr|hour|h)\b|(?:rs|rupees|inr)\b|(?:for\s+)?(?:per|an|a|one|\/)\s*(?:hour|hr|slot|head|person|player|match|game)s?\b|for\s+(?:two|three|2|3)\s+(?:hours?|hrs?)\b)`;
const AMOUNT = new RegExp(String.raw`(?:₹|\brs\.?|\binr)\s?\d|\b${BARE_PRICE}`, "i");

/**
 * A price note's text without the app: "booking-app listing: '₹999
 * onwards' (slot length not stated)" → "₹999 onwards (slot length not
 * stated)". Null when what is left is no plain price statement (a whole
 * booking grid, or a note that only says where it came from).
 */
export function cleanPriceNote(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string" || !text.trim()) return null;
  if (!mentionsBookingApp(text)) return text.trim();
  const lead = NOTE_SOURCE.test(text) ? text.replace(NOTE_SOURCE, "") : text.replace(NOTE_LEAD, "");
  const rest = lead.replace(/^['"‘“]([^'"’”]+)['"’”]/, "$1").trim();
  const out = mentionsBookingApp(rest) ? scrubBookingApps(rest) : rest;
  if (!out || mentionsBookingApp(out) || !AMOUNT.test(out)) return null;
  if (out.length > 160 || out.includes("|") || /\bcheapest\b|\bother courts\b/i.test(out)) return null;
  // "cricket nets from Rs 1,000…" after "booking-app (…): " starts the note now.
  return cap(out);
}

/**
 * A price note a page or Ask may use: the app's name out of its text and
 * context, its source and link only when they are a plain web page. Null
 * when nothing usable is left (a note that was only the app's grid).
 */
export function cleanPriceMention(m: PriceMention | null | undefined): PriceMention | null {
  if (!m || typeof m !== "object") return null;
  const price = typeof m.price_inr === "number" && Number.isFinite(m.price_inr) && m.price_inr > 0 ? m.price_inr : null;
  const text = cleanPriceNote(m.text);
  if (text == null && price == null) return null;
  const context = typeof m.context === "string" && m.context.trim() ? scrubBookingApps(m.context) : null;
  const source = typeof m.source === "string" && m.source.trim() && !mentionsBookingApp(m.source) && !isBookingAppUrl(m.source) ? m.source : null;
  return { ...m, text, context, source, source_url: publicLink(m.source_url) };
}

// The list rows are one shared, frozen copy per snapshot (lib/cache/rowStore.ts),
// so each stored list is cleaned once, not on every render of every list page.
const cleaned = new WeakMap<object, PriceMention[]>();

/** Every price note through cleanPriceMention; null stays null. */
export function cleanPriceMentions(list: unknown): PriceMention[] | null {
  if (!Array.isArray(list)) return null;
  const done = cleaned.get(list);
  if (done) return done;
  const out = list.map((m) => cleanPriceMention(m as PriceMention)).filter((m): m is PriceMention => m != null);
  cleaned.set(list, out);
  return out;
}

/** The rupee amounts in a price note, as "₹1,200": the numbers alone, for Ask's fact sheet. */
export function priceFigures(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string") return [];
  const out: string[] = [];
  // ₹1,200, Rs 500, rs.900; or a bare number said as a price ("1000 per hour", "800/-"), not "2 hours".
  for (const m of text.matchAll(new RegExp(String.raw`(?:₹|\brs\.?|\binr)\s?(\d[\d,]*(?:\.\d+)?)|\b${BARE_PRICE}`, "gi"))) {
    const bare = m[1] == null;
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0 || (bare && n < 100)) continue;
    const label = `₹${n.toLocaleString("en-IN")}`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

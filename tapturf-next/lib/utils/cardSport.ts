import type { PriceBand, SportBands, Turf } from "../../types/turf";
import { getMaximumPrice, getMinimumPrice, positivePrice, summarisePrice, type PriceSummary } from "./prices";
import { SPORT_PAGES, type SportPage } from "../sports";

/**
 * The sport a list of cards is filtered on, for the cards: a sport page's
 * stored labels (lib/sports.ts SportPage.labels, matched whole and
 * case-insensitively, as turfPlaysSport does), or a /turfs sport chip
 * (lib/turfList/query.ts SPORT_CHIPS, matched as a substring, as
 * rankTurfs does). Each surface matches labels by its own filter, so a
 * card names the label that put it in the list. Plain data, so a server
 * page can pass it to the client card.
 *
 * On 29 Oct 198 of the 252 venues that list Badminton showed two other
 * sports on their card ("Box Cricket, Football" on /bangalore/badminton),
 * and every priced card on a court page showed the venue's turf rate.
 */
export type CardSport = { labels: readonly string[] } | { chip: string };

/**
 * How closely a stored label matches the selected sport: 0 is best (the
 * page's first label, or the chip itself), null is no match.
 */
export function labelRank(label: string, sport: CardSport): number | null {
  const l = label.trim().toLowerCase();
  if (!l) return null;
  if ("labels" in sport) {
    const i = sport.labels.findIndex((x) => x.trim().toLowerCase() === l);
    return i < 0 ? null : i;
  }
  const chip = sport.chip.trim().toLowerCase();
  if (!chip || !l.includes(chip)) return null;
  return l === chip ? 0 : 1;
}

/** Sports a card names, as it always has: the first two the venue lists. */
const CARD_SPORTS = 2;

/**
 * The sports a card names. Unfiltered, the venue's first two labels, as
 * before. Filtered on a sport, the labels that match it come first (the
 * page's own label before its others, so "Football" leads "Futsal"), then
 * the venue's first two other sports in their stored order, so a card
 * still shows the other sports it showed before:
 * ["Box Cricket", "Football", "Badminton"] on a badminton page reads
 * "Badminton, Box Cricket, Football".
 */
export function cardSports(labels: readonly string[], sport?: CardSport | null): string[] {
  if (!sport) return labels.slice(0, CARD_SPORTS);
  const matched: { label: string; rank: number; at: number }[] = [];
  const others: string[] = [];
  const seen = new Set<string>();
  labels.forEach((label, at) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const rank = labelRank(label, sport);
    if (rank == null) others.push(label);
    else matched.push({ label, rank, at });
  });
  // Not in the filter's list at all (no qualifying card is): as before.
  if (matched.length === 0) return labels.slice(0, CARD_SPORTS);
  matched.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return [...matched.map((m) => m.label), ...others.slice(0, CARD_SPORTS)];
}

/** A sport-filtered card's grey line, cut where it may give way (TurfCard SportLine). */
export type SportLineParts = {
  /** The area or address; "" for none. */
  place: string;
  /** " · 2.1 km away · Badminton": up to and with the first sport (the selected one). Never cut. */
  lead: string;
  /** ", Box Cricket, Football · Open 24 hours": cut first when the line is too long. */
  tail: string;
};

/**
 * The grey line of a card on a sport-filtered list, in three parts that
 * read, joined, exactly [place, distance, sports, hours] joined by " · "
 * (the sports by ", "). The unfiltered card puts "Open 24 hours" before the
 * sports; here it comes after them, so that the lead (distance and the
 * selected sport) stays short enough for the narrowest phone.
 */
export function sportLineParts(
  place: string | null | undefined,
  parts: { distance: string | null; sports: readonly string[]; hours: string | null },
): SportLineParts {
  const [first, ...more] = parts.sports.filter((s) => s.trim());
  let lead = [parts.distance, first].filter(Boolean).join(" · ");
  let tail = more.length ? `${first ? ", " : ""}${more.join(", ")}` : "";
  if (parts.hours) tail += `${lead || tail ? " · " : ""}${parts.hours}`;
  const at = place ?? "";
  if (at && lead) lead = ` · ${lead}`;
  else if (at && tail) tail = ` · ${tail}`;
  return { place: at, lead, tail };
}

/**
 * True when every sport the venue lists is the selected sport (by the
 * surface's own filter), so whatever price it lists can only be that
 * sport's. Football and Futsal both count on the football page.
 */
export function pricesAreForSport(labels: readonly string[], sport: CardSport): boolean {
  const listed = labels.filter((l) => l.trim());
  return listed.length > 0 && listed.every((l) => labelRank(l, sport) != null);
}

/**
 * The sports pricing_bands formats name (29 Oct: every band with a format
 * is one of these). "box cricket", "box cricket (7-a-side)" is box
 * cricket, and comes first so its "(7-a-side)" never reads as football.
 * "6-a-side" is football, and futsal too: the futsal page is "futsal
 * courts and 5-a-side turfs" (lib/sports.ts) and Ask reads "5-a-side" as
 * football (lib/ai/ask.ts). A band with no format, or any other, names
 * no sport and is left out.
 */
const BAND_KINDS: readonly { kind: keyof SportBands; re: RegExp; labels: readonly string[] }[] = [
  { kind: "box-cricket", re: /^\s*box\s*cricket\b/i, labels: ["Box Cricket"] },
  { kind: "football", re: /^\s*\d+\s*-?\s*a\s*-?\s*side\b/i, labels: ["Football", "Futsal"] },
];

/** The sport kind a band's format names, or null. */
export function bandKind(format: string | null | undefined): keyof SportBands | null {
  if (typeof format !== "string") return null;
  return BAND_KINDS.find((k) => k.re.test(format))?.kind ?? null;
}

/**
 * The per-hour range of each sport a venue's bands name, or null when no
 * band names one. Read from the same checked bands the turf page's
 * Pricing table shows (lib/queries/turfs.ts toBands).
 */
export function sportBandsOf(bands: readonly Pick<PriceBand, "format" | "price_per_hour">[] | null | undefined): SportBands | null {
  const out: { [K in keyof SportBands]: [number, number] } = {};
  for (const b of bands ?? []) {
    const kind = bandKind(b?.format);
    const p = positivePrice(b?.price_per_hour);
    if (!kind || p == null) continue;
    const r = out[kind];
    out[kind] = r ? [Math.min(r[0], p), Math.max(r[1], p)] : [p, p];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * What a venue's price bands say about a card's price on a list filtered
 * to one sport. "confirmed": the bands of that sport span exactly the
 * card's range. "contradicted": the bands name a sport but not this one,
 * or this one at another range, so the card's number is (at least partly)
 * another sport's. "silent": no band names a sport.
 */
export function bandCheck(
  bands: SportBands | null | undefined,
  price: Pick<PriceSummary, "min" | "max">,
  sport: CardSport,
): "confirmed" | "contradicted" | "silent" {
  let lo = Infinity;
  let hi = -Infinity;
  let named = false;
  for (const k of BAND_KINDS) {
    const r = bands?.[k.kind];
    if (!r) continue;
    named = true;
    if (!k.labels.some((l) => labelRank(l, sport) != null)) continue;
    lo = Math.min(lo, r[0]);
    hi = Math.max(hi, r[1]);
  }
  if (!named) return "silent";
  return price.min === lo && price.max === hi ? "confirmed" : "contradicted";
}

const norm = (l: string) => l.trim().toLowerCase();

/** The sport page a card's sport is: the page with these labels, or the page that lists the chip. */
function pageOf(sport: CardSport): SportPage | undefined {
  if ("labels" in sport) {
    const key = sport.labels.map(norm).join("|");
    const first = norm(sport.labels[0] ?? "");
    return SPORT_PAGES.find((p) => p.labels.map(norm).join("|") === key) ?? SPORT_PAGES.find((p) => p.labels.some((l) => norm(l) === first));
  }
  const chip = norm(sport.chip);
  return SPORT_PAGES.find((p) => p.labels.some((l) => norm(l) === chip));
}

/**
 * Turf sports (football, box cricket, cricket, futsal, frisbee: venue
 * "turf" in lib/sports.ts) keep a price the bands do not speak to, as
 * before 29 Oct, until the owner decides how far the rule below goes on
 * the established turf pages (D3 / V1, and their price copy, D6).
 */
export function isTurfSport(sport: CardSport): boolean {
  return pageOf(sport)?.venue === "turf";
}

/**
 * Whether a card on a list filtered to one sport may show this price as
 * that sport's. The venue's price bands decide when they name a sport:
 * only a range they confirm shows. Otherwise, at a turf sport, the price
 * shows as before (isTurfSport); at any other sport (courts, tables,
 * pools, nets), only when the venue lists no other sport.
 */
export function priceIsForSport(
  turf: Pick<Turf, "sports" | "sport_bands">,
  price: Pick<PriceSummary, "min" | "max">,
  sport: CardSport,
): boolean {
  const check = bandCheck(turf.sport_bands, price, sport);
  if (check !== "silent") return check === "confirmed";
  return isTurfSport(sport) || pricesAreForSport(turf.sports, sport);
}

/**
 * A card's price. Unfiltered: summarisePrice(), as before. On a list
 * filtered to one sport, a price shows only when priceIsForSport() says
 * it is that sport's; otherwise the card reads "Prices not listed yet"
 * rather than show, say, the box cricket rate on a badminton page. The
 * slot columns, the numbers players reported and the research notes name
 * no sport; only pricing_bands do (turf.sport_bands). A price that does
 * show is unchanged.
 */
export function cardPrice(turf: Turf, sport?: CardSport | null): PriceSummary {
  const summary = summarisePrice(turf);
  if (!sport || summary.kind === "unknown" || priceIsForSport(turf, summary, sport)) return summary;
  return { label: "Prices not listed yet", kind: "unknown", min: null, max: null, unit: summary.unit };
}

/**
 * The lowest listed price the chip price sorts order by: getMinimumPrice(),
 * or null when the card on that list does not show it (cardPrice), so
 * another sport's rate never orders the list either.
 */
export function sportMinimumPrice(turf: Turf, sport?: CardSport | null): number | null {
  const min = getMinimumPrice(turf);
  if (min == null || !sport) return min;
  return priceIsForSport(turf, { min, max: getMaximumPrice(turf) }, sport) ? min : null;
}

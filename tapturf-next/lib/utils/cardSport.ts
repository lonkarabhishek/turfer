import type { Turf } from "../../types/turf";
import { summarisePrice, type PriceSummary } from "./prices";

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
 * A card's price. Unfiltered: summarisePrice(), as before. On a list
 * filtered to one sport, a price shows only when the data says it is that
 * sport's: the venue lists no other sport. The price columns, the numbers
 * players reported and the research notes name no sport, and list rows
 * carry no pricing_bands (the only data that does name one), so at a
 * multi-sport venue the card reads "Prices not listed yet" rather than
 * show, say, the box cricket rate on a badminton page. A price that does
 * show is unchanged.
 */
export function cardPrice(turf: Turf, sport?: CardSport | null): PriceSummary {
  const summary = summarisePrice(turf);
  if (!sport || summary.kind === "unknown" || pricesAreForSport(turf.sports, sport)) return summary;
  return { label: "Prices not listed yet", kind: "unknown", min: null, max: null, unit: summary.unit };
}

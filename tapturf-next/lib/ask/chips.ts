/**
 * Suggestion chips for Ask TapTurf. Every place in a chip comes from the
 * visitor's own city (its biggest area, its top-rated turfs), and a
 * games chip only appears when that city has open games, so a player in
 * Hyderabad is never offered Kothrud and nobody is sent to an empty
 * "games this weekend". Pure, so the home (server props) and the chat
 * panel (/api/ask/chips) build the same chips.
 */
export type ChipCity = {
  label: string;
  /** The area with the most turfs, if any are named. */
  area: string | null;
  /** True when the city has box cricket turfs. */
  boxCricket: boolean;
  /** Two top-rated venues, short names, for a compare chip. */
  pair?: [string, string] | null;
};

const GENERIC = ["Box cricket near me tonight", "Cheapest football turf near me", "Compare two turfs", "Calculate our NRR", "Host a game Saturday 7pm"];

export function askChips(city: ChipCity | null, openGames: number): string[] {
  if (!city) {
    const out = [...GENERIC];
    if (openGames > 0) out.splice(2, 0, "Open games this weekend");
    return out;
  }
  const { label, area, boxCricket, pair } = city;
  return [
    boxCricket ? `Box cricket in ${label} tonight` : `Football turf in ${label} tonight`,
    area ? `${area} me sasta turf` : `Cheapest turf in ${label}`,
    openGames > 0 ? `Open games in ${label} this weekend` : `Football turf in ${label} with floodlights`,
    pair ? `${pair[0]} vs ${pair[1]}` : "Compare two turfs",
    "Calculate our NRR",
    "Host a game Saturday 7pm",
  ];
}

/** "Pratigrham Sports Space & Academy – Champions Arena" -> "Pratigrham Sports Space". Null when still too long for a chip. */
export function chipName(name: string): string | null {
  const head = name.split(/\s[-–|]\s|[(,]/)[0].trim();
  const words = head.split(/\s+/).slice(0, 3).join(" ");
  return words.length >= 3 && words.length <= 22 ? words : null;
}

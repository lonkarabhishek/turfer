import { SPORT_PAGES } from "../sports";

/**
 * Games store the sport as the host typed or picked it: "Cricket",
 * "cricket", "Box Cricket", "5v5 Football", "football" (9 sports on
 * 29 Oct). sportLabel() says each one the same way everywhere a game
 * shows it; the stored value is never changed (LiveScorerPromo, filters
 * and the page metadata still read the raw sport).
 */

/** Every sport page's name and labels, by their lower-case form. */
const KNOWN = new Map<string, string>();
for (const page of SPORT_PAGES) {
  for (const label of [page.name, ...page.labels]) KNOWN.set(label.toLowerCase(), label);
}

/**
 * "cricket" -> "Cricket", " box  cricket " -> "Box Cricket", "5V5 football"
 * -> "5v5 Football", "7-a-side football" -> "7-a-side Football", "" ->
 * "Game". A sport page's own label when it matches one (any case);
 * otherwise each word title-cased, and a word with a digit in it
 * lower-cased (5v5, 7-a-side).
 */
export function sportLabel(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "Game";
  const known = KNOWN.get(s.toLowerCase());
  if (known) return known;
  return s
    .split(" ")
    .map((w) => (/\d/.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export type SportFamily = "cricket" | "football" | "court" | "basketball" | "other";

/**
 * Which drawing and glyph a game gets: cricket (box cricket too),
 * football (futsal, 5v5, 7-a-side), court (badminton, tennis,
 * pickleball, padel, volleyball, squash), basketball, or other.
 */
export function sportFamily(raw: string | null | undefined): SportFamily {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("cricket")) return "cricket";
  if (s.includes("basketball")) return "basketball";
  if (/football|futsal|soccer|\b\d+\s*(v|vs|a)\s*\d+\b|a-side/.test(s)) return "football";
  if (/badminton|tennis|pickleball|padel|volleyball|squash/.test(s)) return "court";
  return "other";
}

/** The court sports' glyph: volleyball has its own; the racquet sports share a shuttle. */
export function courtKind(raw: string | null | undefined): "volleyball" | "badminton" | null {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("volleyball")) return "volleyball";
  if (s.includes("badminton")) return "badminton";
  return null;
}

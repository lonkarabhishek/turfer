import { areaFor } from "../utils/area";
import type { CityId } from "../city";
import type { Turf } from "../../types/turf";

// Venue-name matching for Ask TapTurf, compare and game drafts. No
// "@/" imports so the test can compile it on its own (npm run test:names).

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["turf", "turfs", "ground", "grounds", "sports", "sport", "arena", "academy", "club", "the", "and", "box", "cricket", "football", "complex", "hub"]);

// Spellings people type for the generic words, so "Royal multisports
// truf" is read as "royal multisports turf".
const TYPO: Record<string, string> = { truf: "turf", turff: "turf", trf: "turf", tuff: "turf", turv: "turf", grnd: "ground", groud: "ground", sprts: "sports", spots: "sports", arina: "arena" };
const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

const wordsOf = (s: string) => norm(s).split(" ").filter(Boolean).map((w) => TYPO[w] ?? w);
/** Distinctive words run together with numbers as digits: "A One Turf" and "A1 Turf" both give "a1". */
const compactOf = (words: string[]) => words.filter((w) => !STOP.has(w)).map((w) => NUM[w] ?? w).join("");

/**
 * Match typed venue names against our rows. Generic words (turf,
 * arena, sports) don't count, so "Vedant" finds Vedant Sports Academy
 * and "CC Turf Pardi" needs both "cc" and "pardi". Words match whole or
 * by prefix ("multisport" finds "multisports", "one" does not find
 * "zone"), common typos are fixed first, and a name typed with or
 * without spaces matches ("A one truf" finds A-One Turf). One result
 * per typed name, best match first, same city preferred.
 */
export function resolveTurfNames(all: Turf[], names: string[], prefCity?: CityId | null): { name: string; turf: Turf | null }[] {
  return names.map((name) => {
    const typed = wordsOf(name);
    const words = typed.filter((w) => w.length >= 2 || /\d/.test(w));
    const strong = words.filter((w) => !STOP.has(w));
    const use = strong.length ? strong : words;
    const typedCompact = compactOf(typed);
    // Run-together matching only when it adds something: a digit ("a1") or a long enough name.
    const compactOK = typedCompact.length >= 4 || (typedCompact.length >= 2 && /\d/.test(typedCompact));
    if (!use.length && !compactOK) return { name, turf: null };
    let best: { t: Turf; score: number } | null = null;
    for (const t of all) {
      const hayWords = wordsOf(`${t.name} ${areaFor(t) ?? ""}`);
      // A typed word longer than ours matches unless what it adds is a number: "Arena32" is not "Arena".
      const hit = (w: string) => hayWords.some((h) => h === w || (w.length >= 4 && h.startsWith(w)) || (h.length >= 4 && w.startsWith(h) && !/^\d/.test(w.slice(h.length))));
      let hits = use.filter(hit).length;
      // "a one" vs "A1" / "A-One": compare the run-together forms.
      if (compactOK && compactOf(wordsOf(t.name)).startsWith(typedCompact)) hits = Math.max(hits, use.length || 1);
      if (hits === 0) continue;
      const of = use.length || 1;
      const score =
        hits / of +
        (hits >= of ? 0.5 : 0) +
        (prefCity && t.city === prefCity ? 0.1 : 0) +
        Math.min(t.total_reviews, 1000) / 20000;
      if (!best || score > best.score) best = { t, score };
    }
    return { name, turf: best && best.score >= 0.75 ? best.t : null };
  });
}


import type { BoardSport } from "./types";

/**
 * Sport names and the game-label reader, apart from the engines, so a
 * page that only needs to name a sport (the game reminders) does not
 * load every scoring engine. Re-exported from ./index.
 */

/** The sports in display order, named and drawn as lib/sports.ts has them. */
export const SPORT_LIST: readonly { sport: BoardSport; label: string; icon: string }[] = [
  { sport: "football", label: "Football", icon: "⚽" },
  { sport: "basketball", label: "Basketball", icon: "🏀" },
  { sport: "volleyball", label: "Volleyball", icon: "🏐" },
  { sport: "badminton", label: "Badminton", icon: "🏸" },
  { sport: "pickleball", label: "Pickleball", icon: "🏓" },
  { sport: "tennis", label: "Tennis", icon: "🎾" },
  { sport: "table-tennis", label: "Table Tennis", icon: "🏓" },
  { sport: "padel", label: "Padel", icon: "🎾" },
  { sport: "other", label: "Other sport", icon: "🏅" },
];

/* ------------------------------------------------------------------ */
/* A game's sport label                                                */
/* ------------------------------------------------------------------ */

const LABELS: Record<string, BoardSport> = {
  basketball: "basketball",
  volleyball: "volleyball",
  badminton: "badminton",
  pickleball: "pickleball",
  tennis: "tennis",
  "lawn tennis": "tennis",
  "table tennis": "table-tennis",
  padel: "padel",
  "ultimate frisbee": "other",
};

/**
 * The board sport for a game's stored sport label, or null (cricket has
 * its own scorer; swimming has no score). Games store "5v5 Football",
 * "7v7 Football" and old ones a lowercase "football". The rest match
 * exactly, so "Table Tennis" never reads as tennis.
 */
export function readBoardSport(label: string | null | undefined): BoardSport | null {
  const s = (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || s.includes("cricket")) return null;
  if (/\b(football|futsal|soccer)\b/.test(s)) return "football";
  return LABELS[s] ?? null;
}

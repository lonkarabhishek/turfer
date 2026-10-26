/**
 * The one list of what a game report can say: the parts of a turf a
 * player rates (Needs work, Okay, Great), the reason chips under each,
 * which row a sport gets, and the words for the overall stars.
 * private.review_catalog() in supabase/migrations/20261027_game_reports.sql
 * is the same list as SQL VALUES; npm run test:reviews fails if they drift.
 * Pure, relative imports only.
 */

export type AspectId = "pitch" | "lights" | "nets" | "goals" | "lines" | "staff" | "washroom" | "value";
/** Needs work, Okay, Great. */
export type Score = -1 | 0 | 1;
export type PlayedWhen = "morning" | "afternoon" | "evening" | "night";

export type TagDef = { id: string; label: string };
export type AspectDef = {
  id: AspectId;
  /** The row's label in the sheet. Pitch reads Court or Playing area by sport (pitchLabel). */
  label: string;
  /** In chips and summaries: "Lights: Needs work". */
  short: string;
  great: TagDef[];
  needs: TagDef[];
};

const t = (id: string, label: string): TagDef => ({ id, label });

export const ASPECTS: Record<AspectId, AspectDef> = {
  pitch: {
    id: "pitch",
    label: "Pitch",
    short: "Pitch",
    great: [t("fresh", "Fresh surface"), t("bounce", "True bounce"), t("grip", "Good grip")],
    needs: [t("worn", "Worn or patchy"), t("uneven", "Uneven bounce"), t("slippery", "Slippery"), t("hot", "Too hot by day")],
  },
  lights: {
    id: "lights",
    label: "Lights",
    short: "Lights",
    great: [t("bright", "Bright everywhere"), t("no_glare", "No glare")],
    needs: [t("dim", "Dim corners"), t("off", "Some lights off"), t("glare", "Glare in the eyes"), t("early", "Switched off early")],
  },
  nets: {
    id: "nets",
    label: "Nets & roof",
    short: "Nets",
    great: [t("good_nets", "Nets in good shape"), t("roof", "Good roof height"), t("size", "Good size")],
    needs: [t("holes", "Holes in nets"), t("low_roof", "Roof too low"), t("balls_out", "Balls keep going out"), t("small", "Too small")],
  },
  goals: {
    id: "goals",
    label: "Goals & size",
    short: "Goals",
    great: [t("size", "Proper size"), t("goals", "Good goals"), t("markings", "Clear markings")],
    needs: [t("small", "Smaller than listed"), t("torn", "Goals or nets torn"), t("no_markings", "No markings")],
  },
  lines: {
    id: "lines",
    label: "Lines & net",
    short: "Lines",
    great: [t("clear", "Clear lines"), t("net", "Good net")],
    needs: [t("faded", "Faded lines"), t("sag", "Net sagging"), t("low_roof", "Roof too low")],
  },
  staff: {
    id: "staff",
    label: "Staff & booking",
    short: "Staff",
    great: [t("quick", "Quick on WhatsApp"), t("on_time", "Started on time"), t("helpful", "Helpful staff"), t("gear", "Gave us balls or bats")],
    needs: [t("slow", "Slow to reply"), t("late", "Slot started late"), t("overlap", "Groups overlapped"), t("price_change", "Price changed on the spot"), t("rude", "Rude staff")],
  },
  washroom: {
    id: "washroom",
    label: "Washroom & water",
    short: "Washroom",
    great: [t("clean", "Clean washroom"), t("water", "Drinking water"), t("changing", "Changing room")],
    needs: [t("dirty", "Dirty washroom"), t("no_water", "No drinking water"), t("no_changing", "No changing room"), t("none", "No washroom")],
  },
  value: {
    id: "value",
    label: "Worth the price",
    short: "Value",
    great: [t("fair", "Fair price"), t("deal", "Good off-peak deal"), t("included", "Gear included")],
    needs: [t("pricey", "Pricey for the size"), t("extra", "Extra charges"), t("cut_short", "Slot cut short")],
  },
};

/** Catalogue order: how rows, bars and chips are listed everywhere. */
export const ASPECT_ORDER: AspectId[] = ["pitch", "lights", "nets", "goals", "lines", "staff", "washroom", "value"];
/** One of these per report at most: the row for the sport played. */
export const SPORT_ROWS: AspectId[] = ["nets", "goals", "lines"];
export const MAX_TAGS = 3;
export const MAX_ASPECTS = 6;

export const isAspect = (x: unknown): x is AspectId => typeof x === "string" && (ASPECT_ORDER as string[]).includes(x);

/** Every (aspect, tag, sign) the database accepts: the rows of private.review_catalog(). */
export function catalogRows(): { aspect: AspectId; tag: string; sign: 1 | -1 }[] {
  return ASPECT_ORDER.flatMap((a) => [
    ...ASPECTS[a].great.map((x) => ({ aspect: a, tag: x.id, sign: 1 as const })),
    ...ASPECTS[a].needs.map((x) => ({ aspect: a, tag: x.id, sign: -1 as const })),
  ]);
}

export function tagDef(aspect: AspectId, tag: string): (TagDef & { sign: 1 | -1 }) | null {
  const a = ASPECTS[aspect];
  const g = a.great.find((x) => x.id === tag);
  if (g) return { ...g, sign: 1 };
  const n = a.needs.find((x) => x.id === tag);
  return n ? { ...n, sign: -1 } : null;
}

export const tagLabel = (aspect: AspectId, tag: string): string => tagDef(aspect, tag)?.label ?? tag;

/* ------------------------------------------------------------------ */
/* Sports                                                              */
/* ------------------------------------------------------------------ */

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

const NETS_SPORTS = ["box cricket", "cricket", "cricket nets", "bowling machine"];
const GOALS_SPORTS = ["football", "futsal"];
const LINES_SPORTS = ["badminton", "pickleball", "tennis", "padel", "table tennis", "volleyball"];
const COURT_SPORTS = [...LINES_SPORTS, "basketball"];
/** Sports the catalogue knows: anything else rates its "Playing area". */
const KNOWN_SPORTS = [...NETS_SPORTS, ...GOALS_SPORTS, ...COURT_SPORTS];

/** The sport row for a sport: Nets & roof, Goals & size, Lines & net, or none. */
export function sportRow(sport: string | null | undefined): AspectId | null {
  const s = norm(sport);
  if (NETS_SPORTS.includes(s)) return "nets";
  if (GOALS_SPORTS.includes(s)) return "goals";
  if (LINES_SPORTS.includes(s)) return "lines";
  return null;
}

/**
 * What the first row is called: Court for racquet and ball-court sports,
 * Playing area for a sport the catalogue doesn't know, else Pitch. With no
 * sport picked it follows the turf's first listed sport.
 */
export function pitchLabel(sport: string | null | undefined, turfSports: readonly string[] = []): string {
  const s = norm(sport) || norm(turfSports[0]);
  if (!s) return "Pitch";
  if (COURT_SPORTS.includes(s)) return "Court";
  if (!KNOWN_SPORTS.includes(s)) return "Playing area";
  return "Pitch";
}

/** The label of an aspect for a report or a turf ("Court" for a badminton report's pitch). */
export function aspectLabel(aspect: AspectId, sport?: string | null, turfSports: readonly string[] = []): string {
  return aspect === "pitch" ? pitchLabel(sport, turfSports) : ASPECTS[aspect].label;
}

/** The short label, with the pitch row named for the sport. */
export function aspectShort(aspect: AspectId, sport?: string | null, turfSports: readonly string[] = []): string {
  return aspect === "pitch" ? pitchLabel(sport, turfSports) : ASPECTS[aspect].short;
}

/**
 * The rows the scorecard shows, in order: the pitch, Lights after an
 * evening or night game, the sport's row once the sport is known, then
 * staff, washroom and value. Never more than 6.
 */
export function rowsFor(sport: string | null, when: PlayedWhen | null): AspectId[] {
  const rows: AspectId[] = ["pitch"];
  if (when === "evening" || when === "night") rows.push("lights");
  const sr = sportRow(sport);
  if (sr) rows.push(sr);
  rows.push("staff", "washroom", "value");
  return rows;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const STAR_WORDS = ["Bad", "Not great", "Okay", "Good", "Loved it"] as const;
export const starWord = (n: number): string => STAR_WORDS[Math.min(5, Math.max(1, Math.round(n))) - 1];

export const SCORE_WORDS: Record<Score, string> = { [-1]: "Needs work", 0: "Okay", 1: "Great" };

export const WHEN: { id: PlayedWhen; label: string; hint: string }[] = [
  { id: "morning", label: "Morning", hint: "before 12" },
  { id: "afternoon", label: "Afternoon", hint: "12 to 4" },
  { id: "evening", label: "Evening", hint: "4 to 7" },
  { id: "night", label: "Night", hint: "after 7" },
];
export const isWhen = (x: unknown): x is PlayedWhen => x === "morning" || x === "afternoon" || x === "evening" || x === "night";
export const whenLabel = (w: PlayedWhen): string => WHEN.find((x) => x.id === w)?.label ?? w;

/** The time of day of a start time ("19:00:00"): before 12, 12 to 4, 4 to 7, after 7. */
export function whenOf(hhmm: string | null | undefined): PlayedWhen | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  if (h < 12) return "morning";
  if (h < 16) return "afternoon";
  if (h < 19) return "evening";
  return "night";
}

export const PLAY_AGAIN: { id: Score; label: string; line: string }[] = [
  { id: 1, label: "Yes", line: "Would play again" },
  { id: 0, label: "Maybe", line: "Might play again" },
  { id: -1, label: "No", line: "Wouldn't play again" },
];
export const playAgainLine = (v: number | null | undefined): string | null => PLAY_AGAIN.find((x) => x.id === v)?.line ?? null;

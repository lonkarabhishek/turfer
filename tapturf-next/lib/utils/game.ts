import type { Game } from "@/types/game";
import { cityInfo, guessCityFromAddress } from "../city";
import { usableTurfPhotos } from "./images";

// Game dates and start times are stored as India wall-clock values
// ("2026-10-19", "19:00"). Every comparison below reads them in IST
// explicitly, so the server (UTC on Vercel) and the visitor's browser
// agree on what is today, what is expired and what "Tomorrow" means.
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" as a day count since 1970-01-01, or NaN. */
function dayOf(date: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : NaN;
}

/** Today's date in India as a day count. */
function istDay(now: number): number {
  return Math.floor((now + IST_MS) / DAY_MS);
}

/** "HH:MM[:SS]" as minutes after midnight, or NaN. */
function minutesOf(time: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  return m ? +m[1] * 60 + +m[2] : NaN;
}

/** The instant a wall-clock IST date and time happen. */
function istInstant(day: number, minutes: number): number {
  return day * DAY_MS + minutes * 60_000 - IST_MS;
}

export function isGameExpired(game: Pick<Game, "date" | "start_time">, now: number = Date.now()): boolean {
  const day = dayOf(game.date);
  if (Number.isNaN(day)) return false;
  const today = istDay(now);
  if (day < today) return true;
  if (day === today) {
    const start = minutesOf(game.start_time);
    // 30-minute buffer after kickoff.
    if (!Number.isNaN(start)) return istInstant(day, start) < now - 30 * 60_000;
  }
  return false;
}

export function filterNonExpiredGames<T extends Pick<Game, "date" | "start_time">>(games: T[], now: number = Date.now()): T[] {
  return games.filter((g) => !isGameExpired(g, now));
}

export function sortGamesByDateTime<T extends Pick<Game, "date" | "start_time">>(games: T[]): T[] {
  return [...games].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;

    const timeValue = (g: T) => {
      const [h, m] = (g.start_time || "00:00").split(":").map(Number);
      return h * 60 + m;
    };
    return timeValue(a) - timeValue(b);
  });
}

export function getGameStatus(game: Pick<Game, "date" | "start_time" | "end_time">, now: number = Date.now()): "upcoming" | "live" | "expired" {
  const day = dayOf(game.date);
  if (Number.isNaN(day)) return "upcoming";
  const today = istDay(now);
  if (day < today) return "expired";
  if (day === today) {
    const sm = minutesOf(game.start_time || "00:00");
    const em = Number.isNaN(minutesOf(game.end_time)) ? sm + 60 : minutesOf(game.end_time);
    const start = istInstant(day, sm);
    const end = istInstant(day, em);
    if (now >= start && now <= end) return "live";
    if (now > end) return "expired";
  }
  return "upcoming";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Today", "Tomorrow", "Sat, 24 Oct" this week, else "24 Oct 2026",
 * relative to India's date at `now`. Server-rendered lists pass the
 * render time until hydration so the HTML and the first client render
 * agree.
 */
export function formatDate(dateStr: string, now: number = Date.now()): string {
  const day = dayOf(dateStr);
  if (Number.isNaN(day)) return dateStr;
  const diffDays = day - istDay(now);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  const d = new Date(day * DAY_MS);
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (diffDays < 7 && diffDays > 0) return `${WEEKDAYS[d.getUTCDay()]}, ${label}`;
  return `${label} ${d.getUTCFullYear()}`;
}

// \u2500\u2500\u2500 Labels for the game page and cards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Times keep a no-break space (NBSP) between the number and AM/PM and
// before the dash, and a plain space after it, so a range can only ever
// wrap after the dash ("10 AM \u2013" / "12 PM" never splits as "10" / "AM").
const NBSP = "\u00a0";

/** "10:00" -> "10 AM", "07:30:00" -> "7:30 AM", "00:00" -> "12 AM", "12:00" -> "12 PM". */
export function formatClock(time: string | null | undefined): string {
  const m = minutesOf(time);
  if (Number.isNaN(m)) return String(time ?? "");
  return `${clockNumber(m)}${NBSP}${meridiem(m)}`;
}

function clockNumber(m: number): string {
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return min ? `${h12}:${String(min).padStart(2, "0")}` : String(h12);
}

function meridiem(m: number): "AM" | "PM" {
  return Math.floor(m / 60) % 24 < 12 ? "AM" : "PM";
}

/**
 * "10 AM \u2013 12 PM", "7 \u2013 9 PM" (the same AM/PM once), "6:30 \u2013 8 PM",
 * "11 PM \u2013 1 AM". Just the start when there is no end.
 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (Number.isNaN(s)) return formatClock(start);
  if (Number.isNaN(e)) return formatClock(start);
  const sameHalf = e > s && meridiem(s) === meridiem(e);
  const first = sameHalf ? clockNumber(s) : formatClock(start);
  return `${first}${NBSP}\u2013 ${formatClock(end)}`;
}

/** What a screen reader says for the range: "10 AM to 12 PM". */
export function speakTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = formatClock(start).replace(NBSP, " ");
  if (Number.isNaN(minutesOf(end))) return s;
  return `${s} to ${formatClock(end).replace(NBSP, " ")}`;
}

/**
 * How long the slot is: "1 hour", "2 hours", "1.5 hours", "45 min",
 * "2 hr 15 min". An end at or before the start is the next day
 * (11 PM to 1 AM is 2 hours), and says so.
 */
export function durationLabel(start: string | null | undefined, end: string | null | undefined): { text: string; endsNextDay: boolean } | null {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const endsNextDay = e <= s;
  const total = endsNextDay ? e + 24 * 60 - s : e - s;
  const h = Math.floor(total / 60);
  const m = total % 60;
  let text: string;
  if (h === 0) text = `${m} min`;
  else if (m === 0) text = h === 1 ? "1 hour" : `${h} hours`;
  else if (m === 30) text = `${h}.5 hours`;
  else text = `${h} hr ${m} min`;
  return { text, endsNextDay };
}

const WEEKDAYS_UPPER = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export type GameDay = {
  /** "Today, Thu 29 Oct", "Tomorrow, Fri 30 Oct", "Sat 31 Oct", "Sat 2 Jan 2027". */
  title: string;
  /** For tight spots (the bottom bar): "Today", "Tomorrow", "Sat 31 Oct". */
  short: string;
  /** The date alone, never relative: "Fri 30 Oct". */
  plain: string;
  /** The calendar tile: "FRI" and "30". */
  weekday: string;
  dom: string;
  /** Days from today in India (0 today, 1 tomorrow, -1 yesterday). */
  diff: number;
};

/** The game's day in India, relative to `now`; past days are plain dates. */
export function formatGameDay(dateStr: string | null | undefined, now: number = Date.now()): GameDay {
  const day = dayOf(dateStr);
  if (Number.isNaN(day)) {
    const raw = String(dateStr ?? "");
    return { title: raw, short: raw, plain: raw, weekday: "", dom: "", diff: NaN };
  }
  const today = istDay(now);
  const diff = day - today;
  const d = new Date(day * DAY_MS);
  const thisYear = new Date(today * DAY_MS).getUTCFullYear();
  const plain = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() !== thisYear ? ` ${d.getUTCFullYear()}` : ""}`;
  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : null;
  return {
    title: rel ? `${rel}, ${plain}` : plain,
    short: rel ?? plain,
    plain,
    weekday: WEEKDAYS_UPPER[d.getUTCDay()],
    dom: String(d.getUTCDate()),
    diff,
  };
}

/** 0 or nothing -> "Free"; otherwise "\u20b9150", "\u20b91,200". */
export function formatPrice(price: number | string | null | undefined): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  return `\u20b9${n.toLocaleString("en-IN")}`;
}

export type SkillKey = "all" | "beginner" | "intermediate" | "advanced";
export type SkillInfo = {
  key: SkillKey;
  title: string;
  hint: string;
  chip: string;
  /** 0 = all levels (three equal bars); 1 to 3 = that many of three rising bars. */
  meter: 0 | 1 | 2 | 3;
};

const SKILLS: Record<SkillKey, SkillInfo> = {
  all: { key: "all", title: "All levels welcome", hint: "Any skill level can join", chip: "All levels", meter: 0 },
  beginner: { key: "beginner", title: "Beginners", hint: "New or casual players", chip: "Beginners", meter: 1 },
  intermediate: { key: "intermediate", title: "Intermediate", hint: "Knows the rules, plays now and then", chip: "Intermediate", meter: 2 },
  advanced: { key: "advanced", title: "Advanced players", hint: "Regular players, competitive game", chip: "Advanced", meter: 3 },
};

/** The game's skill level in words a player reads at a glance; null or unknown is all levels. */
export function skillInfo(level: string | null | undefined): SkillInfo {
  const k = String(level ?? "").trim().toLowerCase();
  return k in SKILLS ? SKILLS[k as SkillKey] : SKILLS.all;
}

/** Whether the host has booked the slot, as a plain fact (the create flow asks "Turf already booked"). */
export function turfInfo(booked: boolean | null | undefined): { booked: boolean; title: string; hint: string } {
  return booked
    ? { booked: true, title: "Turf booked", hint: "The host has booked the slot" }
    : { booked: false, title: "Turf not booked yet", hint: "The host hasn't booked the slot yet" };
}

export type SpotsInfo = {
  /** "1 of 22 going"; after the game "6 of 12 joined". */
  title: string;
  /** "21 spots open", "1 spot open", "No spots left"; after the game "Joining is closed". */
  hint: string;
  /** For the phone bar beside its button: "21 open", "1 open", "Full"; after the game "Closed". */
  short: string;
  /** The lineup's sentence, with "Be one of the first to join." when that is true. */
  line: string;
  /** The same without the invitation (the host's view). */
  plainLine: string;
  /** 2 or fewer have joined and 2 or more spots are open. */
  first: boolean;
  open: number;
};

/** Players and spots, honest at 1 of 22: no urgency, no invented numbers. */
export function spotsInfo(current: number, max: number, ended: boolean): SpotsInfo {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  const cap = Math.max(0, Math.floor(Number(max) || 0));
  const open = Math.max(0, cap - cur);
  if (ended) {
    const line = `${cur} player${cur === 1 ? "" : "s"} joined this game.`;
    return { title: `${cur} of ${cap} joined`, hint: "Joining is closed", short: "Closed", line, plainLine: line, first: false, open };
  }
  const hint = open === 0 ? "No spots left" : open === 1 ? "1 spot open" : `${open} spots open`;
  const short = open === 0 ? "Full" : `${open} open`;
  const plainLine = open === 0 ? `All ${cap} spots are taken.` : open === 1 ? "1 open spot." : `${open} open spots.`;
  const first = cur <= 2 && open >= 2;
  return { title: `${cur} of ${cap} going`, hint, short, line: first ? `${plainLine} Be one of the first to join.` : plainLine, plainLine, first, open };
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The host's own words for the game, or null. The create flow stores
 * "{sport} game" when the host writes nothing (25 of 47 on 29 Oct), and
 * every title is "{Sport} Game": neither is a note.
 */
export function hostNote(game: { description?: string | null; sport?: string | null; title?: string | null }): string | null {
  const text = String(game.description ?? "").trim();
  if (!text) return null;
  const t = squash(text);
  if (t === squash(`${game.sport ?? ""} game`) || (game.title && t === squash(game.title))) return null;
  return text;
}

const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;
const NUMBERED = /^(survey|s\.?\s?no|plot|gut|shop|flat|house|h\.?\s?no|door|office)\b/i;

/**
 * Where a game is, short: "Aziz Nagar, Hyderabad". The turf's area when
 * it has one; otherwise the first part of the address that is a place
 * (not a plus code like "FR6X+969", a survey, plot, gut or shop number,
 * or a part that starts with a digit); then the city. The city alone
 * when nothing else fits.
 */
export function gamePlace(turf: { area?: string | null; city?: string | null; address?: string | null } | null | undefined): string {
  if (!turf) return "";
  const cityId = turf.city || guessCityFromAddress(turf.address);
  const city = cityId ? cityInfo(cityId).label : "";
  const same = (a: string) => squash(a) === squash(city);
  let area = String(turf.area ?? "").trim();
  if (!area) {
    for (const raw of String(turf.address ?? "").split(",")) {
      const part = raw.trim();
      // The city itself: what follows is the state and PIN code.
      if (city && same(part)) break;
      if (!part || PLUS_CODE.test(part) || NUMBERED.test(part) || /^\d/.test(part)) continue;
      area = part;
      break;
    }
  }
  if (area && same(area)) area = "";
  return [area, city].filter(Boolean).join(", ");
}

/** "just now", "25 min ago", "1 hour ago", "yesterday", "3 days ago". */
export function askedAgo(createdAt: string | null | undefined, now: number = Date.now()): string {
  const t = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(t)) return "";
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** The host's first name for sentences ("Rahul will accept or decline"); "the host" when there is none. */
export function firstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return !first || first.toLowerCase() === "player" ? "the host" : first;
}

/**
 * A game as a /games card needs it. These rows go into the list's public,
 * cached HTML, so the host's number stays out, and the turf keeps its
 * area and up to 2 cleaned photos instead of the raw image arrays and the
 * map embed.
 */
export function cardGame(g: Game): Game {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { host_phone, turfs, ...rest } = g;
  if (!turfs) return rest;
  const t = turfs as NonNullable<Game["turfs"]> & { cover_image?: string | null; images?: unknown; image_review?: unknown };
  return {
    ...rest,
    turfs: {
      id: t.id,
      slug: t.slug ?? null,
      name: t.name,
      address: t.address,
      area: t.area ?? null,
      city: t.city ?? null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      photos: (t.photos ?? usableTurfPhotos(t, 2)).slice(0, 2),
    },
  };
}

/** Old name, kept for the dashboard, Ask and the home page: now the compact range. */
export function formatTimeSlot(startTime: string, endTime: string): string {
  return formatTimeRange(startTime, endTime);
}

export function capitalizeSkillLevel(level: string | null | undefined): string {
  return skillInfo(level).chip;
}

import type { Game } from "@/types/game";

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

function formatTime(timeStr: string): string {
  if (!timeStr || timeStr === "00:00") return "12:00 AM";
  const [hours, minutes] = timeStr.split(":");
  const h24 = parseInt(hours, 10);
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${minutes} ${ampm}`;
}

export function formatTimeSlot(startTime: string, endTime: string): string {
  return `${formatTime(startTime)}\u2013${formatTime(endTime)}`;
}

export function capitalizeSkillLevel(level: string | null | undefined): string {
  if (!level) return "All levels";
  const map: Record<string, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    all: "All levels",
  };
  return map[level.toLowerCase()] || "All levels";
}

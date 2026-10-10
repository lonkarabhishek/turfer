import { z } from "zod";
import type { CityId } from "@/lib/city";
import type { Turf } from "@/types/turf";
import { ROUTER_MODEL, resolveTurfNames, structured } from "./ask";

/**
 * "Box cricket Saturday 7pm at Hindu Gymkhana, 10 players, 150 each"
 * becomes a filled-in game wizard. Haiku reads the sentence; the code
 * snaps the values onto what the wizard accepts (30-minute slots,
 * 06:00 to 23:30, four durations) and matches the venue against our
 * own listings, so nothing invented reaches the form.
 */

export const GAME_SPORTS = ["Cricket", "Box Cricket", "Football", "5v5 Football", "Basketball", "Tennis", "Pickleball", "Badminton"] as const;
export type GameSport = (typeof GAME_SPORTS)[number];

export const GameDraft = z.object({
  sport: z.enum(GAME_SPORTS).nullable(),
  /** YYYY-MM-DD in India. */
  date: z.string().nullable(),
  /** HH:MM, 24-hour. */
  start_time: z.string().nullable(),
  duration_hours: z.number().nullable(),
  /** Total slots including the host. */
  max_players: z.number().nullable(),
  cost_per_person: z.number().nullable(),
  skill: z.enum(["all", "beginner", "intermediate", "advanced"]).nullable(),
  /** The venue as the player wrote it. */
  turf_name: z.string().nullable(),
  /** Anything else worth telling the squad, in the player's words. */
  notes: z.string().nullable(),
  /** One short sentence back to the player. */
  reply: z.string(),
});
export type GameDraft = z.infer<typeof GameDraft>;

const SYSTEM = `You turn one message from a player into a draft of a pickup game on TapTurf, an Indian sports venue directory. Reply only with the JSON object.

The player may write in English, Hinglish, Hindi or Marathi, in any script. Read it all.

Fields:
- sport: the closest option. "Turf cricket", "cage cricket", "box" mean Box Cricket. "Futsal", "5-a-side", "5s" mean 5v5 Football. "Nets", "practice", "leather ball" mean Cricket. Null when no sport is said.
- date: YYYY-MM-DD in India. Today's date and weekday are given. "Tonight", "aaj", "aaj raat" mean today. "Tomorrow", "kal" mean tomorrow. A weekday name means the next such day, today included if the time is still ahead. "Weekend" alone means the coming Saturday. Null when no day is said.
- start_time: HH:MM, 24-hour. Hours 1 to 11 with no am/pm are evening (7 = 19:00), except with "morning", "subah", "sakali" or "am". "Noon" is 12:00, "midnight" is 00:00. Null when no time is said.
- duration_hours: 0.5, 1, 1.5 or 2. "An hour", "ek ghanta" is 1. Null when not said.
- max_players: total players including the host, when a total is stated ("10 players", "10 log", "8 a side" means 16). "Need 4 more" is not a total: leave null.
- cost_per_person: rupees per head. "150 each", "150 per head", "₹150", "150 rs" mean 150. "Free", "no charge" mean 0. A total split by players is fine when both are given. Null when not said.
- skill: beginner (also "casual", "fun", "newbies welcome"), intermediate ("decent", "regular players"), advanced ("pro", "serious", "competitive"), all when the player says anyone or nothing. Null is fine too.
- turf_name: the venue exactly as written, without "at" or "turf" added by you. Null when none.
- notes: anything else the squad should know, short, in the player's words ("bring white jersey", "pay on arrival"). Null when nothing.
- reply: one friendly sentence in the player's language style, saying what you filled in and what they should still pick. Indian English, no emoji. Never claim the venue exists or is booked.`;

/** India is UTC+5:30 all year. */
function istNow(): { date: string; weekday: string; time: string } {
  const d = new Date(Date.now() + 330 * 60_000);
  const date = d.toISOString().slice(0, 10);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { date, weekday, time };
}

export async function draftGame(text: string): Promise<GameDraft | null> {
  const now = istNow();
  return structured(
    GameDraft,
    {
      model: ROUTER_MODEL,
      max_tokens: 500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Today is ${now.weekday} ${now.date}, ${now.time} in India.\n\nPlayer: ${text}` }],
    },
    "game-draft",
  );
}

export type GamePrefill = {
  sport: GameSport | null;
  date: string | null;
  startTime: string | null;
  duration: 0.5 | 1 | 1.5 | 2 | null;
  maxPlayers: number | null;
  costPerPerson: number | null;
  skill: "all" | "beginner" | "intermediate" | "advanced" | null;
  turf: { id: string; name: string } | null;
  /** What they typed for the venue when we could not match it. */
  turfName: string | null;
  notes: string | null;
  reply: string;
};

/** Snap the model's values onto what the wizard accepts and match the venue to our rows. */
export function toPrefill(draft: GameDraft, turfs: Turf[], prefCity: CityId | null): GamePrefill {
  const today = istNow().date;
  const date = draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && draft.date >= today ? draft.date : null;

  let startTime: string | null = null;
  const m = draft.start_time?.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      // Nearest half hour, inside the 06:00 to 23:30 window.
      let total = Math.round((h * 60 + min) / 30) * 30;
      total = Math.min(23 * 60 + 30, Math.max(6 * 60, total));
      startTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }
  }

  const durations = [0.5, 1, 1.5, 2] as const;
  const duration = draft.duration_hours != null ? (durations.reduce((a, b) => (Math.abs(b - draft.duration_hours!) < Math.abs(a - draft.duration_hours!) ? b : a)) as 0.5 | 1 | 1.5 | 2) : null;

  const maxPlayers = draft.max_players != null && draft.max_players >= 2 && draft.max_players <= 40 ? Math.round(draft.max_players) : null;
  const costPerPerson = draft.cost_per_person != null && draft.cost_per_person >= 0 && draft.cost_per_person <= 5000 ? Math.round(draft.cost_per_person) : null;

  let turf: GamePrefill["turf"] = null;
  if (draft.turf_name) {
    const [hit] = resolveTurfNames(turfs, [draft.turf_name], prefCity);
    if (hit?.turf) turf = { id: hit.turf.id, name: hit.turf.name };
  }

  return {
    sport: draft.sport,
    date,
    startTime,
    duration,
    maxPlayers,
    costPerPerson,
    skill: draft.skill,
    turf,
    turfName: turf ? null : draft.turf_name,
    notes: draft.notes ? draft.notes.slice(0, 200) : null,
    reply: draft.reply,
  };
}

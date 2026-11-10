import { TEST_KINDS, type TestKey } from "./mode";
import type { EmailGame, EmailJob } from "./types";

/**
 * "Send me one of each" (the admin's Emails card): a job for each of the
 * ten emails, as email_claim would send it, with realistic made-up players
 * and a made-up place, to the site owner's own address. Days and times are
 * India time from `now`: tomorrow at 7 PM, about 3 hours from now, and
 * 12:30 AM tonight. Buttons open the games list, as the samples are not
 * real games. Pure (npm run test:email).
 */

export type TestOwner = { userId: string; to: string; name: string | null };

/** A game that is not on TapTurf: the samples' buttons go to /games, never here. */
export const SAMPLE_GAME_ID = "00000000-0000-4000-8000-00000000e1a1";

const PLAYERS = ["Rohan Patil", "Imran Shaikh", "Kabir Mehta"];

/** YYYY-MM-DD and HH:MM in India, `days` from now's India day. */
function india(now: Date, days = 0): { date: string; time: string } {
  const t = new Date(now.getTime() + 330 * 60000 + days * 86400000).toISOString();
  return { date: t.slice(0, 10), time: t.slice(11, 16) };
}

/** About 3 hours from now in India, on the next half hour: its day and start. */
function inAboutThreeHours(now: Date): { date: string; start: string; end: string } {
  const half = 30 * 60000;
  const at = Math.ceil((now.getTime() + 3 * 3600000) / half) * half;
  const s = india(new Date(at));
  const e = india(new Date(at + 3600000));
  return { date: s.date, start: s.time, end: e.time };
}

/** The ten jobs, in TEST_KINDS order. `id` makes each send's own id (its Idempotency-Key). */
export function sampleJobs(owner: TestOwner, now: Date, id: () => string): { key: TestKey; label: string; job: EmailJob }[] {
  const tomorrow = india(now, 1).date;
  const first = owner.name?.trim().split(/\s+/)[0] || null;
  const game = (o: Partial<EmailGame> = {}): EmailGame => ({
    id: SAMPLE_GAME_ID,
    sport: "Football",
    date: tomorrow,
    start_time: "19:00",
    end_time: "20:00",
    price_per_player: 150,
    status: "open",
    host_first: "Asha",
    players: 7,
    max_players: 10,
    venue: { name: "Green Valley Turf", area: "Gangapur Road", city: "nashik", address: "Survey 12, Gangapur Road", lat: 20.0112, lng: 73.7581, maps_url: null, turf_slug: null },
    ...o,
  });
  const hosting = game({ host_first: first });
  const soon = inAboutThreeHours(now);
  const base = { user_id: owner.userId, to: owner.to, name: owner.name, attempt: 1, path: "/games" };
  const jobs: Record<TestKey, Omit<EmailJob, "id" | "user_id" | "to" | "name" | "attempt" | "path">> = {
    welcome: { kind: "welcome" },
    join_request: { kind: "join_request", you_host: true, game: hosting, requests: [{ name: PLAYERS[0] }] },
    join_requests: { kind: "join_request", you_host: true, game: hosting, requests: PLAYERS.map((name) => ({ name })) },
    request_waiting: { kind: "request_waiting", you_host: true, game: hosting, requests: [{ name: PLAYERS[1] }] },
    request_accepted: { kind: "request_accepted", you_host: false, game: game({ players: 8 }) },
    game_changed: { kind: "game_changed", you_host: false, game: game(), changes: ["time", "venue"], from: { date: tomorrow, start_time: "18:00" } },
    game_cancelled: { kind: "game_cancelled", you_host: false, game: game({ status: "cancelled" }) },
    reminder_tomorrow: { kind: "reminder", you_host: false, game: game(), when: "tomorrow" },
    reminder_soon: { kind: "reminder", you_host: true, game: game({ host_first: first, date: soon.date, start_time: soon.start, end_time: soon.end }), when: "soon" },
    reminder_tonight: { kind: "reminder", you_host: false, game: game({ start_time: "00:30", end_time: "01:30" }), when: "tomorrow" },
  };
  return TEST_KINDS.map(({ key, label }) => ({ key, label, job: { id: id(), ...base, ...jobs[key] } as EmailJob }));
}

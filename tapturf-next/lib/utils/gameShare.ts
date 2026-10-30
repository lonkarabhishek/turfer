import { SPORT_PAGES } from "../sports";
import { isCity, labelFor } from "../city";
import { formatGameDay, formatPrice, formatTimeRange, skillInfo } from "./game";
import { sportFamily, sportLabel } from "./sport";

/**
 * The message that goes with a shared game link (WhatsApp, the share
 * sheet, the clipboard): which game, where and when, so the people it
 * reaches can tell at a glance without opening it. The day is the date
 * itself ("Sat 1 Nov"), never "Today": a message is read later than it
 * is sent. Lines with nothing known are left out. Relative imports only
 * (npm run test:game).
 */
export type ShareGame = {
  sport: string | null | undefined;
  date: string | null | undefined;
  start_time: string | null | undefined;
  end_time: string | null | undefined;
  max_players?: number | null;
  current_players?: number | null;
  price_per_player?: number | string | null;
  skill_level?: string | null;
  turf_booked?: boolean | null;
  turfs?: { name?: string | null; area?: string | null; city?: string | null } | null;
};

const NBSP = / /g;

const FAMILY_ICON: Partial<Record<ReturnType<typeof sportFamily>, string>> = { football: "⚽", cricket: "🏏", basketball: "🏀" };

/** The sport page's icon; a game sport no page names ("5v5 Football") takes its family's. */
function sportIcon(label: string): string {
  const l = label.toLowerCase();
  const page = SPORT_PAGES.find((p) => p.name.toLowerCase() === l || p.labels.some((x) => x.toLowerCase() === l));
  return page?.icon ?? FAMILY_ICON[sportFamily(label)] ?? "🏟️";
}

/** "Dribble Den, Begur, Bangalore": the venue, its area and its city, each once. */
export function shareWhere(t: ShareGame["turfs"]): string | null {
  const name = t?.name?.trim();
  if (!name) return null;
  const raw: string = t?.city?.trim() ?? "";
  const city: string = raw && isCity(raw) ? labelFor(raw) : raw;
  const parts = [name];
  for (const p of [t?.area?.trim() ?? "", city]) {
    if (p && !parts.some((q) => q.toLowerCase() === p.toLowerCase())) parts.push(p);
  }
  return parts.join(", ");
}

/** "Sat 1 Nov, 7 – 8 PM": the date, never relative, and the time when known. */
export function shareWhen(g: Pick<ShareGame, "date" | "start_time" | "end_time">): string | null {
  const day = g.date ? formatGameDay(g.date).plain : "";
  const time = g.start_time ? formatTimeRange(g.start_time, g.end_time).replace(NBSP, " ") : "";
  const out = [day, time].filter(Boolean).join(", ");
  return out || null;
}

/** "Intermediate · 4 of 12 spots left · ₹150 per player · Turf booked". */
export function shareDetails(g: ShareGame): string | null {
  const parts: string[] = [];
  if (g.skill_level) parts.push(skillInfo(g.skill_level).chip);
  const max = Number(g.max_players);
  if (Number.isFinite(max) && max > 0) {
    const left = Math.max(0, max - Math.max(0, Number(g.current_players) || 0));
    parts.push(left === 0 ? `Full (${max} players)` : `${left} of ${max} spot${max === 1 ? "" : "s"} left`);
  }
  if (g.price_per_player != null && g.price_per_player !== "") {
    const price = formatPrice(g.price_per_player);
    parts.push(price === "Free" ? "Free to join" : `${price} per player`);
  }
  if (g.turf_booked) parts.push("Turf booked");
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The whole message. host: the sharer is the host ("Join my football
 * game"); otherwise it invites to their game ("Football game on TapTurf,
 * join in"). closed: the game has ended or was cancelled, so the message
 * invites nobody and says nothing of spots or price. url goes last when
 * given (WhatsApp and the clipboard); leave it out for the share sheet,
 * which sends the link itself.
 */
export function gameShareText(g: ShareGame, opts: { host: boolean; url?: string; closed?: "ended" | "cancelled" }): string {
  const sport = sportLabel(g.sport);
  const lead = opts.closed
    ? `${sport} game on TapTurf (${opts.closed})`
    : opts.host
      ? `Join my ${sport.toLowerCase()} game on TapTurf!`
      : `${sport} game on TapTurf, join in`;
  const where = shareWhere(g.turfs);
  const when = shareWhen(g);
  const details = opts.closed ? null : shareDetails(g);
  return [
    `${sportIcon(sport)} ${lead}`,
    where && `📍 ${where}`,
    when && `🗓️ ${when}`,
    details && `👥 ${details}`,
    opts.url,
  ]
    .filter(Boolean)
    .join("\n");
}

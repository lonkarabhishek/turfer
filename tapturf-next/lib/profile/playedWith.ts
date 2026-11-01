import type { PlayedGame } from "./history";

/**
 * Played with: the people who were in the same played games as this
 * person (participants, and each game's host), most games together
 * first. Shown on the Me tab to its owner only, never publicly. A
 * username comes only for someone whose profile is public, and a WhatsApp
 * number only from the database's own check (public.played_with_extras:
 * they turned sharing on and really played a game with the viewer); the
 * list from public rows works without either. Pure. Relative imports only
 * (npm run test:profile).
 */

export type CoPlayer = { userId: string; together: number; last: string };

/** rosters: each played game's people (participants and host), by game id. */
export function coPlayers(userId: string, played: readonly PlayedGame[], rosters: ReadonlyMap<string, readonly string[]>): CoPlayer[] {
  const by = new Map<string, CoPlayer>();
  for (const g of played) {
    for (const other of new Set(rosters.get(g.id) ?? [])) {
      if (!other || other === userId) continue;
      const had = by.get(other);
      if (had) {
        had.together++;
        if (g.day > had.last) had.last = g.day;
      } else by.set(other, { userId: other, together: 1, last: g.day });
    }
  }
  return [...by.values()].sort((a, b) => b.together - a.together || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.userId < b.userId ? -1 : 1));
}

/** What the database adds for one person: their public username, and their WhatsApp number when they share it with this viewer. */
export type CoPlayerExtra = { username: string | null; whatsapp: string | null };

/** One row of the list as the Me tab gets it. No account ids: `key` only tells the rows apart. */
export type PlayedWithPerson = {
  key: string;
  name: string;
  photo: string | null;
  /** Their public profile (/u/<username>), when they have one. */
  username: string | null;
  together: number;
  /** India's date of the latest game together. */
  last: string;
  /** +91 and 10 digits, only when they share it and played with the viewer. */
  whatsapp: string | null;
};

// The account numbers TapTurf keeps (lib/account/fresh.ts INDIAN_E164_RE).
const WHATSAPP_RE = /^\+91[0-9]{10}$/;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

/** The list: people with a name (accounts that are gone drop out), in coPlayers' order, at most `max`. */
export function playedWithList(
  list: readonly CoPlayer[],
  people: ReadonlyMap<string, { name: string | null; photo: string | null }>,
  extras: ReadonlyMap<string, CoPlayerExtra> | null,
  max = 60,
): PlayedWithPerson[] {
  const out: PlayedWithPerson[] = [];
  for (const c of list) {
    const p = people.get(c.userId);
    const name = p?.name?.trim();
    if (!name) continue;
    const x = extras?.get(c.userId);
    out.push({
      key: `p${out.length + 1}`,
      name,
      photo: p?.photo ?? null,
      username: x?.username && USERNAME_RE.test(x.username) ? x.username : null,
      together: c.together,
      last: c.last,
      whatsapp: x?.whatsapp && WHATSAPP_RE.test(x.whatsapp) ? x.whatsapp : null,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** wa.me wants the number without the plus. */
export const whatsappLink = (e164: string) => `https://wa.me/${e164.replace(/^\+/, "")}`;

/** "+91 98000 00001", to read out. */
export const spacedWhatsapp = (e164: string) => (WHATSAPP_RE.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164);

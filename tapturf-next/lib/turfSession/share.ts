import { dayLabel } from "./plan";
import { hasNames, topBatters, topBowlers } from "./stats";
import { extrasText, tally, verdict } from "./tally";
import type { Session } from "./types";

/**
 * The session's summary to share: WhatsApp text (*bold* is WhatsApp's own
 * markdown) and the lines the picture draws (components/tools/session/
 * drawSessionCard.ts). Only finished matches. Pure, relative imports only,
 * tested in share.test.ts (npm run test:session).
 */

type Shared = Pick<Session, "sides" | "matches" | "day" | "venue">;

const finished = (s: Shared) => s.matches.filter((m) => !!m.result);

/** "Sun 8 Nov · Sai Sports Arena", or the day alone. */
export function whereWhen(s: Pick<Session, "day" | "venue">): string {
  return [dayLabel(s.day), s.venue.trim()].filter(Boolean).join(" · ");
}

export function summaryText(s: Shared, link?: string | null): string {
  const t = tally(s);
  const venue = s.venue.trim();
  const lines = [`*Turf session · ${dayLabel(s.day)}*${venue ? ` · ${venue}` : ""}`, `*${s.sides.a.name} ${t.a} - ${t.b} ${s.sides.b.name}*${extrasText(t) ? ` ${extrasText(t)}` : ""}`];
  for (const m of finished(s)) lines.push(`${m.n}. ${m.result!.text}`);
  if (hasNames(s)) {
    const bat = topBatters(s, 1)[0];
    const bowl = topBowlers(s, 1)[0];
    if (bat) lines.push(`Top runs: ${bat.name} ${bat.runs} (${bat.balls})`);
    if (bowl) lines.push(`Top wickets: ${bowl.name} ${bowl.wickets}`);
  }
  lines.push(link ? `Every match: ${link}` : "Scored on TapTurf.in");
  return lines.join("\n");
}

export type CardLines = {
  eyebrow: string;
  nameA: string;
  nameB: string;
  scoreA: number;
  scoreB: number;
  /** "Titans won the session", "Session drawn" */
  verdict: string;
  /** "1 tied, 1 no result", or "". */
  extras: string;
  /** Up to 8 "1 · Titans won by 6 runs", then "and 2 more". */
  matches: string[];
  /** Up to 2: "Top runs: Rohan 96 (52)". */
  stars: string[];
  footer: string;
};

const cut = (x: string, max: number) => (x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x);

export function cardLines(s: Shared, ended = true): CardLines {
  const t = tally(s);
  const done = finished(s);
  // The picture clips each line to its width too; this only stops a runaway line.
  const shown = done.slice(0, 8).map((m) => cut(`${m.n} · ${m.result!.text}`, 64));
  if (done.length > shown.length) shown.push(`and ${done.length - shown.length} more`);
  const stars: string[] = [];
  if (hasNames(s)) {
    const bat = topBatters(s, 1)[0];
    const bowl = topBowlers(s, 1)[0];
    if (bat) stars.push(cut(`Top runs: ${bat.name} ${bat.runs} (${bat.balls})`, 40));
    if (bowl) stars.push(cut(`Top wickets: ${bowl.name} ${bowl.wickets}`, 40));
  }
  return {
    eyebrow: cut(`${ended ? "FINAL" : "TURF SESSION"} · ${whereWhen(s)}`.toUpperCase(), 52),
    nameA: cut(s.sides.a.name, 30),
    nameB: cut(s.sides.b.name, 30),
    scoreA: t.a,
    scoreB: t.b,
    verdict: cut(ended ? verdict(s) : t.leader ? `${s.sides[t.leader].name} lead` : "All square", 44),
    extras: extrasText(t).replace(/^\(|\)$/g, ""),
    matches: shown,
    stars,
    footer: "tapturf.in",
  };
}

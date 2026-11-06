"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Play, Repeat, Trophy } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";
import { readTournament } from "@/components/tournament/api";
import { resolve } from "@/lib/tournament/standings";
import type { Tournament } from "@/lib/tournament/types";
import { FORMATS, formatFor, oversThatFit, playersFromSpots, scoreWindow, SESSION_SINCE, slotMinutes } from "@/lib/turfSession/plan";
import { loadSessions, saveAsk, sessionForGame } from "@/lib/turfSession/store";
import { tally } from "@/lib/turfSession/tally";
import type { Session } from "@/lib/turfSession/types";
import type { GameVenue } from "@/lib/utils/game";
import type { Game, GameParticipant } from "@/types/game";

const TOOL = "turf_session";
const POLL_MS = 30_000;

/**
 * A cricket game's turf session on its page. For the host and the players
 * in it, around the game's time: "Score this game", which opens the Turf
 * Session Scorer filled in from the game (its sport's format, overs that
 * fit its slot, half its spots a side, its venue, day and players). Once
 * the game's session has a live link (the game's own tournament code,
 * sessionCode), everyone who can see the game sees its running result.
 * Nets and practice, or nothing to show: the fallback (the Live Scorer
 * promo, while the game is not over).
 */
export function GameScore({
  game,
  participants,
  isHost,
  isParticipant,
  where,
  sessionCode,
  fallback,
}: {
  game: Game;
  participants: GameParticipant[];
  isHost: boolean;
  isParticipant: boolean;
  where: GameVenue | null;
  sessionCode: string | null;
  fallback: ReactNode;
}) {
  const format = formatFor(game.sport);
  const [now, setNow] = useState(0);
  const [mine, setMine] = useState<Session | null>(null);
  const [tour, setTour] = useState<Tournament | null>(null);
  const win = scoreWindow({ date: game.date, start_time: game.start_time, end_time: game.end_time });
  const reads = !!format && !!sessionCode && !!win && game.date >= SESSION_SINCE;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    const read = () => setMine(sessionForGame(loadSessions(), game.id));
    const t1 = setTimeout(read, 0);
    window.addEventListener("storage", read);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearInterval(t);
      window.removeEventListener("storage", read);
    };
  }, [game.id]);

  // The game's live link: once on load, then every 30 s while the page is on screen, until 3 hours after the game.
  const open = reads && now > 0 && now >= win!.open;
  const closed = !win || now > win.close;
  useEffect(() => {
    if (!open || !sessionCode) return;
    let alive = true;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await readTournament(sessionCode);
      if (!alive) return;
      const b = r.body as { tournament?: Tournament };
      if (r.status === 200 && b.tournament?.status === "on") setTour(b.tournament);
      else if (r.status === 404 || b.tournament?.status === "removed") setTour(null);
    };
    void read();
    const t = closed ? null : setInterval(read, POLL_MS);
    const onShow = () => void read();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      alive = false;
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [open, closed, sessionCode]);

  if (!format) return <>{fallback}</>;
  const inWindow = !!win && now > 0 && now >= win.open && now <= win.close;
  const canScore = (isHost || isParticipant) && inWindow && game.status !== "cancelled";
  const scoreHref = `/tools/turf-session?game=${game.id}`;

  const handOff = () => {
    saveAsk(
      {
        game: { id: game.id, sport: game.sport, date: game.date, start: game.start_time, end: game.end_time, spots: game.max_players },
        venue: { name: where?.name ?? "", turf: where?.listed && where.id ? { id: where.id, slug: where.slug, name: where.name, area: where.area } : null },
        names: participants.map((p) => p.name ?? "").filter(Boolean),
      },
      Date.now(),
    );
    trackTool("tool_cta_clicked", TOOL, { href: "/tools/turf-session", from: "game" });
  };

  const card = "mb-5 rounded-2xl border p-5 text-left";

  if (tour && tour.teams.length >= 2) {
    const res = resolve(tour);
    const s = res.series;
    const done = res.total > 0 && res.played === res.total;
    const [a, b] = tour.teams;
    const verdict = s ? (s.leader ? `${s.leader} won the session ${Math.max(s.a, s.b)}-${Math.min(s.a, s.b)}` : `Session drawn ${s.a}-${s.b}`) : "";
    return (
      <section className={`${card} bg-primary-900 border-primary-900 text-white`} aria-labelledby="gs-h">
        <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">{done ? "Final" : "Turf session"}</p>
        <h3 id="gs-h" className="mt-1 font-display text-[26px] leading-tight tracking-tight break-words">
          {s?.line ?? `${a.name} v ${b.name}`}
        </h3>
        <p className="mt-1 text-[14px] text-white/80">{done ? verdict : `${res.played} played. Updated as each match ends.`}</p>
        <Link href={`/tournament/${tour.code}`} className="press-tight mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-12 px-6 rounded-full bg-white text-primary-900 text-[15px] font-bold hover:bg-accent-50">
          <Trophy className="w-4 h-4" aria-hidden /> See every match
        </Link>
        {mine && !mine.ended ? (
          <Link href={scoreHref} className="press-tight mt-2 inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-12 px-6 rounded-full bg-accent-500 text-white text-[15px] font-bold hover:bg-accent-600 sm:ml-2">
            <Play className="w-4 h-4" aria-hidden /> Continue scoring
          </Link>
        ) : (
          canScore && (
            <Link href={`${scoreHref}&local=1`} onClick={handOff} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-white/85 underline underline-offset-2">
              Score on this phone instead
            </Link>
          )
        )}
      </section>
    );
  }

  if (mine) {
    const t = tally(mine);
    return (
      <section className={`${card} bg-accent-50 border-accent-500/30`} aria-labelledby="gs-h">
        <p className="text-[12px] font-bold uppercase tracking-wide text-accent-800">{mine.ended ? "Final" : "On this phone"}</p>
        <h3 id="gs-h" className="mt-1 text-[18px] font-bold text-primary-900 break-words">
          Turf session: {mine.sides.a.name} {t.a} - {t.b} {mine.sides.b.name}
        </h3>
        <Link href={scoreHref} className="press-tight mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-bold hover:bg-accent-600">
          <Play className="w-4 h-4" aria-hidden /> {mine.ended ? "See the summary" : "Continue scoring"}
        </Link>
      </section>
    );
  }

  if (canScore) {
    const f = FORMATS[format];
    const overs = oversThatFit(slotMinutes(game.start_time, game.end_time), format);
    const players = game.max_players > 0 ? playersFromSpots(game.max_players, format) : f.players;
    const promo = `/tools/cricket-live-scorer?${[where?.name ? `venue=${encodeURIComponent(where.name)}` : "", "from=game"].filter(Boolean).join("&")}`;
    return (
      <section className={`${card} bg-accent-50 border-accent-500/30`} aria-labelledby="gs-h">
        <div className="flex items-start gap-3.5">
          <span className="shrink-0 w-11 h-11 rounded-xl bg-white inline-flex items-center justify-center text-accent-700">
            <Repeat className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-wide text-accent-800">Game on?</p>
            <h3 id="gs-h" className="text-[18px] font-bold text-primary-900">
              Score this game
            </h3>
            <p className="mt-1 text-[15px] text-primary-700 leading-relaxed">Split into two teams and keep every match&apos;s score on one phone.{sessionCode ? " Everyone sees the result on this page." : ""}</p>
            <p className="mt-1.5 text-[14px] font-semibold text-primary-900">
              {f.label} · {overs} overs · {players} a side
            </p>
          </div>
        </div>
        <Link href={scoreHref} onClick={handOff} className="press-tight mt-4 inline-flex w-full items-center justify-center gap-2 h-14 px-6 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
          Score this game <ArrowRight className="w-5 h-5" aria-hidden />
        </Link>
        <Link href={promo} className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-primary-700 underline underline-offset-2">
          One match only? Open the Live Scorer
        </Link>
      </section>
    );
  }

  return <>{fallback}</>;
}

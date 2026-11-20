"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, Plus, Trophy, Clock, Users, Calendar, Repeat as RepeatIcon, Trash2 } from "lucide-react";
import { formatDate, formatTimeSlot, getGameStatus } from "@/lib/utils/game";
import { Avatar } from "@/components/game/detail/Avatar";
import { useAuth } from "@/components/auth/AuthProvider";
import { quietToken } from "@/lib/account/client";
import { repeatLabel } from "@/lib/games/repeat";
import { REMOVE_BLOCKED_LIST, REMOVE_COPY, removeOffer, removedLine } from "@/lib/games/remove";
import type { GameSeries } from "@/lib/games/types";
import { getMySeries, stopSeries } from "@/lib/queries/games";
import { MySeries } from "./MySeries";
import type { Game } from "@/types/game";
import { gamePath } from "@/lib/utils/gamePath";

// The confirm step of "Delete game": fetched on the host's first tap.
const DeleteGameSheet = dynamic(() => import("@/components/game/DeleteGameSheet").then((m) => m.DeleteGameSheet), { ssr: false });

export type GamesView = "created" | "joined";

/** Cancelled, or over: the past list. */
const isPast = (g: Game) => g.status === "cancelled" || getGameStatus(g) === "expired";

/**
 * "Games" tab in the dashboard.
 * Always leads with the user's UPCOMING games (soonest first) — the
 * thing they actually opened the app to check — with past games
 * collapsed underneath. The lists come from the Me tab (useMeData), so
 * its Hosted and Joined numbers and this tab agree, and each opens its
 * list. A hosted game says how many players wait for an answer; a
 * joined one shows its host. Hosted leads with the repeats the host runs
 * (MySeries, read here: only the host's own), and a game of a repeat says
 * how it repeats; a cancelled game goes with the past ones. A hosted game
 * the host can delete has "Delete game" under it (lib/games/remove.ts
 * removeOffer: not one played with other people, which a line over the
 * past games explains); deleting, here or from the game's page (which
 * then lands here with ?deleted=<how many were told>), is confirmed in a
 * line over the page for a few seconds.
 */
export function MyGames({
  createdGames,
  joinedGames,
  loading,
  view,
  onView: setView,
  waiting,
  onGamesChanged,
}: {
  createdGames: Game[];
  joinedGames: Game[];
  loading: boolean;
  view: GamesView;
  onView: (v: GamesView) => void;
  /** Pending requests per hosted game. */
  waiting: Map<string, number>;
  /** Read the games again (a repeat was stopped and its games cancelled). */
  onGamesChanged?: () => void;
}) {
  const { user, signedInWith, getToken } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deleting: the game the confirm step is about, the ones gone since the last read, and the line that says so.
  const [deleting, setDeleting] = useState<Game | null>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [deletedNote, setDeletedNote] = useState("");
  // From the game's own page: /dashboard?tab=games&deleted=<told>. Said once; the address is put back.
  const deletedParam = searchParams?.get("deleted") ?? null;
  const [paramSeen, setParamSeen] = useState<string | null>(null);
  if (deletedParam !== paramSeen) {
    setParamSeen(deletedParam);
    const told = Number(deletedParam);
    if (deletedParam !== null) setDeletedNote(removedLine(Number.isInteger(told) && told > 0 ? told : 0));
  }
  const bringUp = useRef(false);
  useEffect(() => {
    if (deletedParam === null) return;
    bringUp.current = true;
    router.replace("/dashboard?tab=games", { scroll: false });
  }, [deletedParam, router]);
  // On a phone the list starts under the Me card: once it is read, bring it up, so the host lands on their games.
  useEffect(() => {
    if (loading || !bringUp.current) return;
    bringUp.current = false;
    requestAnimationFrame(() => document.getElementById("me-panel")?.scrollIntoView({ block: "start" }));
  }, [loading, deletedParam]);
  useEffect(() => {
    if (!deletedNote) return;
    const t = setTimeout(() => setDeletedNote(""), 8000);
    return () => clearTimeout(t);
  }, [deletedNote]);
  const [series, setSeries] = useState<{ for: string; list: GameSeries[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void getMySeries(quietToken(signedInWith)).then(({ data }) => alive && setSeries({ for: userId, list: data }));
    return () => {
      alive = false;
    };
  }, [userId, signedInWith]);
  const mySeries = useMemo(() => (series && series.for === userId ? series.list : []), [series, userId]);
  // Each repeat's words, for its games' rows (a joined game of someone else's repeat just says it repeats).
  const labels = useMemo(() => new Map(mySeries.map((s) => [s.id, repeatLabel(s.rule)])), [mySeries]);
  const venues = useMemo(() => {
    const m = new Map<string, string>();
    // A repeat at a venue its host typed names it itself (game_series_json); one at a turf, from its games.
    for (const s of mySeries) if (s.venue_name) m.set(s.id, s.venue_name);
    for (const g of createdGames) {
      const name = g.turfs?.name || g.venue_name;
      if (g.series_id && name && !m.has(g.series_id)) m.set(g.series_id, name);
    }
    return m;
  }, [createdGames, mySeries]);
  const stop = async (id: string, cancel: boolean) => {
    const { error } = await stopSeries(getToken, id, cancel);
    if (error) return error;
    const { data } = await getMySeries(getToken);
    if (userId) setSeries({ for: userId, list: data });
    if (cancel) onGamesChanged?.();
    return null;
  };

  // A game just deleted leaves both lists at once; the next read has neither.
  const hosted = useMemo(() => (gone.size ? createdGames.filter((g) => !gone.has(g.id)) : createdGames), [createdGames, gone]);
  const joined = useMemo(() => (gone.size ? joinedGames.filter((g) => !gone.has(g.id)) : joinedGames), [joinedGames, gone]);
  const games = view === "created" ? hosted : joined;

  // Split into upcoming (live + upcoming) and past.
  // Upcoming sorted by soonest kickoff, past by most-recent first.
  const { upcoming, past } = useMemo(() => {
    const up: Game[] = [];
    const pastList: Game[] = [];
    for (const g of games) {
      if (isPast(g)) pastList.push(g);
      else up.push(g);
    }
    up.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
    pastList.sort((a, b) => `${b.date}T${b.start_time}`.localeCompare(`${a.date}T${a.start_time}`));
    return { upcoming: up, past: pastList };
  }, [games]);

  // Said over the page, above the bottom bar and the Ask button, wherever the list is scrolled to.
  const note = deletedNote ? (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] md:bottom-8">
      <p className="flex max-w-sm items-start gap-2 rounded-2xl bg-primary-900 px-4 py-3 text-[14px] font-semibold leading-snug text-white shadow-elevated">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" aria-hidden />
        {deletedNote}
      </p>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-primary-200 rounded-2xl p-4 animate-pulse bg-white">
            <div className="w-2/3 h-5 bg-primary-100 rounded mb-2" />
            <div className="w-1/3 h-4 bg-primary-100 rounded" />
          </div>
        ))}
        {note}
      </div>
    );
  }

  // Past games played with other people have no Delete: one line says why (only once the database can delete at all).
  const someBlocked = view === "created" && past.some((g) => removeOffer(g) === "blocked");
  const onDelete = (g: Game) => (view === "created" && removeOffer(g) === "offer" ? () => setDeleting(g) : undefined);

  return (
    <div>
      {note}
      {/* Sub-tabs (Created / Joined) — with counts */}
      <div className="flex gap-2 mb-5">
        {(["created", "joined"] as const).map((k) => {
          const active = view === k;
          const count = k === "created" ? hosted.length : joined.length;
          return (
            <button
              key={k}
              aria-pressed={active}
              onClick={() => setView(k)}
              className={`text-[13px] font-bold px-4 py-2 rounded-full border-2 transition-all focus-neon ${
                active
                  ? "bg-primary-800 text-white border-primary-800"
                  : "text-primary-700 border-primary-200 bg-white hover:border-primary-300"
              }`}
            >
              {k === "created" ? "Hosted" : "Joined"} ({count})
            </button>
          );
        })}
      </div>

      {view === "created" && <MySeries series={mySeries} venues={venues} onStop={stop} />}

      {games.length === 0 ? (
        <EmptyState view={view} />
      ) : (
        <div className="space-y-6">
          {/* ── Upcoming — the important half ── */}
          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-accent-600">
                  Upcoming · {upcoming.length}
                </p>
              </div>
              <div className="space-y-3">
                {upcoming.map((g) => (
                  <GameRow key={g.id} game={g} highlight host={view === "joined"} waiting={view === "created" ? waiting.get(g.id) ?? 0 : 0} repeats={g.series_id ? labels.get(g.series_id) ?? "Repeats" : null} onDelete={onDelete(g)} />
                ))}
              </div>
            </section>
          )}

          {/* ── Past — collapsed, muted ── */}
          {past.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-primary-400 mb-3">
                Past · {past.length}
              </p>
              {someBlocked && <p className="-mt-1 mb-3 text-[13px] leading-snug text-primary-500">{REMOVE_BLOCKED_LIST}</p>}
              <div className="space-y-3 opacity-80">
                {past.map((g) => <GameRow key={g.id} game={g} host={view === "joined"} repeats={g.series_id ? labels.get(g.series_id) ?? "Repeats" : null} onDelete={onDelete(g)} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {deleting && (
        <DeleteGameSheet
          game={deleting}
          venue={deleting.turfs?.name || deleting.venue_name}
          onClose={() => setDeleting(null)}
          onDeleted={(told) => {
            setGone((was) => new Set([...was, deleting.id]));
            setDeleting(null);
            setDeletedNote(removedLine(told));
            onGamesChanged?.();
          }}
        />
      )}
    </div>
  );
}

/** Compact game row — big touch target, plenty of white space. onDelete: the host's "Delete game", under the row's link. */
function GameRow({
  game,
  highlight = false,
  host = false,
  waiting = 0,
  repeats = null,
  onDelete,
}: {
  game: Game;
  highlight?: boolean;
  host?: boolean;
  waiting?: number;
  repeats?: string | null;
  onDelete?: () => void;
}) {
  const status = game.status === "cancelled" ? "cancelled" : getGameStatus(game);
  return (
    <div
      className={`rounded-2xl border bg-white transition-all ${
        highlight
          ? "border-primary-200 hover:border-accent-500 hover:shadow-card-hover"
          : "border-primary-200 hover:border-primary-300"
      }`}
    >
    <Link href={gamePath(game)} className="block group focus-neon rounded-2xl">
      <div className={`relative overflow-hidden rounded-2xl p-4 ${onDelete ? "rounded-b-none" : ""}`}>
        {/* Accent left bar for upcoming */}
        {highlight && (
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 ${
              status === "live" ? "bg-hot-500" : "bg-accent-500"
            }`}
            aria-hidden
          />
        )}
        <div className={highlight ? "pl-2" : ""}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 bg-accent-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">
                {game.sport}
              </span>
              {repeats && (
                <span className="inline-flex items-center gap-1 min-w-0 text-[11px] font-semibold text-accent-700">
                  <RepeatIcon className="w-3 h-3 shrink-0" aria-hidden />
                  <span className="truncate">{repeats}</span>
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                status === "live"
                  ? "bg-hot-500/10 text-hot-600 border border-hot-500/40"
                  : status === "expired" || status === "cancelled"
                  ? "bg-primary-100 text-primary-500"
                  : "bg-accent-50 text-accent-700 border border-accent-500/40"
              }`}
            >
              {status === "live" ? "Live now" : status === "cancelled" ? "Cancelled" : status === "expired" ? "Ended" : "Upcoming"}
            </span>
          </div>

          <p className="font-display text-lg text-primary-800 leading-tight truncate">
            {game.turfs?.name || game.venue_name || game.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-primary-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-primary-400" />
              {formatDate(game.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary-400" />
              {formatTimeSlot(game.start_time, game.end_time)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-primary-400" />
              <span className="tabular">{game.current_players}/{game.max_players}</span>
            </span>
          </div>

          {(host || waiting > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {host && (
                <span className="flex items-center gap-1.5 min-w-0 text-[12px] text-primary-600">
                  <Avatar src={game.host_profile_image_url} name={game.host_name} size={20} />
                  <span className="truncate">Hosted by {game.host_name || "a TapTurf player"}</span>
                </span>
              )}
              {waiting > 0 && (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-hot-500/10 text-hot-600 text-[12px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-hot-500" aria-hidden />
                  {waiting} {waiting === 1 ? "player wants" : "players want"} to join
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
      {onDelete && (
        <div className="flex justify-end border-t border-primary-100 px-1.5">
          <button
            type="button"
            onClick={onDelete}
            aria-label={`${REMOVE_COPY.action}: ${game.sport}, ${formatDate(game.date)}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-primary-600 hover:text-hot-600 focus-neon"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {REMOVE_COPY.action}
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ view }: { view: GamesView }) {
  return (
    <div className="text-center py-14">
      <div className="w-14 h-14 bg-accent-50 border border-accent-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Trophy className="w-6 h-6 text-accent-600" />
      </div>
      <p className="text-[15px] font-semibold text-primary-800 mb-1">
        {view === "created" ? "No games yet" : "You haven't joined a game"}
      </p>
      <p className="text-[13px] text-primary-500 mb-6">
        {view === "created" ? "Host your first game — invite the crew" : "Find one that fits your squad"}
      </p>
      <Link
        href={view === "created" ? "/game/create" : "/games"}
        className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-5 py-3 rounded-full transition-colors shadow-neon focus-neon"
      >
        <Plus className="w-4 h-4" strokeWidth={2.75} />
        {view === "created" ? "Host a game" : "Browse games"}
      </Link>
    </div>
  );
}

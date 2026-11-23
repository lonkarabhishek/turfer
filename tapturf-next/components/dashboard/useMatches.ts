"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSignIn, signInKnown, signInToken } from "@/lib/account/client";
import { readMineLinks, type MineLink } from "@/lib/matches/links";
import { EMPTY_STORES, liveNow, type PhoneKind, type PhoneStores } from "@/lib/matches/phone";
import { tournamentRows, type TournamentRow } from "@/lib/matches/tournaments";
import { loadStore } from "@/lib/tournament/store";
import { loadSessions, saveSessions } from "@/lib/turfSession/store";
import { myTournaments } from "@/components/tournament/api";
import { loadIndex as loadScorer, loadLinks, setCurrent as setScorerCurrent } from "@/components/tools/scorer/storage";
import { loadIndex as loadBoards, setCurrent as setBoardCurrent } from "@/components/tools/board/storage";

export type MatchesData = {
  /** The live links they started (GET /api/live/mine). undefined: on its way; null: not readable (before the migration too). */
  links: MineLink[] | null | undefined;
  /** My tournaments' rows. undefined: on their way. */
  tournaments: TournamentRow[] | undefined;
  /** What this phone's own stores hold, read by their own readers. */
  stores: PhoneStores;
  /** The clock the lists were read at (ms); 0 before the first read. */
  now: number;
  /** What is live right now, for the tab's badge; 0 until known. */
  live: number;
  /** Read it all again (the tab was opened, the phone came back to it). */
  reload: () => void;
};

/** Read again when the tab is shown, unless it was read this recently. */
const FRESH_MS = 15_000;

/** This phone's stores, each through its own reader (none of them throws; blocked storage is just empty lists). */
function readStores(): PhoneStores {
  try {
    return { scorer: loadScorer().list, boards: loadBoards().list, sessions: loadSessions().list, links: loadLinks().links };
  } catch {
    return EMPTY_STORES;
  }
}

async function readLinks(): Promise<MineLink[] | null> {
  try {
    if (hasSignIn() === null) await signInKnown(5_000);
    const t = await signInToken();
    if (!("token" in t)) return null;
    const res = await fetch("/api/live/mine", { cache: "no-store", headers: { Authorization: `Bearer ${t.token}` } });
    if (!res.ok) return null;
    return readMineLinks(await res.json());
  } catch {
    return null;
  }
}

/**
 * Make a thing on this phone the one its tool opens with, through the
 * tool's own store (the same "current" its own list sets), so the link
 * that follows lands where it was left. Nothing else is written.
 */
export function bringUp(kind: PhoneKind, id: string): void {
  try {
    if (kind === "cricket") setScorerCurrent(id);
    else if (kind === "board") setBoardCurrent(id);
    else {
      const st = loadSessions();
      if (st.current !== id && st.list.some((s) => s.id === id)) saveSessions({ ...st, current: id });
    }
  } catch {
    /* storage blocked: the tool opens on its own list */
  }
}

/**
 * Everything the Me tab's Matches lists, read once when the dashboard
 * opens (the tab's badge needs it) and again when the tab is shown: the
 * signed-in player's own live links and tournaments from the server, and
 * what this phone's tools keep. For userId alone; another account reads
 * again.
 */
export function useMatches(userId: string, shown: boolean): MatchesData {
  const [state, setState] = useState<{ for: string; links: MineLink[] | null; tournaments: TournamentRow[]; stores: PhoneStores; now: number } | null>(null);
  const [stores, setStores] = useState<{ for: string; stores: PhoneStores; now: number } | null>(null);
  const readAt = useRef(0);
  // Bumped to read it all again.
  const [turn, setTurn] = useState(0);
  const reload = useCallback(() => setTurn((x) => x + 1), []);

  useEffect(() => {
    let alive = true;
    readAt.current = Date.now();
    // This phone's own lists first: they need no network.
    const t = setTimeout(() => alive && setStores({ for: userId, stores: readStores(), now: Date.now() }), 0);
    void Promise.all([readLinks(), myTournaments().catch(() => null)]).then(([links, tours]) => {
      if (!alive) return;
      setState({ for: userId, links, tournaments: tournamentRows(tours, loadStore().list), stores: readStores(), now: Date.now() });
    });
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [userId, turn]);

  // Shown again (a tab tap, the phone back on the page): what was scored meanwhile is read.
  useEffect(() => {
    if (!shown) return;
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - readAt.current > FRESH_MS) reload();
    };
    const t = setTimeout(again, 0);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", again);
    };
  }, [shown, reload]);

  const mine = state && state.for === userId ? state : null;
  const phone = mine ?? (stores && stores.for === userId ? stores : null);
  return useMemo(() => {
    const st = phone?.stores ?? EMPTY_STORES;
    const now = phone?.now ?? 0;
    return {
      links: mine ? mine.links : undefined,
      tournaments: mine ? mine.tournaments : undefined,
      stores: st,
      now,
      live: now ? liveNow(mine?.links ?? null, st, now) : 0,
      reload,
    };
  }, [mine, phone, reload]);
}

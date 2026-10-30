"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getGameLines, getMyRequests, getPendingRequestsFor, getUserGames, getUserJoinedGames, type GameLine } from "@/lib/queries/games";
import { getUnreadCount } from "@/lib/queries/notifications";
import { ownerRpc, type OwnerHome } from "@/lib/my/client";
import { getGameStatus } from "@/lib/utils/game";
import type { Game, GameRequest } from "@/types/game";

export type MeData = {
  loading: boolean;
  /** Games they host, and games they were accepted into. */
  created: Game[];
  joined: Game[];
  /** Requests they sent to join games, and those games by id (sport, time, host, venue). */
  requests: GameRequest[];
  requestGames: Map<string, GameLine>;
  /** Players waiting for their answer: pending requests to join the games they host that are not over. */
  incoming: GameRequest[];
  /** Unread notifications; null until known. */
  unread: number | null;
  /** Turfs they run or asked to run on myTapturf; null until known (or when the check failed). */
  turfs: number | null;
  /** Hosted and joined games not over yet, each once. */
  upcoming: number;
  /** Requests that wait on someone: theirs to answer (incoming) and theirs sent. */
  pending: number;
  setRequests: (r: GameRequest[]) => void;
  setUnread: (n: number) => void;
  reloadRequests: () => Promise<void>;
};

const EMPTY_LINES = new Map<string, GameLine>();

/**
 * What the Me tab counts and lists, read once for the header's numbers
 * and the tabs' badges (the Games and Requests tabs show the same lists,
 * so nothing is read twice). Only real numbers from the person's own
 * rows: nothing is shown until it is known.
 */
export function useMeData(userId: string): MeData {
  const [state, setState] = useState<{ for: string; created: Game[]; joined: Game[]; requests: GameRequest[] } | null>(null);
  // Read after the lists, from them (a query each, only when there is something to name).
  const [extraFor, setExtraFor] = useState<{ for: string; incoming: GameRequest[]; games: Map<string, GameLine> } | null>(null);
  const [unreadFor, setUnreadFor] = useState<{ for: string; n: number } | null>(null);
  const [turfsFor, setTurfsFor] = useState<{ for: string; n: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([getUserGames(userId), getUserJoinedGames(userId), getMyRequests(userId)]).then(([c, j, r]) => {
      if (!alive) return;
      setState({ for: userId, created: c.data, joined: j.data, requests: r.data });
      const hosting = c.data.filter((g) => getGameStatus(g) !== "expired").map((g) => g.id);
      const asked = [...new Set(r.data.map((q) => q.game_id))];
      void Promise.all([getPendingRequestsFor(hosting), getGameLines(asked)]).then(([inc, lines]) => {
        if (alive) setExtraFor({ for: userId, incoming: inc.data, games: new Map(lines.data.map((g) => [g.id, g])) });
      });
    });
    void getUnreadCount(userId)
      .then(({ data, error }) => alive && !error && setUnreadFor({ for: userId, n: data }))
      .catch(() => {});
    // myTapturf's own read of the turfs this sign-in runs (its database function checks who is asking).
    void ownerRpc<OwnerHome>("owner_home")
      .then((h) => alive && setTurfsFor({ for: userId, n: h.signed_in ? h.turfs.length : 0 }))
      .catch(() => alive && setTurfsFor({ for: userId, n: null }));
    return () => {
      alive = false;
    };
  }, [userId]);

  const mine = state && state.for === userId ? state : null;
  const created = useMemo(() => mine?.created ?? [], [mine]);
  const joined = useMemo(() => mine?.joined ?? [], [mine]);
  const requests = useMemo(() => mine?.requests ?? [], [mine]);

  const upcoming = useMemo(() => {
    const ids = new Set<string>();
    for (const g of [...created, ...joined]) if (getGameStatus(g) !== "expired") ids.add(g.id);
    return ids.size;
  }, [created, joined]);

  const extra = extraFor && extraFor.for === userId ? extraFor : null;
  const incoming = useMemo(() => extra?.incoming ?? [], [extra]);

  const setRequests = useCallback((r: GameRequest[]) => setState((s) => (s ? { ...s, requests: r } : s)), []);
  const reloadRequests = useCallback(async () => {
    const { data } = await getMyRequests(userId);
    setState((s) => (s && s.for === userId ? { ...s, requests: data } : s));
  }, [userId]);
  const setUnread = useCallback((n: number) => setUnreadFor({ for: userId, n }), [userId]);

  return {
    loading: !mine,
    created,
    joined,
    requests,
    requestGames: extra?.games ?? EMPTY_LINES,
    incoming,
    unread: unreadFor && unreadFor.for === userId ? unreadFor.n : null,
    turfs: turfsFor && turfsFor.for === userId ? turfsFor.n : null,
    upcoming,
    pending: incoming.length + requests.filter((r) => r.status === "pending").length,
    setRequests,
    setUnread,
    reloadRequests,
  };
}

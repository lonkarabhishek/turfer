"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getGameLines, getMyRequests, getPendingRequestsFor, getUserGames, getUserJoinedGames, type GameLine } from "@/lib/queries/games";
import { getUnreadCount } from "@/lib/queries/notifications";
import { quietToken } from "@/lib/account/client";
import { myBookingsCall } from "@/lib/booking/client";
import { parseMine } from "@/lib/booking/requests";
import type { MyBookingRequest } from "@/lib/booking/types";
import { ownerRpc, type OwnerHome } from "@/lib/my/client";
import { createClient } from "@/lib/supabase/client";
import type { SignedInWith } from "@/components/auth/AuthProvider";
import { getGameStatus } from "@/lib/utils/game";
import type { Game, GameRequest } from "@/types/game";

export type MeData = {
  /** The games and requests sent, until read. */
  loading: boolean;
  /** Players waiting for an answer and the requested games' names, read after those (the Requests tab waits for both). */
  extraLoading: boolean;
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
  /** Requests that wait on someone: theirs to answer (incoming), theirs sent, and their turf requests waiting for the turf. */
  pending: number;
  /** Their booking requests to turfs (lib/booking), newest first; empty until read, or before the database has them. */
  bookings: MyBookingRequest[];
  /** When they were read (the states are as of then). */
  bookingsAt: number;
  /** The turf requests are not read yet. */
  bookingsLoading: boolean;
  reloadBookings: () => Promise<void>;
  setRequests: (r: GameRequest[]) => void;
  setUnread: (n: number) => void;
  reloadRequests: () => Promise<void>;
  /** Read the games (and what follows from them) again: a repeat's games were cancelled. */
  reloadGames: () => void;
};

const EMPTY_LINES = new Map<string, GameLine>();

/**
 * What the Me tab counts and lists, read once for the header's numbers
 * and the tabs' badges (the Games and Requests tabs show the same lists,
 * so nothing is read twice). Only real numbers from the person's own
 * rows: nothing is shown until it is known.
 */
export function useMeData(userId: string, signedInWith: SignedInWith | null): MeData {
  // Requests and notifications come from the games routes as this sign-in, read quietly (never a sign-out).
  const readToken = quietToken(signedInWith);
  const [state, setState] = useState<{ for: string; created: Game[]; joined: Game[]; requests: GameRequest[] } | null>(null);
  // Read after the lists, from them (a query each, only when there is something to name).
  const [extraFor, setExtraFor] = useState<{ for: string; incoming: GameRequest[]; games: Map<string, GameLine> } | null>(null);
  const [unreadFor, setUnreadFor] = useState<{ for: string; n: number } | null>(null);
  const [turfsFor, setTurfsFor] = useState<{ for: string; n: number | null } | null>(null);
  const [gamesRead, setGamesRead] = useState(0);
  const [bookingsFor, setBookingsFor] = useState<{ for: string; list: MyBookingRequest[]; at: number } | null>(null);

  /** The turf requests (GET /api/booking-requests), read with the quiet token; none on a failed read. */
  const readBookings = useCallback(async (): Promise<{ list: MyBookingRequest[]; at: number }> => {
    try {
      const a = await myBookingsCall(readToken);
      const mine = a.status === 200 ? parseMine(a.body) : null;
      return { list: mine?.requests ?? [], at: Date.now() };
    } catch {
      return { list: [], at: Date.now() };
    }
  }, [readToken]);

  // In parallel with the game requests below.
  useEffect(() => {
    let alive = true;
    void readBookings().then((b) => alive && setBookingsFor({ for: userId, ...b }));
    return () => {
      alive = false;
    };
  }, [userId, readBookings]);

  useEffect(() => {
    let alive = true;
    void Promise.all([getUserGames(userId), getUserJoinedGames(userId), getMyRequests(readToken)]).then(([c, j, r]) => {
      if (!alive) return;
      setState({ for: userId, created: c.data, joined: j.data, requests: r.data });
      const hosting = c.data.filter((g) => getGameStatus(g) !== "expired").map((g) => g.id);
      const asked = [...new Set(r.data.map((q) => q.game_id))];
      void Promise.all([getPendingRequestsFor(readToken, hosting), getGameLines(asked)])
        .then(([inc, lines]) => {
          if (alive) setExtraFor({ for: userId, incoming: inc.data, games: new Map(lines.data.map((g) => [g.id, g])) });
        })
        .catch(() => alive && setExtraFor({ for: userId, incoming: [], games: new Map() }));
    });
    void getUnreadCount(readToken)
      .then(({ data, error }) => alive && !error && setUnreadFor({ for: userId, n: data }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // gamesRead: reloadGames asks for it all again.
  }, [userId, readToken, gamesRead]);

  // myTapturf's own read of the turfs this sign-in runs (its database function checks who is asking).
  // A Google sign-in rides on its Supabase session, so only a phone sign-in fetches a Firebase token:
  // someone who never used a phone code never downloads the Firebase SDK here.
  useEffect(() => {
    if (!signedInWith) return;
    let alive = true;
    const home = async (): Promise<OwnerHome> => {
      if (signedInWith === "phone") return ownerRpc<OwnerHome>("owner_home");
      const { data, error } = await createClient().rpc("owner_home", { p_token: null });
      if (error) throw new Error(error.message);
      return data as OwnerHome;
    };
    void home()
      .then((h) => alive && setTurfsFor({ for: userId, n: h.signed_in ? h.turfs.length : 0 }))
      .catch(() => alive && setTurfsFor({ for: userId, n: null }));
    return () => {
      alive = false;
    };
  }, [userId, signedInWith]);

  const mine = state && state.for === userId ? state : null;
  const created = useMemo(() => mine?.created ?? [], [mine]);
  const joined = useMemo(() => mine?.joined ?? [], [mine]);
  const requests = useMemo(() => mine?.requests ?? [], [mine]);

  const upcoming = useMemo(() => {
    const ids = new Set<string>();
    for (const g of [...created, ...joined]) if (g.status !== "cancelled" && getGameStatus(g) !== "expired") ids.add(g.id);
    return ids.size;
  }, [created, joined]);

  const extra = extraFor && extraFor.for === userId ? extraFor : null;
  const incoming = useMemo(() => extra?.incoming ?? [], [extra]);

  const setRequests = useCallback((r: GameRequest[]) => setState((s) => (s ? { ...s, requests: r } : s)), []);
  const reloadRequests = useCallback(async () => {
    const { data } = await getMyRequests(readToken);
    setState((s) => (s && s.for === userId ? { ...s, requests: data } : s));
  }, [userId, readToken]);
  const setUnread = useCallback((n: number) => setUnreadFor({ for: userId, n }), [userId]);
  const reloadGames = useCallback(() => setGamesRead((n) => n + 1), []);
  const reloadBookings = useCallback(async () => {
    const b = await readBookings();
    setBookingsFor({ for: userId, ...b });
  }, [userId, readBookings]);
  const booked = bookingsFor && bookingsFor.for === userId ? bookingsFor : null;
  const bookings = useMemo(() => booked?.list ?? [], [booked]);
  // The states are the database's as of the read: a waiting one is waiting for the turf.
  const bookingsWaiting = bookings.filter((r) => r.status === "waiting").length;

  return {
    loading: !mine,
    extraLoading: !extra,
    created,
    joined,
    requests,
    requestGames: extra?.games ?? EMPTY_LINES,
    incoming,
    unread: unreadFor && unreadFor.for === userId ? unreadFor.n : null,
    turfs: turfsFor && turfsFor.for === userId ? turfsFor.n : null,
    upcoming,
    pending: incoming.length + requests.filter((r) => r.status === "pending").length + bookingsWaiting,
    bookings,
    bookingsAt: booked?.at ?? 0,
    bookingsLoading: !booked,
    reloadBookings,
    setRequests,
    setUnread,
    reloadRequests,
    reloadGames,
  };
}

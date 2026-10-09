"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCityPref, type CityId } from "@/lib/city";
import { getUserLocation, type Coords } from "@/lib/utils/location";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";

export type AskResponse = {
  query: string;
  intent: "find_turf" | "find_game" | "compare" | "question" | "other";
  summary: string;
  reply: string;
  followups: string[];
  source: "claude" | "keywords";
  filters: {
    city: string | null;
    sport: string | null;
    areas: string[];
    maxPrice: number | null;
    time: string | null;
    when: string | null;
    skill: string | null;
    open24x7: boolean;
    wantsNearby: boolean;
    needs: string[];
    players: number | null;
    sort: string;
  };
  memo: Record<string, unknown>;
  needsLocation: boolean;
  relaxed: string[];
  total: number;
  failed?: boolean;
  turfs?: (Turf & { distanceKm?: number })[];
  games?: (Game & { distanceKm?: number })[];
  missing?: string[];
  compare?: { verdict: string; rows: { label: string; values: string[] }[]; best_for: string[]; caveats: string | null } | null;
  answer?: { answer: string; covered: boolean } | null;
};

export type Turn = { id: string; user: string; res: AskResponse | null; error?: string; at: number };
export type PageContext = { turf?: { id: string; name: string } | null; city?: CityId | null };

type Ctx = {
  open: boolean;
  openPanel: (prefill?: string) => void;
  closePanel: () => void;
  turns: Turn[];
  busy: boolean;
  send: (text: string) => Promise<void>;
  reset: () => void;
  requestLocation: () => Promise<void>;
  locating: boolean;
  hasLocation: boolean;
  pageContext: PageContext;
  setPageContext: (c: PageContext) => void;
  draft: string;
  setDraft: (v: string) => void;
};

const AskCtx = createContext<Ctx | null>(null);
const STORE = "tapturf_ask_thread_v1";
const MAX_TURNS = 30;

/**
 * One conversation for the whole site. The thread survives navigation
 * (sessionStorage) so you can ask on the home page, open a turf, and
 * keep going. The server gets the last three turns and the page you
 * are on, so "does this one have parking" works.
 */
export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState("");
  const [pageContext, setPageContext] = useState<PageContext>({});
  const locRef = useRef<Coords | null>(null);
  const [hasLocation, setHasLocation] = useState(false);
  const hydrated = useRef(false);

  // Restore the thread once on the client.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as Turn[];
        if (Array.isArray(saved)) setTurns(saved.filter((t) => t.res).slice(-MAX_TURNS));
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.filter((t) => t.res).slice(-MAX_TURNS)));
    } catch {
      /* ignore */
    }
  }, [turns]);

  const send = useCallback(
    async (text: string, loc?: Coords | null) => {
      const q = text.trim();
      if (q.length < 1 || busy) return;
      setBusy(true);
      setDraft("");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const history = turns
        .filter((t) => t.res)
        .slice(-3)
        .map((t) => ({ user: t.user, reply: t.res!.reply, filters: t.res!.memo }));
      setTurns((prev) => [...prev, { id, user: q, res: null, at: Date.now() }].slice(-MAX_TURNS));
      try {
        const params = new URLSearchParams({ q });
        const city = pageContext.city ?? getCityPref();
        if (city) params.set("city", city);
        const at = loc ?? locRef.current;
        if (at) {
          params.set("lat", at.lat.toFixed(4));
          params.set("lng", at.lng.toFixed(4));
        }
        if (history.length) params.set("h", JSON.stringify(history));
        if (pageContext.turf || pageContext.city) params.set("ctx", JSON.stringify({ turf: pageContext.turf?.name ?? null, city: pageContext.city ?? null }));
        const r = await fetch(`/api/ask?${params}`);
        if (r.status === 429) throw new Error("That's a lot of questions in a row. Give it a few minutes.");
        if (!r.ok) throw new Error("I'm having trouble right now. Try again in a moment.");
        const data = (await r.json()) as AskResponse;
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, res: data } : t)));
      } catch (e) {
        const msg = (e as Error).message || "Something went wrong.";
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: msg } : t)));
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, pageContext],
  );

  const requestLocation = useCallback(async () => {
    setLocating(true);
    try {
      const me = await getUserLocation();
      locRef.current = me;
      setHasLocation(true);
      const last = [...turns].reverse().find((t) => t.res?.needsLocation);
      if (last) {
        setTurns((prev) => prev.filter((t) => t.id !== last.id));
        await send(last.user, me);
      }
    } catch {
      setTurns((prev) => [...prev, { id: `${Date.now()}-loc`, user: "Use my location", res: null, error: "Couldn't get your location. Name an area instead.", at: Date.now() }]);
    } finally {
      setLocating(false);
    }
  }, [turns, send]);

  const openPanel = useCallback(
    (prefill?: string) => {
      setOpen(true);
      if (prefill && prefill.trim()) void send(prefill);
    },
    [send],
  );
  const closePanel = useCallback(() => setOpen(false), []);
  const reset = useCallback(() => {
    setTurns([]);
    setDraft("");
    try {
      sessionStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ open, openPanel, closePanel, turns, busy, send: (t) => send(t), reset, requestLocation, locating, hasLocation, pageContext, setPageContext, draft, setDraft }),
    [open, openPanel, closePanel, turns, busy, send, reset, requestLocation, locating, hasLocation, pageContext, draft],
  );
  return <AskCtx.Provider value={value}>{children}</AskCtx.Provider>;
}

export function useAsk(): Ctx {
  const v = useContext(AskCtx);
  if (!v) throw new Error("useAsk outside AskProvider");
  return v;
}

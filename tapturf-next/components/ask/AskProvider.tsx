"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getCityPref, type CityId } from "@/lib/city";
import { getUserLocation, type Coords } from "@/lib/utils/location";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";

export type AskResponse = {
  query: string;
  intent: "find_turf" | "find_game" | "compare" | "question" | "create_game" | "tool" | "other" | "blog";
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
  freeLeft: number | null;
  relaxed: string[];
  total: number;
  failed?: boolean;
  turfs?: (Turf & { distanceKm?: number })[];
  games?: (Game & { distanceKm?: number })[];
  missing?: string[];
  compare?: { verdict: string; rows: { label: string; values: string[] }[]; best_for: string[]; caveats: string | null } | null;
  answer?: { answer: string; covered: boolean } | null;
  /** For create_game: the sentence to draft the wizard from. */
  draft?: string;
  /** For tool: the free cricket tool that fits. */
  tool?: { slug: string; name: string; tagline: string; href: string };
  /** For blog: the short version of the article on screen. outline: the model couldn't, so its sections instead. */
  blog?: { slug: string; title: string; readMinutes: number; kind: "ai" | "outline"; gist: string; points: string[]; cta: { href: string; label: string } | null };
};

/** `retry`: the error offers Try again (too slow, no connection, server error). `tries`: times Try again was pressed. */
export type Turn = { id: string; user: string; res: AskResponse | null; error?: string; retry?: boolean; tries?: number; at: number };
export type PageContext = { turf?: { id: string; name: string } | null; city?: CityId | null; blog?: { slug: string; title: string } | null };

type Ctx = {
  open: boolean;
  openPanel: (prefill?: string) => void;
  closePanel: () => void;
  turns: Turn[];
  busy: boolean;
  send: (text: string) => Promise<void>;
  /** Asks a failed turn's message again, in the same turn. */
  retry: (id: string) => void;
  reset: () => void;
  requestLocation: () => Promise<void>;
  locating: boolean;
  hasLocation: boolean;
  pageContext: PageContext;
  setPageContext: (c: PageContext) => void;
  draft: string;
  setDraft: (v: string) => void;
  signedIn: boolean;
  pending: string | null;
  freeLeft: number | null;
  signIn: () => void;
};

const AskCtx = createContext<Ctx | null>(null);
const STORE = "tapturf_ask_thread_v1";
const PENDING = "tapturf_ask_pending";
const ANON = "tapturf_ask_anon";

/** Browser id for the free-answer allowance; survives reloads. */
function anonId(): string {
  try {
    let v = localStorage.getItem(ANON);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(ANON, v);
    }
    return v;
  } catch {
    return crypto.randomUUID();
  }
}
const MAX_TURNS = 30;
/** Past this the answer is not coming (the database is struggling): stop waiting and offer Try again. */
const TIMEOUT = 25_000;
const TOO_SLOW = "This is taking too long on our side. Try again in a moment.";
const OFFLINE = "Couldn't reach TapTurf just now. Check your connection and try again.";
const TROUBLE = "I'm having trouble right now. Try again in a moment.";

/** The last three answered turns, sent so follow-ups work. */
const historyOf = (turns: Turn[]) =>
  turns
    .filter((t) => t.res)
    .slice(-3)
    .map((t) => ({ user: t.user, reply: t.res!.reply, filters: t.res!.memo }));

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
  const { user, login } = useAuth();
  // A message typed while signed out waits here and goes once they're in.
  const [pending, setPending] = useState<string | null>(null);
  /** Free answers left today while signed out; null until the first reply or when signed in. */
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const locRef = useRef<Coords | null>(null);
  const [hasLocation, setHasLocation] = useState(false);
  const hydrated = useRef(false);
  // Tapping a turf or game inside the chat navigates; the sheet closes
  // so the new page is not hidden behind it. The thread is kept.
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

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
      // Google sign-in is a full page round trip; the message they typed
      // before it comes back with them.
      const p = sessionStorage.getItem(PENDING);
      if (p) {
        setPending(p);
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      if (pending) sessionStorage.setItem(PENDING, pending);
      else sessionStorage.removeItem(PENDING);
    } catch {
      /* ignore */
    }
  }, [pending]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.filter((t) => t.res).slice(-MAX_TURNS)));
    } catch {
      /* ignore */
    }
  }, [turns]);

  /** Fetches the answer for turn `id` and fills it in, or leaves an error on it. */
  const ask = useCallback(
    async (id: string, q: string, history: ReturnType<typeof historyOf>, loc?: Coords | null) => {
      setBusy(true);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT);
      // Worth a Try again: too slow, no connection, or the server failing.
      let retry = false;
      try {
        const params = new URLSearchParams({ q });
        if (user) params.set("uid", user.id);
        else params.set("aid", anonId());
        const city = pageContext.city ?? getCityPref();
        if (city) params.set("city", city);
        const at = loc ?? locRef.current;
        if (at) {
          params.set("lat", at.lat.toFixed(4));
          params.set("lng", at.lng.toFixed(4));
        }
        if (history.length) params.set("h", JSON.stringify(history));
        if (pageContext.turf || pageContext.city || pageContext.blog)
          params.set("ctx", JSON.stringify({ turf: pageContext.turf?.name ?? null, city: pageContext.city ?? null, blog: pageContext.blog?.slug ?? null }));
        let r: Response;
        try {
          r = await fetch(`/api/ask?${params}`, { signal: ctl.signal });
        } catch {
          retry = true;
          throw new Error(OFFLINE);
        }
        if (r.status === 429) throw new Error("That's a lot of questions in a row. Give it a few minutes.");
        if (r.status === 401) {
          // Free answers used up: keep the message and show the sign-in card.
          setFreeLeft(0);
          setPending(q);
          setTurns((prev) => prev.filter((t) => t.id !== id));
          return;
        }
        if (!r.ok) {
          retry = true;
          throw new Error(TROUBLE);
        }
        const data = (await r.json()) as AskResponse;
        if (!user) setFreeLeft(data.freeLeft);
        // The search broke on our side (the reply is only its opening line): same as a 500.
        if (data.failed) {
          retry = true;
          throw new Error(TROUBLE);
        }
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, res: data } : t)));
      } catch (e) {
        const slow = ctl.signal.aborted;
        const msg = slow ? TOO_SLOW : (e as Error).message || "Something went wrong.";
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: msg, retry: slow || retry } : t)));
      } finally {
        clearTimeout(timer);
        setBusy(false);
      }
    },
    [pageContext, user],
  );

  const send = useCallback(
    async (text: string, loc?: Coords | null) => {
      const q = text.trim();
      if (q.length < 1 || busy) return;
      if (!user && freeLeft === 0) {
        // Out of free answers: park the message, show the sign-in card.
        setPending(q);
        setDraft("");
        return;
      }
      setDraft("");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTurns((prev) => [...prev, { id, user: q, res: null, at: Date.now() }].slice(-MAX_TURNS));
      await ask(id, q, historyOf(turns), loc);
    },
    [busy, turns, user, freeLeft, ask],
  );

  // Try again: the same message in the same turn, so no second bubble.
  const retry = useCallback(
    (id: string) => {
      const turn = turns.find((t) => t.id === id);
      // Out of free answers: the server would refuse it, so the sign-in card takes over.
      if (busy || !turn?.error || (!user && freeLeft === 0)) return;
      setTurns((prev) => prev.map((t) => (t.id === id ? { id, user: t.user, res: null, tries: (t.tries ?? 0) + 1, at: Date.now() } : t)));
      void ask(id, turn.user, historyOf(turns.filter((t) => t.id !== id)));
    },
    [busy, turns, user, freeLeft, ask],
  );

  // Signed in: the allowance no longer applies.
  useEffect(() => {
    if (user) setFreeLeft(null);
  }, [user]);

  // Signed in with a message waiting: send it now.
  useEffect(() => {
    if (user && pending && !busy) {
      const q = pending;
      setPending(null);
      void send(q);
    }
  }, [user, pending, busy, send]);

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
    () => ({ open, openPanel, closePanel, turns, busy, send: (t) => send(t), retry, reset, requestLocation, locating, hasLocation, pageContext, setPageContext, draft, setDraft, signedIn: !!user, pending, freeLeft, signIn: login }),
    [open, openPanel, closePanel, turns, busy, send, retry, reset, requestLocation, locating, hasLocation, pageContext, draft, user, pending, freeLeft, login],
  );
  return <AskCtx.Provider value={value}>{children}</AskCtx.Provider>;
}

export function useAsk(): Ctx {
  const v = useContext(AskCtx);
  if (!v) throw new Error("useAsk outside AskProvider");
  return v;
}

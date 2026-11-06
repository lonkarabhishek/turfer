"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { changeTournament, createTournament, readTournament, tournamentsReady } from "@/components/tournament/api";
import { newSecret, saveEntry, secretFor } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";
import { markPushed, nextOp, toCreateBody, waiting } from "@/lib/turfSession/sync";
import type { LiveError, Session } from "@/lib/turfSession/types";

/**
 * A turf session's live link, kept in step with the phone (lib/turfSession/
 * sync.ts says how). The session is saved first, the secret in it before
 * the create goes; then one change at a time, each decided from the
 * tournament as the last reply showed it. A failure waits 2, 4, 8, 16, then
 * 30 s, and tries again when the phone is back online or the page is shown.
 * A session from a game asks for its link once match 1 is over (or "Share
 * a live link now"); one from the tools page, or scored "on this phone
 * instead" (game.local), only when asked, and never as the game's.
 */

export type LivePhase = "unready" | "off" | "creating" | "on" | "waiting" | "error";

type Mutate = (id: string, fn: (s: Session) => Session) => void;

const BACKOFF = [2_000, 4_000, 8_000, 16_000, 30_000];

/** The tournament the create body makes, as the server would serve it: no read needed right after. */
function viewOf(code: string, body: ReturnType<typeof toCreateBody>["body"]): Tournament {
  const now = new Date().toISOString();
  return {
    code,
    status: "on",
    name: body.name,
    settings: body.settings,
    teams: body.teams.map((t, i) => ({ id: i + 1, name: t.name, short: t.short })),
    fixtures: (body.fixtures ?? []).map((f) => ({ ...f, live: null, liveResult: null })),
    rev: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** `account`: the signed-in account's id, or null. */
export function useSessionSync(session: Session | null, mutate: Mutate, account: string | null): { phase: LivePhase; waiting: number; ready: boolean; start: () => void; retry: () => void } {
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  /** The last try failed (offline, busy): results wait on the phone. */
  const [failing, setFailing] = useState(false);
  const sRef = useRef(session);
  const accountRef = useRef(account);
  const signedIn = !!account;
  const busy = useRef(false);
  const view = useRef<{ code: string; t: Tournament; fresh: boolean } | null>(null);
  const fails = useRef(0);
  const bad = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    sRef.current = session;
    accountRef.current = account;
  });

  useEffect(() => {
    let alive = true;
    void tournamentsReady().then((r) => alive && setReady(r));
    return () => {
      alive = false;
    };
  }, []);

  const later = useCallback((ms?: number) => {
    if (timer.current) clearTimeout(timer.current);
    const wait = ms ?? BACKOFF[Math.min(fails.current, BACKOFF.length - 1)];
    setFailing(true);
    timer.current = setTimeout(() => setTick((t) => t + 1), wait);
  }, []);

  const setError = useCallback(
    (id: string, error: LiveError, extra: Partial<Session["live"]> = {}) => mutate(id, (s) => ({ ...s, live: { ...s.live, error, ...extra } })),
    [mutate],
  );

  const pump = useCallback(async () => {
    const s = sRef.current;
    if (!s || !ready || busy.current) return;
    const live = s.live;
    // Only "busy" tries again by itself; the rest wait for Try again (or a login).
    if (live.error && live.error !== "busy") return;
    if (live.follow) return;
    busy.current = true;
    try {
      if (!live.code) {
        if (!live.want) return;
        // The secret is kept before the create goes, so a reply lost on the way is still this phone's.
        const secret = live.secret ?? newSecret();
        if (!live.secret) mutate(s.id, (x) => ({ ...x, live: { ...x.live, secret } }));
        const made = toCreateBody({ ...s, live: { ...live, secret } }, secret);
        const r = await createTournament({ ...made.body, ...(s.game && !s.game.local ? { game: s.game.id } : {}) });
        const body = r.body as { code?: string; error?: string; field?: string; kept?: boolean };
        if (r.status === 200 && typeof body.code === "string") {
          // Kept with the account by the create, saved as the Live Tournament's own create saves it: no second claim.
          const acct = body.kept && accountRef.current ? { acct: accountRef.current } : {};
          saveEntry(body.code, { secret, name: made.body.name, at: Date.now(), ...acct });
          view.current = { code: body.code, t: viewOf(body.code, made.body), fresh: true };
          fails.current = 0;
          mutate(s.id, (x) => ({ ...x, live: { ...x.live, secret, code: body.code!, pushed: made.pushed, teamsPushed: made.teamsPushed, error: null } }));
          return;
        }
        if (r.status === 409 && typeof body.code === "string") {
          // The game has its link already. This phone's own? Its reply lost (this session's secret), or made by
          // a session deleted here since (the secret this phone kept for that code). A change with each says.
          const code = body.code;
          const kept = secretFor(code);
          const tries = kept && kept !== secret ? [secret, kept] : [secret];
          for (const key of tries) {
            const mine = await changeTournament(code, key, { op: "team", id: 1, name: s.sides.a.name, short: null });
            const mb = mine.body as { ok?: boolean; view?: { tournament: Tournament } | null; error?: string };
            if (mine.status === 200 && mb.ok) {
              saveEntry(code, { secret: key, name: made.body.name, at: Date.now() });
              view.current = mb.view ? { code, t: mb.view.tournament, fresh: true } : null;
              fails.current = 0;
              mutate(s.id, (x) => ({ ...x, live: { ...x.live, secret: key, code, pushed: {}, teamsPushed: null, error: null } }));
              return;
            }
            if (mine.status === 410) return setError(s.id, "stopped");
            if (mine.status === 403) continue;
            fails.current++;
            later();
            return;
          }
          // Refused for every secret this phone has: another phone's link.
          setError(s.id, "taken", { follow: code });
          return;
        }
        if (r.status === 401) return setError(s.id, "login");
        if (r.status === 403) return setError(s.id, "not_in_game");
        if (r.status === 429) return setError(s.id, "limit");
        if (r.status === 503) {
          setError(s.id, "busy");
          fails.current++;
          later();
          return;
        }
        if (r.status === 400) return setError(s.id, "failed");
        // No answer (offline): try again later, nothing said yet.
        fails.current++;
        later();
        return;
      }

      const code = live.code;
      const secret = live.secret;
      if (!secret) return;
      const v = view.current?.code === code ? view.current : null;
      const step = nextOp(s, v?.t ?? null, !!v?.fresh);
      if (!step) {
        fails.current = 0;
        setFailing(false);
        if (live.error) setError(s.id, null);
        return;
      }
      if ("read" in step) {
        const r = await readTournament(code, Date.now());
        const b = r.body as { tournament?: Tournament };
        if (r.status === 200 && b.tournament) {
          if (b.tournament.status !== "on") return setError(s.id, "stopped");
          view.current = { code, t: b.tournament, fresh: true };
          fails.current = 0;
          setTick((t) => t + 1);
          return;
        }
        if (r.status === 404) return setError(s.id, "stopped");
        fails.current++;
        later();
        return;
      }
      const r = await changeTournament(code, secret, step.op);
      const b = r.body as { ok?: boolean; view?: { tournament: Tournament } | null; error?: string };
      if (r.status === 200 && b.ok) {
        fails.current = 0;
        bad.current = 0;
        setFailing(false);
        view.current = b.view ? { code, t: b.view.tournament, fresh: true } : v ? { ...v, fresh: false } : null;
        mutate(s.id, (x) => ({ ...x, live: { ...markPushed(x.live, step.mark), error: null } }));
        setTick((t) => t + 1);
        return;
      }
      if (r.status === 403 || r.status === 410) return setError(s.id, "stopped");
      if (r.status === 409 || r.status === 400) {
        // A name in use, or a change the page would not take: read it again, and stop after three in a row.
        bad.current++;
        view.current = v ? { ...v, fresh: false } : null;
        if (bad.current >= 3) return setError(s.id, "failed");
        later(1_000);
        return;
      }
      // Lost on the way, or too soon (slow): the same change goes again; a fixture is only added against a fresh read.
      if (v) view.current = { ...v, fresh: false };
      fails.current++;
      if (r.status === 429 && b.error === "limit") setError(s.id, "limit");
      later(r.status === 429 && b.error === "slow" ? 1_500 : undefined);
    } finally {
      busy.current = false;
    }
  }, [ready, mutate, setError, later]);

  // A session from a game asks for its link once a match is over.
  const wantNow = !!session && !!session.game && !session.game.local && !session.live.want && !session.live.code && session.matches.some((m) => !!m.result);
  useEffect(() => {
    if (wantNow && ready && session) mutate(session.id, (s) => ({ ...s, live: { ...s.live, want: true } }));
  }, [wantNow, ready, session, mutate]);

  // Back from a login (signed out, then in): the link goes on where it stopped. Never on a sign-in the server
  // refused already, or it would ask again and again.
  const wasSignedIn = useRef(signedIn);
  const sessionId = session?.id ?? null;
  const loginWait = session?.live.error === "login";
  useEffect(() => {
    const cameIn = signedIn && !wasSignedIn.current;
    wasSignedIn.current = signedIn;
    if (cameIn && loginWait && sessionId) mutate(sessionId, (s) => ({ ...s, live: { ...s.live, error: null } }));
  }, [signedIn, loginWait, sessionId, mutate]);

  const key = session ? `${session.id}:${session.updatedAt}:${session.live.code ?? ""}:${session.live.error ?? ""}:${session.live.want}` : "";
  useEffect(() => {
    void pump();
  }, [key, tick, pump]);

  useEffect(() => {
    const wake = () => {
      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      if (document.visibilityState === "visible") {
        fails.current = Math.min(fails.current, 1);
        setTick((t) => t + 1);
      }
    };
    const off = () => setOffline(true);
    window.addEventListener("online", wake);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", wake);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const start = useCallback(() => {
    const s = sRef.current;
    if (!s) return;
    fails.current = 0;
    mutate(s.id, (x) => ({ ...x, live: { ...x.live, want: true, error: null } }));
  }, [mutate]);

  const retry = useCallback(() => {
    const s = sRef.current;
    if (!s) return;
    fails.current = 0;
    bad.current = 0;
    view.current = null;
    mutate(s.id, (x) => ({ ...x, live: { ...x.live, error: null } }));
  }, [mutate]);

  const left = session ? waiting(session) : 0;
  let phase: LivePhase = "off";
  if (!ready) phase = "unready";
  else if (!session) phase = "off";
  else if (session.live.error && session.live.error !== "limit" && session.live.error !== "busy") phase = "error";
  else if (!session.live.code) phase = session.live.want ? (session.live.error ? "error" : "creating") : "off";
  else phase = left > 0 && (offline || failing) ? "waiting" : "on";
  return { phase, waiting: left, ready, start, retry };
}

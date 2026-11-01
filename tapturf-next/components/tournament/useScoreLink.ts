"use client";

import { useEffect, useRef, useState } from "react";
import { loadHandoff, readScoreAsk, saveHandoff, secretFor, takeHandoff, type ScoreHandoff } from "@/lib/tournament/store";
import { changeTournament } from "./api";

/**
 * The Live Cricket Scorer's side of "Score live" on a tournament fixture.
 * The tournament page leaves a hand-off (lib/tournament/store.ts) and opens
 * the scorer with ?tournament=<code>&fixture=<id>: the scorer takes it to
 * fill in the new match (teams, overs, title, venue, live link on), notes
 * the match it made (bindScoreLink), and once that match's live link has a
 * code, links the fixture to it with the organiser's secret (this browser
 * holds it). The note survives a trip to the login page and a reload, so
 * a link that needed a login is linked when it comes on.
 */

/** The hand-off for this visit's ?tournament=&fixture=, or null; the query string without them (rest). */
export function takeTournamentAsk(search: string, now: number): { ask: ScoreHandoff | null; rest: string; asked: boolean } {
  const { code, fixture, rest } = readScoreAsk(search);
  return { ask: takeHandoff(loadHandoff(), code, fixture, now), rest, asked: code !== null };
}

/** The new match is this fixture's: kept with the hand-off, so the link can follow. */
export function bindScoreLink(h: ScoreHandoff, matchId: string): void {
  saveHandoff({ ...h, matchId });
}

/** What the scorer's card says about it: the tournament and match, and whether the fixture is linked yet. */
export type ScoreLink = { code: string; title: string; linked: boolean };

/** Whether the hand-off's fixture is linked to this live code: a link turned off and a new one started is linked again. */
const linkedTo = (h: ScoreHandoff, code: string | null) => !!h.linked && (code === null || code === h.linked);

/**
 * Links the fixture once the match's live link has a code (codeOf reads
 * the link as stored now), and says how it stands for the match on screen.
 * After a refusal it tries again on a later render, at most every 20 s.
 */
export function useScoreLink(matchId: string | null, codeOf: (id: string) => string | null): ScoreLink | null {
  // Bumped when a link goes through, so the card reads the hand-off again.
  const [, setDone] = useState(0);
  const busy = useRef(false);
  const lastTry = useRef(0);
  const h = matchId && typeof window !== "undefined" ? loadHandoff() : null;
  const mine = h && h.matchId === matchId ? h : null;
  const code = mine ? codeOf(mine.matchId!) : null;

  useEffect(() => {
    if (!mine || linkedTo(mine, code) || !code || busy.current || Date.now() - lastTry.current < 20_000) return;
    const secret = secretFor(mine.code);
    if (!secret) return;
    busy.current = true;
    lastTry.current = Date.now();
    void changeTournament(mine.code, secret, { op: "live_link", id: mine.fixture, liveCode: code, home: mine.home, away: mine.away }).then((r) => {
      busy.current = false;
      if ("ok" in r.body) {
        saveHandoff({ ...mine, linked: code });
        setDone((n) => n + 1);
      }
    });
  });

  return mine ? { code: mine.code, title: mine.title, linked: linkedTo(mine, code) } : null;
}

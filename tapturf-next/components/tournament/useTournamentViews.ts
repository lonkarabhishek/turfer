"use client";

import { useEffect, useState } from "react";
import { VIEWS_REFRESH_MS, isBotAgent, newViewTag, planView, readSeen, unseeView } from "@/lib/live/views";
import { TOURNAMENTS_KEY } from "@/lib/tournament/store";

/** The browser's note of the tournaments it counted (code, day, time), as LIVE_SEEN_KEY is for live scorecards. */
const SEEN_KEY = "tapturf_tournament_seen_v1";
const countedHere = new Set<string>();

/**
 * How many times this tournament's page has been viewed, or null to show
 * none (before 20261102_live_tournaments.sql, or any error). Counted as a
 * live scorecard's view is (lib/live/views.ts): once it is on screen,
 * never for a bot or an automated browser, nor in the organiser's own
 * browser (it holds the tournament's secret), the same browser again
 * within 30 minutes is the same view, and unique once a day. Then read
 * again every VIEWS_REFRESH_MS while on screen.
 */
export function useTournamentViews(code: string): number | null {
  const [got, setGot] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    const show = (j: unknown) => {
      const v = j && typeof j === "object" ? (j as { views?: unknown }).views : null;
      if (on && typeof v === "number" && Number.isSafeInteger(v) && v >= 0) setGot(v);
    };
    const read = () =>
      fetch(`/api/tournament/${code}/views`)
        .then((r) => (r.ok ? r.json() : null))
        .then(show, () => {});
    let started = false;
    const start = () => {
      if (started || document.visibilityState !== "visible") return;
      started = true;
      let organiser = false;
      let seen: string | null = null;
      try {
        organiser = (localStorage.getItem(TOURNAMENTS_KEY) ?? "").includes(`"${code}"`);
        seen = localStorage.getItem(SEEN_KEY);
      } catch {
        /* no storage: counted once per page load */
      }
      const plan = countedHere.has(code) || organiser || navigator.webdriver === true || isBotAgent(navigator.userAgent) ? null : planView(readSeen(seen), code, Date.now());
      if (!plan || !plan.send) return void read();
      countedHere.add(code);
      const was = readSeen(seen)[code];
      const at = plan.next[code].at;
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(plan.next));
      } catch {
        /* as above */
      }
      const undo = () => {
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify(unseeView(readSeen(localStorage.getItem(SEEN_KEY)), code, at, was)));
        } catch {
          /* as above */
        }
      };
      fetch(`/api/tournament/${code}/views`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unique: plan.unique, v: newViewTag() }), cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (j: { counted?: unknown; views?: unknown } | null) => {
            if (j?.counted !== true) undo();
            return typeof j?.views === "number" ? show(j) : read();
          },
          () => undo(),
        );
    };
    start();
    document.addEventListener("visibilitychange", start);
    const timer = setInterval(() => {
      if (started && document.visibilityState === "visible") void read();
    }, VIEWS_REFRESH_MS);
    return () => {
      on = false;
      document.removeEventListener("visibilitychange", start);
      clearInterval(timer);
    };
  }, [code]);
  return got;
}

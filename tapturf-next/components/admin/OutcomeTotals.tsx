"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin/adminFetch";
import {
  CLOSED_LABEL,
  CLOSED_NOTE,
  CLOSED_SWITCH,
  DEFAULT_WINDOW,
  LIST_CAP_LINE,
  LIST_NOTE,
  LIST_PAGE,
  TAPS_NOTE,
  WINDOW_DAYS,
  WINDOW_KEYS,
  WINDOW_LABEL,
  breakdown,
  errorText,
  headline,
  hourRows,
  listCountLine,
  listNext,
  listPage,
  outcomeFoldLine,
  rowWords,
  tapRows,
  topLine,
  turfName,
  turfState,
  windowLine,
  wrongLine,
  wrongMore,
  type AnswerList,
  type AnswerRow,
  type OutcomeError,
  type OutcomeListAnswer,
  type OutcomeTotals as Totals,
  type OutcomeTotalsAnswer,
  type TurfRef,
  type WindowKey,
} from "@/lib/admin/outcomeTotals";
import { useFoldReport } from "./Fold";

/**
 * "Did you get a slot?" for the admin (the site owner, 26 Nov 2026: "In
 * admin can I see responses to the Did you get the slot popup?";
 * 20261127_contact_outcome_totals.sql; lib/admin/outcomeTotals.ts has every
 * word and the API): what players answered when the site asked them after
 * a Call or WhatsApp tap (lib/outcome/), for all turfs. A 7 days, 30 days,
 * All time switch; the headline counts the players who answered, never
 * rows; the breakdown; cards closed without an answer, said apart; Call,
 * WhatsApp and Ask for a slot; then, for the last 30 days, the turfs with a
 * wrong number (the one thing to act on), the turfs with the most answers
 * and the hours players said they got; and every answer one by one, newest
 * first, 20 at a time. Read only once this section is opened. Before the
 * file is applied it says "Totals aren't available yet." and nothing else.
 */

const card = "rounded-2xl border border-primary-200 bg-white p-3.5";
const heading = "text-[12px] font-bold text-primary-600";

type Problem = OutcomeError | "network";
const problemText = (p: Problem) => (p === "network" ? "Couldn't load the answers. Check your connection." : errorText(p));

export function OutcomeTotals() {
  const [win, setWin] = useState<WindowKey>(DEFAULT_WINDOW);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Read only once the fold around it is open.
  const [opened, setOpened] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const report = useFoldReport();

  useEffect(() => {
    const fold = root.current?.closest("details");
    const t = setTimeout(() => {
      if (!fold || fold.open) setOpened(true);
    }, 0);
    const onToggle = () => {
      if (fold?.open) setOpened(true);
    };
    fold?.addEventListener("toggle", onToggle);
    return () => {
      clearTimeout(t);
      fold?.removeEventListener("toggle", onToggle);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch("/api/admin/outcomes", { cache: "no-store" });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as OutcomeTotalsAnswer;
      if (j.ok) {
        setTotals(j.totals);
        setProblem(null);
      } else setProblem(j.error);
    } catch {
      setProblem("network");
    }
  }, []);

  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [opened, load]);

  useEffect(() => {
    if (totals) report?.({ line: outcomeFoldLine(totals) });
  }, [totals, report]);

  if (!totals) {
    return (
      <div ref={root} data-outcome-totals>
        {problem === "not_set_up" ? (
          // Before the migration: one quiet line, no retry, nothing red.
          <p className="text-sm text-primary-500">{problemText(problem)}</p>
        ) : problem ? (
          <p className="text-sm text-red-600">
            {problemText(problem)}{" "}
            <button type="button" onClick={() => void load()} className="ml-1 inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
              Retry
            </button>
          </p>
        ) : (
          <p className="text-sm text-primary-500">{opened ? "Loading the answers…" : "Open to load the answers."}</p>
        )}
      </div>
    );
  }

  const w = totals.windows[win];
  const rows = breakdown(w);
  const more = wrongMore(totals);

  return (
    <div ref={root} className="space-y-4" data-outcome-totals>
      <div role="group" aria-label="Days counted" className="inline-flex h-11 max-w-full rounded-full border border-primary-200 bg-white p-1">
        {WINDOW_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={win === k}
            onClick={() => setWin(k)}
            className={`h-full rounded-full px-3.5 text-[13px] font-semibold ${win === k ? "bg-primary-900 text-white" : "text-primary-700 hover:bg-primary-50"}`}
          >
            {WINDOW_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <section className={card} aria-label={`What players answered, ${WINDOW_LABEL[win]}`}>
          <p className="text-[19px] font-bold leading-snug text-primary-900 [overflow-wrap:anywhere] sm:text-[22px]" data-headline>
            {headline(w)}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-primary-500">{windowLine(w, totals.today)}</p>
          <ul className="mt-4 space-y-2.5" data-breakdown>
            {rows.map((r) => (
              <li key={r.key} title={r.title}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="min-w-0 font-medium text-primary-800">{r.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-primary-900">{r.n.toLocaleString("en-IN")}</span>
                </div>
                {/* A thin bar: this answer's part of all the answers. The number beside it is the value; the bar only compares. */}
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-100" aria-hidden>
                  {r.n > 0 && <div className="h-full rounded-r-full bg-accent-500" style={{ width: `${Math.max(2, r.share * 100)}%` }} />}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-3">
          <section className={card} data-closed>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="min-w-0 font-medium text-primary-800">{CLOSED_LABEL}</span>
              <span className="shrink-0 font-semibold tabular-nums text-primary-900">{w.dismissed.toLocaleString("en-IN")}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-primary-500">{CLOSED_NOTE}</p>
          </section>

          <section className={card} data-taps>
            <h3 className={heading}>How they reached the turf</h3>
            <dl className="mt-2 space-y-2">
              {tapRows(w).map((t) => (
                <div key={t.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                  <dt className="font-medium text-primary-800">{t.label}</dt>
                  <dd className="tabular-nums text-primary-700">{t.line}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] leading-snug text-primary-500">{TAPS_NOTE}</p>
          </section>
        </div>
      </div>

      <div>
        <h3 className="text-[14px] font-semibold text-primary-900">In the last 30 days</h3>
        <p className="text-[12px] leading-snug text-primary-500">These three are always the last 30 days, whichever days are picked above.</p>
        <div className="mt-2 grid gap-3 lg:grid-cols-3 lg:items-start">
          {totals.wrongNumbers.length > 0 ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-3.5" data-wrong-numbers>
              <h4 className="text-[13px] font-bold text-red-700">Turfs with a wrong number</h4>
              <p className="mt-0.5 text-[12px] leading-snug text-red-700">Check the number on each page.</p>
              <ul className="mt-2 space-y-2.5">
                {totals.wrongNumbers.map((t) => (
                  <li key={t.id}>
                    <TurfName t={t} />
                    <p className="text-[13px] font-semibold leading-snug text-red-700">{wrongLine(t, totals.today)}</p>
                  </li>
                ))}
              </ul>
              {more && <p className="mt-2 text-[12px] text-red-700">{more}</p>}
            </section>
          ) : (
            <section className={card} data-wrong-numbers>
              <h4 className={heading}>Turfs with a wrong number</h4>
              <p className="mt-2 text-[13px] text-primary-500">Nobody reported a wrong number.</p>
            </section>
          )}

          <section className={card} data-top-turfs>
            <h4 className={heading}>Most answers</h4>
            {totals.topTurfs.length === 0 ? (
              <p className="mt-2 text-[13px] text-primary-500">No answers yet.</p>
            ) : (
              <ol className="mt-2 space-y-2.5">
                {totals.topTurfs.map((t) => (
                  <li key={t.id}>
                    <TurfName t={t} />
                    <p className="text-[13px] leading-snug text-primary-700">{topLine(t)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={card} data-hours>
            <h4 className={heading}>Hours players got</h4>
            {totals.hours.length === 0 ? (
              <p className="mt-2 text-[13px] text-primary-500">Nobody named an hour yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {hourRows(totals.hours).map((h) => (
                  <li key={h.hour} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="font-medium text-primary-800">{h.label}</span>
                    <span className="font-semibold tabular-nums text-primary-900">{h.n.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Its own state per window: a new window starts again at the first 20. */}
      <Answers key={win} win={win} />
    </div>
  );
}

/** A turf's name, linked to its page when it has one; long names wrap. (GrowthNumbers.tsx lists turfs with it too.) */
export function TurfName({ t }: { t: TurfRef }) {
  const state = turfState(t);
  const cls = "text-[14px] font-semibold leading-snug text-primary-900 [overflow-wrap:anywhere]";
  return (
    <p className="leading-snug">
      {t.path ? (
        // Never fetched ahead: a list of turfs must not start their pages rendering.
        <Link href={t.path} target="_blank" prefetch={false} className={`${cls} underline decoration-primary-300 underline-offset-2 hover:decoration-primary-900`}>
          {turfName(t)}
        </Link>
      ) : (
        <span className={t.name ? cls : `${cls} font-medium text-primary-600`}>{turfName(t)}</span>
      )}
      {(t.city || state) && <span className="text-[13px] text-primary-500"> · {[t.city, state].filter(Boolean).join(" · ")}</span>}
    </p>
  );
}

/** Every answer of the window, newest first: 20 rows, "Show more" loads the next 20, 200 at most. */
function Answers({ win }: { win: WindowKey }) {
  const [closed, setClosed] = useState(false);
  const [want, setWant] = useState(LIST_PAGE);
  // The list, and the clock when it was read (for "the year when it isn't this one").
  const [got, setGot] = useState<{ list: AnswerList; at: number } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);
  const rows = useRef<HTMLUListElement>(null);
  // After "Show more": the first new row gets the focus, without the page jumping.
  const focusAt = useRef<number | null>(null);

  const load = useCallback(async (days: number, limit: number, withClosed: boolean) => {
    setLoading(true);
    try {
      const r = await adminFetch(`/api/admin/outcomes/list?days=${days}&limit=${limit}${withClosed ? "&closed=1" : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as OutcomeListAnswer;
      if (j.ok) {
        setGot({ list: j.list, at: Date.now() });
        setProblem(null);
      } else setProblem(j.error);
    } catch {
      setProblem("network");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(WINDOW_DAYS[win], want, closed), 0);
    return () => clearTimeout(t);
  }, [win, want, closed, load]);

  useEffect(() => {
    const i = focusAt.current;
    if (i === null || !got || got.list.rows.length <= i) return;
    focusAt.current = null;
    (rows.current?.children[i] as HTMLElement | undefined)?.focus({ preventScroll: true });
  }, [got]);

  const list = got && got.list.dismissed === closed ? got.list : null;
  const page = list ? listPage(list, want) : null;

  return (
    <section data-answers>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-primary-900">Every answer</h3>
          <p className="text-[12px] leading-snug text-primary-500" aria-live="polite">
            {list ? `${listCountLine(list)}${list.n > 0 ? `, ${WINDOW_LABEL[win] === "All time" ? "all time" : `last ${WINDOW_LABEL[win]}`}, newest first.` : ""}` : problem ? "" : "Loading the answers…"}
            {list && loading ? " Refreshing…" : ""}
          </p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-medium text-primary-800">
          <input
            type="checkbox"
            checked={closed}
            onChange={(e) => {
              setClosed(e.target.checked);
              setWant(LIST_PAGE);
            }}
            className="h-5 w-5 shrink-0 rounded border-primary-300 accent-primary-900"
          />
          {CLOSED_SWITCH}
        </label>
      </div>

      {problem && (
        <p className={`mt-2 text-sm ${problem === "not_set_up" ? "text-primary-500" : "text-red-600"}`}>
          {problemText(problem)}{" "}
          {problem !== "not_set_up" && (
            <button type="button" onClick={() => void load(WINDOW_DAYS[win], want, closed)} className="ml-1 inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
              Retry
            </button>
          )}
        </p>
      )}

      {list && list.rows.length > 0 && (
        <>
          <p className="mt-1 text-[12px] leading-snug text-primary-500">{LIST_NOTE}</p>
          <ul ref={rows} className="mt-2 space-y-2">
            {list.rows.map((r) => (
              <Answer key={r.id} r={r} now={got!.at} />
            ))}
          </ul>
        </>
      )}
      {page?.more && (
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            focusAt.current = list!.rows.length;
            setWant(listNext(want));
          }}
          className="mt-3 inline-flex h-11 items-center rounded-full border border-primary-200 px-5 text-[14px] font-bold text-primary-800 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Loading…" : `Show more (${page.left.toLocaleString("en-IN")} left)`}
        </button>
      )}
      {page?.capped && <p className="mt-3 text-[13px] text-primary-500">{LIST_CAP_LINE}</p>}
    </section>
  );
}

/** One answer: a small stacked card on a phone, three columns from a tablet up. Never a wide table. */
function Answer({ r, now }: { r: AnswerRow; now: number }) {
  const w = rowWords(r, now);
  const quiet = r.said === "dismissed";
  return (
    <li tabIndex={-1} className="rounded-2xl border border-primary-200 bg-white p-3 outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 sm:grid sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-x-4" data-answer={r.said}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:block">
        <p className="text-[12px] leading-snug text-primary-500 tabular-nums">{w.when}</p>
        <p className="sm:mt-1">
          <span className="inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">{w.via}</span>
        </p>
      </div>
      <div className="mt-1.5 min-w-0 sm:mt-0">
        <TurfName t={r.turf} />
      </div>
      <div className="mt-1.5 min-w-0 sm:mt-0">
        <p className="text-[14px] leading-snug">
          <span className={quiet ? "font-medium text-primary-500" : "font-bold text-primary-900"}>{w.said}</span>
          {w.named && <span className="text-primary-700"> {w.named}</span>}
        </p>
        {w.asked && <p className="mt-0.5 text-[13px] leading-snug text-primary-700 [overflow-wrap:anywhere]">{w.asked}</p>}
        {w.saidSlot && <p className="mt-0.5 text-[13px] leading-snug text-primary-700">{w.saidSlot}</p>}
        {w.gap && <p className="mt-0.5 text-[12px] leading-snug text-primary-500">{w.gap}</p>}
      </div>
    </li>
  );
}

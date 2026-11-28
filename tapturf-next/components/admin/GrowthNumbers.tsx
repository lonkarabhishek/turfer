"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin/adminFetch";
import {
  ACTIONS_NOTE,
  ACTIONS_TITLE,
  ACTIVE_LABEL,
  ACTIVE_NOTE,
  BOOKINGS_LEAD,
  BOOKINGS_NOTE,
  BOOKINGS_TITLE,
  CONFIRMED_LABEL,
  CONFIRMED_NOTE,
  CONTACTS_TITLE,
  CONTACT_MEANING,
  DEFAULT_WINDOW,
  ESTIMATE_NOTE,
  ESTIMATE_OFF,
  ESTIMATE_TITLE,
  GOT_SLOT_LABEL,
  GOT_SLOT_NOTE,
  REPEAT_TITLE,
  REQUEST_SHEET_NOTE,
  REVENUE_FACT,
  REVENUE_TITLE,
  SIGNED_OUT_NOTE,
  TAP_ACCOUNT_NOTE,
  TOP_TURFS_NONE,
  TOP_TURFS_TITLE,
  WINDOW_KEYS,
  WINDOW_LABEL,
  actionRows,
  activeValue,
  confirmedValue,
  confirmedWhen,
  contactsHeadline,
  contactsTurfsLine,
  errorText,
  estimateCapLine,
  estimateRows,
  gotSlotValue,
  growthFoldLine,
  noAccountLine,
  repeatIntro,
  repeatRows,
  requestsLine,
  tapRows,
  topTurfLine,
  windowLine,
  type Growth,
  type GrowthAnswer,
  type GrowthError,
  type WindowKey,
} from "@/lib/admin/growth";
import { useFoldReport } from "./Fold";
import { TurfName } from "./OutcomeTotals";

/**
 * "People, contacts and bookings" for the admin (the site owner, 28 Nov
 * 2026: "start tracking unique turf contacts, repeat users, completed
 * bookings and revenue. Your current visit tracking explicitly counts
 * returning arrivals as new visits, so visits should not be confused with
 * unique users."; 20261130_growth_numbers.sql; lib/admin/growth.ts has every
 * word, the parse and the estimate). A 7 days, 30 days, All time switch,
 * then four blocks: unique turf contacts (people, and one person and one
 * turf as one contact) with the raw taps and the turfs contacted most;
 * repeat users; the two kinds of booking TapTurf can see, never added
 * together; and revenue, which is ₹0, with an estimate of booking value for
 * turfs that is always called an estimate. Read only once this section is
 * opened. Before the file is applied it says "These numbers aren't
 * available yet." and nothing else. Nothing here says who anyone is.
 */

const card = "rounded-2xl border border-primary-200 bg-white p-3.5";
const title = "text-[12px] font-bold text-primary-600";
const small = "text-[12px] leading-snug text-primary-500";
const label = "min-w-0 font-medium text-primary-800";
const value = "shrink-0 text-right font-semibold tabular-nums text-primary-900";

type Problem = GrowthError | "network";
const problemText = (p: Problem) => (p === "network" ? "Couldn't load the numbers. Check your connection." : errorText(p));
const fmt = (n: number) => n.toLocaleString("en-IN");

export function GrowthNumbers() {
  const [win, setWin] = useState<WindowKey>(DEFAULT_WINDOW);
  const [growth, setGrowth] = useState<Growth | null>(null);
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
      const r = await adminFetch("/api/admin/growth", { cache: "no-store" });
      const j = (await r.json().catch(() => ({ ok: false, error: "unavailable" }))) as GrowthAnswer;
      if (j.ok) {
        setGrowth(j.growth);
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
    if (growth) report?.({ line: growthFoldLine(growth) });
  }, [growth, report]);

  if (!growth) {
    return (
      <div ref={root} data-growth-numbers>
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
          <p className="text-sm text-primary-500">{opened ? "Loading the numbers…" : "Open to load the numbers."}</p>
        )}
      </div>
    );
  }

  const w = growth.windows[win];
  const top = growth.topTurfs[win];
  const estimate = growth.estimate?.[win] ?? null;
  const turfsLine = contactsTurfsLine(w);
  const noAccount = noAccountLine(w);
  const intro = repeatIntro(w);
  const when = confirmedWhen(w);
  const cap = estimateCapLine(growth.estimateCap);

  return (
    <div ref={root} className="space-y-3" data-growth-numbers>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
        <p className="text-[13px] leading-snug text-primary-500" data-window-line>
          {windowLine(w, growth.today)}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {/* 1. Unique turf contacts: people, and one person and one turf as one contact; then the raw taps. */}
        <section className={card} aria-label={`${CONTACTS_TITLE}, ${WINDOW_LABEL[win]}`} data-contacts>
          <h3 className={title}>{CONTACTS_TITLE}</h3>
          <p className="mt-1 text-[19px] font-bold leading-snug text-primary-900 [overflow-wrap:anywhere] sm:text-[22px]" data-headline>
            {contactsHeadline(w)}
          </p>
          {turfsLine && <p className="mt-0.5 text-[13px] leading-snug text-primary-700">{turfsLine}</p>}
          <p className={`mt-1 ${small}`}>{CONTACT_MEANING}</p>
          <dl className="mt-3 space-y-2 border-t border-primary-100 pt-3" data-taps>
            {tapRows(w).map((r) => (
              <div key={r.key} className={r.part ? "pl-4" : ""}>
                <div className={`flex items-baseline justify-between gap-3 ${r.part ? "text-[13px]" : "text-[14px]"}`}>
                  <dt className={r.part ? "min-w-0 text-primary-700" : label}>{r.label}</dt>
                  <dd className={r.part ? "shrink-0 tabular-nums text-primary-700" : value}>{fmt(r.n)}</dd>
                </div>
                {r.note && <p className={small}>{r.note}</p>}
              </div>
            ))}
          </dl>
          {noAccount && <p className={`mt-2 ${small}`}>{noAccount}</p>}
        </section>

        <section className={card} data-top-turfs>
          <h3 className={title}>{TOP_TURFS_TITLE}</h3>
          {top.length === 0 ? (
            <p className="mt-2 text-[13px] text-primary-500">{TOP_TURFS_NONE}</p>
          ) : (
            <ol className="mt-2 space-y-2.5">
              {top.map((t) => (
                <li key={t.id}>
                  <TurfName t={t} />
                  <p className="text-[13px] leading-snug text-primary-700 tabular-nums">{topTurfLine(t)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 2. Repeat users: of the people who contacted a turf, then anyone signed in who did something on two days. */}
        <section className={card} aria-label={`${REPEAT_TITLE}, ${WINDOW_LABEL[win]}`} data-repeat>
          <h3 className={title}>{REPEAT_TITLE}</h3>
          {intro ? (
            <>
              <p className="mt-1 text-[14px] font-semibold text-primary-900">{intro}</p>
              <dl className="mt-2 space-y-2">
                {repeatRows(w).map((r) => (
                  <div key={r.key}>
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <dt className={label}>{r.label}</dt>
                      <dd className={value}>{r.value}</dd>
                    </div>
                    <p className={small}>{r.note}</p>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-1 text-[14px] text-primary-700">{contactsHeadline(w)}</p>
          )}
          <div className="mt-3 border-t border-primary-100 pt-3" data-active>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
              <p className={label}>{ACTIVE_LABEL}</p>
              <p className={value}>{activeValue(w)}</p>
            </div>
            <p className={small}>{ACTIVE_NOTE}</p>
            <h4 className="mt-3 text-[12px] font-semibold text-primary-700">{ACTIONS_TITLE}</h4>
            <ul className="mt-1.5 space-y-1.5">
              {actionRows(w).map((a) => (
                <li key={a.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-primary-700">{a.label}</span>
                  <span className="shrink-0 tabular-nums text-primary-800">{a.value}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 ${small}`}>{ACTIONS_NOTE}</p>
          </div>
          <p className="mt-3 rounded-xl bg-primary-50 px-3 py-2 text-[12px] leading-snug text-primary-700" data-signed-out-note>
            {SIGNED_OUT_NOTE}
          </p>
        </section>

        <div className="space-y-3">
          {/* 3. Completed bookings: two numbers, each labelled with what it is, never added together. */}
          <section className={card} aria-label={`${BOOKINGS_TITLE}, ${WINDOW_LABEL[win]}`} data-bookings>
            <h3 className={title}>{BOOKINGS_TITLE}</h3>
            <p className={`mt-0.5 ${small}`}>{BOOKINGS_LEAD}</p>
            <div className="mt-3" data-confirmed>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                <p className={label}>{CONFIRMED_LABEL}</p>
                <p className={value}>{confirmedValue(w)}</p>
              </div>
              {when && <p className="text-[13px] leading-snug text-primary-700">{when}</p>}
              <p className="text-[13px] leading-snug text-primary-700">{requestsLine(w)}</p>
              <p className={small}>{CONFIRMED_NOTE}</p>
            </div>
            <div className="mt-3 border-t border-primary-100 pt-3" data-got-slot>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                <p className={label}>{GOT_SLOT_LABEL}</p>
                <p className={value}>{gotSlotValue(w)}</p>
              </div>
              <p className={small}>{GOT_SLOT_NOTE}</p>
            </div>
            <p className={`mt-3 ${small}`}>{BOOKINGS_NOTE}</p>
          </section>

          {/* 4. Revenue: the fact first, then an estimate that is always called one. */}
          <section className={card} aria-label={`${REVENUE_TITLE}, ${WINDOW_LABEL[win]}`} data-revenue>
            <h3 className={title}>{REVENUE_TITLE}</h3>
            <p className="mt-1 text-[16px] font-bold leading-snug text-primary-900" data-revenue-fact>
              {REVENUE_FACT}
            </p>
            <h4 className="mt-3 border-t border-primary-100 pt-3 text-[13px] font-semibold text-primary-900">{ESTIMATE_TITLE}</h4>
            <p className={small}>{ESTIMATE_NOTE}</p>
            {estimate ? (
              <div className="mt-2 space-y-3" data-estimate>
                {estimateRows(estimate).map((e) => (
                  <div key={e.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                      <p className={label}>{e.label}</p>
                      <p className={value}>{e.value}</p>
                    </div>
                    <p className="text-[13px] leading-snug text-primary-700">{e.stands}</p>
                    {e.ranged && <p className={small}>{e.ranged}</p>}
                    {e.unpriced && <p className={small}>{e.unpriced}</p>}
                  </div>
                ))}
                {cap && <p className={small}>{cap}</p>}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-primary-600">{ESTIMATE_OFF}</p>
            )}
          </section>
        </div>
      </div>

      <p className={`px-1 ${small}`} data-small-print>
        {TAP_ACCOUNT_NOTE} {REQUEST_SHEET_NOTE}
      </p>
    </div>
  );
}

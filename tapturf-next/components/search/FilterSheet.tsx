"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { FACET_LABELS, PRICE_STEPS, SURFACES, SURFACE_LABELS, rupees, type Facet, type SurfaceKind } from "@/lib/turfList/facts";
import { extrasOf, hasExtras, type ExtraFilters, type ListCounts } from "@/lib/turfList/query";
import { FREE_FILTER_HINT } from "@/lib/availability/free";

/** The sheet's toggles, grouped, with a line under the ones that need one. */
const GROUPS: { title: string; facets: [Facet, string | null][] }[] = [
  {
    title: "Timings",
    facets: [
      ["free", FREE_FILTER_HINT],
      ["open", "By the hours we have, India time"],
      ["24h", null],
    ],
  },
  {
    title: "At the ground",
    facets: [
      ["lights", "Night play"],
      ["covered", "Few turfs are marked yet"],
      ["parking", null],
      ["washroom", null],
      ["changing", null],
      ["equipment", "To use or hire there"],
      ["coaching", null],
    ],
  },
  { title: "Rating", facets: [["rated", "The Google rating"]] },
  { title: "Owner", facets: [["claimed", "Its owner or manager runs its page on TapTurf"]] },
];

/** The popover: at most this tall (and 70% of the screen), never under this. */
const POPOVER_MAX = 640;
const POPOVER_MIN = 240;
/** Its gap under the button (mt-2), the room it leaves under itself, and the site header's room above the button (64 px from md up). */
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 16;
const HEADER_ROOM = 80;

/** The sheet's own words for a toggle (the pills use FACET_LABELS). */
const SHEET_LABELS: Partial<Record<Facet, string>> = {
  lights: "Floodlights",
  covered: "Covered (where we know)",
  rated: "Rated 4.5+",
};

/**
 * The listing's Filters: a bottom sheet on phones, a popover under the
 * Filters button from md up. Every tap applies at once (the list behind
 * it updates, and so do the numbers, which come with the list's first
 * batch: GET /api/turfs/list counts). Each number is how many turfs that
 * choice shows with everything else as it is; a choice with none is
 * greyed out, not hidden. The choices go into the page URL as the rest of
 * the filters do (lib/turfList/query.ts searchForFilters); nothing in here
 * is a link.
 */
export function FilterSheet({
  desktop,
  filters,
  counts,
  busy,
  total,
  noun,
  priceRule,
  onChange,
  onClear,
  onClose,
}: {
  /** A popover (md and up) rather than a bottom sheet. */
  desktop: boolean;
  filters: ExtraFilters;
  /** The current list's numbers, or null while they load. */
  counts: ListCounts | null;
  /** A new list (or its numbers) is loading: the numbers shown are the last list's. */
  busy: boolean;
  /** Turfs in the current list, or null while it loads. */
  total: number | null;
  /** "turf" or "court": what the list is of. */
  noun: string;
  /** Whose price the cap reads ("Football"), or null for the card's own. */
  priceRule: string | null;
  onChange: (extras: ExtraFilters) => void;
  onClear: () => void;
  /** `focus` false: closed by a click elsewhere, which takes the focus itself. */
  onClose: (focus?: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const { facets, price, surface } = extrasOf(filters);
  const on = new Set(facets);
  const any = hasExtras(filters);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // As a popover, it fits the screen under the Filters button, so its footer (Show N, Clear all)
  // is in view: with the button low on screen the page first moves up (the button to just under
  // the site's header, as far as the page can scroll), then the popover takes the room left.
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const anchor = panel.current?.parentElement;
    if (!desktop || !anchor) return;
    const fit = (scroll: boolean) => {
      const vh = window.innerHeight;
      const want = Math.min(POPOVER_MAX, vh * 0.7);
      const r = anchor.getBoundingClientRect();
      let room = vh - r.bottom - POPOVER_GAP - POPOVER_MARGIN;
      if (scroll && room < want) {
        const canScroll = document.documentElement.scrollHeight - vh - window.scrollY;
        const by = Math.min(want - room, r.top - HEADER_ROOM, canScroll);
        if (by > 0) {
          // Smooth or not (html's scroll-behavior), the button ends `by` higher.
          window.scrollBy({ top: by });
          room += by;
        }
      }
      setMaxH(Math.max(POPOVER_MIN, Math.floor(Math.min(want, room))));
    };
    fit(true);
    const onResize = () => fit(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [desktop]);

  // Focus, Esc, and (as a sheet) the scroll lock; as a popover, a tap outside closes it.
  useEffect(() => {
    const p = panel.current;
    p?.querySelector<HTMLElement>("#tt-filters-h")?.focus();
    const prev = document.body.style.overflow;
    if (!desktop) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    // A click elsewhere closes it and leaves the focus where that click puts it.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || !p || p.contains(t) || (t as Element).closest?.("[data-filters-button]")) return;
      closeRef.current(false);
    };
    document.addEventListener("keydown", onKey);
    if (desktop) document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      if (!desktop) document.body.style.overflow = prev;
    };
  }, [desktop]);

  const n = (x: number | undefined) => (counts && x != null ? x.toLocaleString("en-IN") : "–");
  const toggle = (f: Facet) => onChange({ facets: on.has(f) ? facets.filter((x) => x !== f) : [...facets, f], price, surface });
  const kinds = SURFACES.filter((k) => (counts?.surface[k] ?? 0) > 0 || surface === k);

  const body = (
    <div className={`px-5 pb-2 transition-opacity ${busy ? "opacity-60" : ""}`} aria-busy={busy}>
      {GROUPS.map((g) => (
        <section key={g.title} className="pt-4">
          <h3 className="text-[13px] font-semibold text-primary-500">{g.title}</h3>
          <ul className="mt-1">
            {g.facets.map(([f, hint]) => {
              const active = on.has(f);
              const count = counts?.f[f];
              const none = !!counts && count === 0 && !active;
              return (
                <li key={f}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-disabled={none || undefined}
                    onClick={() => !none && toggle(f)}
                    className={`w-full min-h-[52px] flex items-center gap-3 py-1.5 text-left focus-neon rounded-xl ${none ? "opacity-45 cursor-default" : "cursor-pointer"}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-primary-900">{SHEET_LABELS[f] ?? FACET_LABELS[f]}</span>
                      {hint && <span className="block text-[12px] text-primary-500">{hint}</span>}
                    </span>
                    <span className="text-[13px] text-primary-500 tabular-nums">{n(count)}</span>
                    <Switch on={active} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="pt-4">
        <h3 className="text-[13px] font-semibold text-primary-500">Price per hour, up to</h3>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Price per hour, up to">
          <Choice active={price == null} onClick={() => onChange({ facets, price: null, surface })} label="Any" count={n(counts?.anyPrice)} />
          {PRICE_STEPS.map((step) => {
            const count = counts?.price[String(step)];
            return (
              <Choice
                key={step}
                active={price === step}
                none={!!counts && count === 0 && price !== step}
                onClick={() => onChange({ facets, price: step, surface })}
                label={rupees(step)}
                count={n(count)}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-primary-500">
          Only {noun}s that list a price ({n(counts?.priced)} here){priceRule ? `, at the ${priceRule} price` : ""}.
        </p>
      </section>

      {kinds.length > 1 || surface ? (
        <section className="pt-4">
          <h3 className="text-[13px] font-semibold text-primary-500">Surface</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Surface">
            <Choice active={surface == null} onClick={() => onChange({ facets, price, surface: null })} label="Any" count={n(counts?.anySurface)} />
            {kinds.map((k: SurfaceKind) => (
              <Choice key={k} active={surface === k} onClick={() => onChange({ facets, price, surface: k })} label={SURFACE_LABELS[k]} count={n(counts?.surface[k] ?? 0)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex items-center gap-3 px-5 py-3 border-t border-primary-100 bg-white">
      <button
        type="button"
        onClick={onClear}
        aria-disabled={!any}
        className={`h-11 px-2 text-[15px] font-semibold underline underline-offset-2 ${any ? "text-primary-900 cursor-pointer" : "text-primary-300 cursor-default"}`}
      >
        Clear all
      </button>
      <button
        type="button"
        onClick={() => onClose()}
        className="ml-auto h-11 min-w-[150px] px-5 inline-flex items-center justify-center gap-2 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[15px] font-semibold press-tight cursor-pointer"
      >
        {total == null ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            Finding {noun}s
          </>
        ) : (
          `Show ${total.toLocaleString("en-IN")} ${total === 1 ? noun : `${noun}s`}`
        )}
      </button>
    </div>
  );

  const head = (
    <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-1">
      <h2 id="tt-filters-h" tabIndex={-1} className="font-display text-[22px] text-primary-900 leading-tight outline-none">
        Filters
      </h2>
      <button type="button" onClick={() => onClose()} aria-label="Close filters" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full hover:bg-primary-100 focus-neon cursor-pointer">
        <X className="w-5 h-5 text-primary-500" />
      </button>
    </div>
  );

  if (desktop) {
    return (
      <div
        ref={panel}
        role="dialog"
        aria-labelledby="tt-filters-h"
        className="absolute left-0 top-full mt-2 z-40 w-[400px] max-h-[min(70vh,640px)] flex flex-col bg-white rounded-2xl border border-primary-100 shadow-elevated overflow-hidden"
        style={maxH != null ? { maxHeight: maxH } : undefined}
      >
        {head}
        <div className="overflow-y-auto overscroll-contain min-h-0 flex-1">{body}</div>
        {footer}
      </div>
    );
  }
  return createPortal(
    <ViewportOverlay className="z-[70] flex items-end justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-black/40 animate-fade-in" onClick={() => onClose()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-filters-h"
        className="relative w-full max-h-[min(var(--vv-h,100dvh),max(calc(var(--vv-h,100dvh)*0.88),280px))] flex flex-col bg-white rounded-t-3xl shadow-elevated animate-slide-up overflow-hidden pb-[var(--safe-b,env(safe-area-inset-bottom))]"
      >
        {head}
        <div className="overflow-y-auto overscroll-contain min-h-0 flex-1">{body}</div>
        {footer}
      </div>
    </ViewportOverlay>,
    document.body,
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? "bg-primary-900" : "bg-primary-200"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-5" : ""}`} />
    </span>
  );
}

function Choice({ active, none = false, onClick, label, count }: { active: boolean; none?: boolean; onClick: () => void; label: ReactNode; count: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={none || undefined}
      onClick={() => !none && onClick()}
      className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full text-[14px] font-medium border transition-colors focus-neon ${
        active ? "bg-primary-900 border-primary-900 text-white" : "bg-white border-primary-200 text-primary-900 hover:border-primary-400"
      } ${none ? "opacity-45 cursor-default" : "cursor-pointer"}`}
    >
      {label}
      <span className={`tabular-nums text-[12px] ${active ? "text-white/75" : "text-primary-500"}`}>{count}</span>
    </button>
  );
}

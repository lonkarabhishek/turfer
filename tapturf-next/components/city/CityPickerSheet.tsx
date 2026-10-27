"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LocateFixed, Navigation, Search, X, Loader2 } from "lucide-react";
import {
  CITIES,
  isCitySlug,
  labelFor,
  locateCity,
  matchCities,
  setCityPref,
  type CityCount,
  type CitySource,
} from "@/lib/city";
import { plural } from "@/lib/home/format";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { useCityChoice } from "./useCityChoice";
import { cachedLiveCities, loadLiveCities, toRows, type LiveRow as Row } from "./liveCityList";

/** No live list at all (both reads failed): the curated cities, with no counts and no total. */
function fallbackRows(): Row[] {
  return CITIES.map((c) => ({ id: c.id, label: c.label, state: c.state, n: 0 }));
}

const PILL =
  "shrink-0 h-11 px-4 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-900 press-tight focus-neon hover:border-primary-900";

/**
 * The one city picker: "Change" on the city line, "Pick a city" and the
 * menu's city row open it through openCityPicker(). Search across every
 * city, popular cities with counts, precise location and "Detect my city
 * again". Every answer is one city: there is no "all of India" choice.
 * A modal sheet: focus is trapped, Esc closes without choosing, focus
 * goes back to whatever opened it.
 *
 * It sits in what the phone shows (ViewportOverlay): with the keyboard up
 * on iOS or in WhatsApp's browser, right above the keys, not under them.
 * While a name is typed (or the keys are up) it keeps its height instead
 * of shrinking to the few matches, so the matches start right under the
 * search box; "Detect my city again" steps aside while the keys are up.
 *
 * Every city with active turfs, with its count. The numbers (the total
 * in the search box, "TapTurf is in N cities", each city's count) come
 * only from the hourly list (/api/cities, the same read as the pick
 * screen, /turfs and the home hero; liveCityList.ts), so they never
 * disagree with the page underneath. `initial` is the footer's daily
 * copy (CityPicker): it gives the first open every city's row, uncurated
 * ones too, while the hourly list loads (the openers prefetch it), but
 * none of its counts. Without either, the curated cities. No list, no
 * numbers.
 */
export function CityPickerSheet({ initial }: { initial: CityCount[] | null }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "search">("list");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(() => cachedLiveCities() ?? (initial?.length ? toRows(initial) : null));
  // True once rows are the hourly list: only then are counts and the total shown.
  const [fresh, setFresh] = useState(() => cachedLiveCities() !== null);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState("");
  const [far, setFar] = useState<{ id: string; km: number } | null>(null);
  const [resetting, setResetting] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const choice = useCityChoice();
  const current = choice?.kind === "city" ? choice.city : null;
  const view = useVisualViewport(open);
  const keys = !!view?.keyboard;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = ((e as CustomEvent).detail?.mode as "list" | "search") ?? "list";
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMode(m);
      setQ("");
      setStatus("");
      setFar(null);
      setOpen(true);
    };
    window.addEventListener("tapturf:open-city-picker", onOpen);
    return () => window.removeEventListener("tapturf:open-city-picker", onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) el.focus();
  }, []);

  // The hourly list once per tab (usually prefetched by the opener).
  useEffect(() => {
    if (!open || fresh) return;
    let alive = true;
    void loadLiveCities().then((live) => {
      if (!alive || !live) return;
      setRows(live);
      setFresh(true);
    });
    return () => {
      alive = false;
    };
  }, [open, fresh]);

  // Scroll lock, focus, Esc and a Tab trap while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const p = panel.current;
    const first = mode === "search" ? p?.querySelector<HTMLElement>("input[type=search]") : p?.querySelector<HTMLElement>("#city-picker-h");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !p) return;
      const items = [...p.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input")].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === a || !p.contains(document.activeElement))) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mode, close]);

  const pick = (id: string, source: CitySource) => {
    // Every row is a city slug already; this only guards a bad answer.
    if (!isCitySlug(id)) {
      setStatus("Couldn't pick that city. Pick another below.");
      return;
    }
    setCityPref(id, { source });
    close();
  };

  const onGps = async () => {
    setLocating(true);
    setStatus("");
    setFar(null);
    const r = await locateCity();
    setLocating(false);
    if ("city" in r) return pick(r.city, "gps");
    if (r.error === "far") {
      setFar(r.nearest);
      setStatus(`No TapTurf city within 200 km of you yet. Closest is ${labelFor(r.nearest.id)}, ${r.nearest.km} km away.`);
    } else if (r.error === "denied") setStatus("Location is off. Pick your city below.");
    else setStatus("Couldn't get your location. Pick your city below.");
  };

  // The IP's city, stored as a confirmed pick: the person asked for it.
  // Nothing found leaves the current city as it is.
  const detectAgain = async () => {
    setResetting(true);
    setStatus("");
    try {
      const r = await fetch("/api/geo", { cache: "no-store" });
      const { city } = (await r.json()) as { city?: string | null };
      if (isCitySlug(city)) pick(city, "reset");
      else setStatus("We couldn't tell your city from your connection. Pick one above.");
    } catch {
      setStatus("Couldn't check right now. Pick your city above.");
    } finally {
      setResetting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const list = rows ?? fallbackRows();
  // A total only from the hourly list: the footer's daily copy can be a day behind
  // the page underneath, and the curated fallback is not "the cities TapTurf is in".
  const total = fresh && rows ? rows.length : null;
  const shown = (n: number) => (fresh && n > 0 ? n : 0);
  const searching = q.trim().length > 0;
  const results = searching ? matchCities(q, list) : [];
  const popular = [...list].sort((a, b) => b.n - a.n).slice(0, 8);
  const az = [...list].sort((a, b) => a.label.localeCompare(b.label));
  const count = (n: number) =>
    shown(n) > 0 ? <span className="font-normal text-primary-500 tabular-nums">{n.toLocaleString("en-IN")}</span> : null;

  const cityRow = (c: Row) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => pick(c.id, "picker")}
        aria-pressed={current === c.id}
        className="w-full flex items-center justify-between gap-3 min-h-[44px] px-3 rounded-xl hover:bg-primary-50 focus-neon text-left"
      >
        <span className="text-[15px] font-semibold text-primary-900">{c.label}</span>
        <span className="flex items-center gap-2 text-[13px] text-primary-500 tabular-nums">
          {shown(c.n) > 0 && c.n.toLocaleString("en-IN")}
          {current === c.id && <Check className="w-4 h-4 text-accent-600" strokeWidth={2.5} />}
        </span>
      </button>
    </li>
  );

  return createPortal(
    <ViewportOverlay box={view} className="z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={close} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-picker-h"
        // 85% of what shows. Typing keeps it that tall: the box stays put and the matches start under it.
        className={`relative w-full sm:max-w-md ${searching || keys ? "h-[calc(var(--vv-h,100dvh)*0.85)]" : "max-h-[calc(var(--vv-h,100dvh)*0.85)]"} flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated animate-slide-up overflow-hidden pb-[var(--safe-b,env(safe-area-inset-bottom))]`}
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <h2 id="city-picker-h" tabIndex={-1} className="font-display text-[22px] text-primary-900 leading-tight outline-none">
            Pick your city
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full hover:bg-primary-100 focus-neon">
            <X className="w-5 h-5 text-primary-500" />
          </button>
        </div>

        <div className="px-5">
          <label className="relative block">
            <span className="sr-only">Search cities</span>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={total ? `Search ${plural(total, "city", "cities")}` : "Search cities"}
              autoComplete="off"
              className="w-full h-11 pl-10 pr-4 rounded-full bg-primary-50 border border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            />
          </label>
          <button
            type="button"
            onClick={onGps}
            disabled={locating}
            className="mt-1 h-11 inline-flex items-center gap-2 text-[14px] font-semibold text-primary-900 focus-neon disabled:opacity-70"
          >
            {locating ? <Loader2 className="w-4 h-4 text-accent-600 animate-spin" /> : <Navigation className="w-4 h-4 text-accent-600" />}
            {locating ? "Finding you…" : "Use my precise location"}
          </button>
          <p aria-live="polite" className="text-[13px] text-primary-600">
            {status}
          </p>
          {far && (
            <button type="button" onClick={() => pick(far.id, "gps")} className={`${PILL} mt-2`}>
              Show {labelFor(far.id)}
            </button>
          )}
        </div>

        <div className="mt-2 px-3 pb-2 overflow-y-auto overscroll-contain min-h-0 flex-1">
          {searching ? (
            results.length > 0 ? (
              <ul aria-label="Matching cities">
                {results.map(cityRow)}
              </ul>
            ) : (
              <p className="px-2 py-4 text-[14px] text-primary-600">
                No city called &quot;{q.trim()}&quot; yet.{total ? ` TapTurf is in ${plural(total, "city", "cities")}.` : ""}
              </p>
            )
          ) : (
            <>
              <p className="px-2 text-[13px] font-semibold text-primary-500">Popular</p>
              <div className="mt-2 px-2 flex flex-wrap gap-2">
                {popular.map((c) => (
                  <button key={c.id} type="button" onClick={() => pick(c.id, "picker")} aria-pressed={current === c.id} className={PILL}>
                    {c.label}
                    {count(c.n)}
                  </button>
                ))}
              </div>
              <p className="mt-5 px-2 text-[13px] font-semibold text-primary-500">Cities A to Z</p>
              <ul className="mt-1">
                {az.map(cityRow)}
              </ul>
            </>
          )}
        </div>

        {/* Not while the keys are up: the matches need the room, and it's back as soon as they go down. */}
        {!keys && (
          <div className="border-t border-primary-200 px-3 py-2 flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              onClick={detectAgain}
              disabled={resetting}
              className="h-11 px-3 inline-flex items-center gap-2 rounded-full text-[14px] font-semibold text-primary-700 hover:bg-primary-50 focus-neon disabled:opacity-70"
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              Detect my city again
            </button>
          </div>
        )}
      </div>
    </ViewportOverlay>,
    document.body,
  );
}

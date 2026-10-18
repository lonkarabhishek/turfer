"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Navigation, Search, X } from "lucide-react";
import { useAsk } from "@/components/ask/AskProvider";
import { labelFor, locateCity, openCityPicker, setCityPref, type CitySource } from "@/lib/city";
import { trackCity } from "@/lib/analytics/city";
import { ASK_SEEN_KEY } from "@/lib/cityPrePaint";

export type CityAskProps = {
  cities: { id: string; label: string; n: number }[];
  cityCount: number;
  page: "/" | "/turfs" | "/games";
  /** No-JS target of the search pill: the page's own city list. */
  changeHref: string;
  /**
   * "sheet" (home): a compact bottom sheet docked above the bottom nav on
   * phones, so the hero stays visible, and an inline card on desktop.
   * "inline" (/turfs, /games): a card in the page flow at every width,
   * so it never covers the listing.
   */
  variant: "sheet" | "inline";
};

const PILL =
  "snap-start shrink-0 h-11 px-4 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-900 press-tight focus-neon hover:border-primary-900";

/**
 * First-visit "Where do you play?" for a visitor whose city the IP did
 * not give away. Non-modal: no backdrop, no scroll lock, no focus trap.
 *
 * Server-rendered only into the ask twins of /, /turfs and /games
 * (app/c/ask), which the proxy serves to humans whose city is unknown,
 * so crawlers and "all of India" visitors never receive it. Shown by
 * CSS only while <html data-city-state="unknown">, and only on the
 * first page that shows it in a session (data-city-ask="seen" after
 * that; the city line's "Pick a city" stays). Before hydration every
 * button is a native form post to /api/city.
 */
export function CityAsk({ cities, cityCount, page, changeHref, variant }: CityAskProps) {
  const { open: askOpen } = useAsk();
  const [answered, setAnswered] = useState(false);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState("");
  const [far, setFar] = useState<{ id: string; km: number } | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || getComputedStyle(el).display === "none") return;
    trackCity("city_ask_shown", { page });
    try {
      sessionStorage.setItem(ASK_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [page]);

  const choose = (value: string, source: CitySource) => {
    setAnswered(true);
    if (ref.current?.contains(document.activeElement)) document.getElementById("city-line")?.focus();
    setCityPref(value, { source });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!b?.value) return;
    choose(b.value, (b.dataset.source as CitySource) ?? "ask");
  };

  const onGps = async () => {
    setLocating(true);
    setStatus("");
    setFar(null);
    const r = await locateCity();
    setLocating(false);
    if ("city" in r) return choose(r.city, "gps");
    if (r.error === "far") {
      setFar(r.nearest);
      setStatus(`No TapTurf city within 200 km of you yet. Closest is ${labelFor(r.nearest.id)}, ${r.nearest.km} km away.`);
    } else if (r.error === "denied") setStatus("Location is off. Pick your city above.");
    else setStatus("Couldn't get your location. Pick your city above.");
  };

  const sheet = variant === "sheet";
  const openSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    openCityPicker("search");
  };

  return (
    <section
      ref={ref}
      id="city-ask"
      className={
        sheet
          ? "city-ask fixed z-[45] inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:static md:z-auto md:max-w-6xl md:mx-auto md:px-6 md:mt-4 lg:mt-0"
          : "city-ask my-4"
      }
      role="dialog"
      aria-modal="false"
      aria-labelledby="city-ask-h"
      aria-describedby="city-ask-sub"
      hidden={askOpen || answered}
      onKeyDown={(e) => {
        if (e.key === "Escape") choose("all", "ask_dismiss");
      }}
    >
      <div
        className={
          sheet
            ? "rounded-t-3xl md:rounded-3xl bg-white border border-primary-200 shadow-elevated md:shadow-soft px-4 pt-3 pb-2 md:p-5 max-h-[40dvh] md:max-h-none overflow-y-auto md:overflow-visible animate-slide-up md:animate-none motion-reduce:animate-none"
            : "rounded-3xl bg-white border border-primary-200 shadow-soft px-4 pt-3 pb-2 md:p-5"
        }
      >
        <form method="post" action="/api/city" onSubmit={onSubmit}>
          <input type="hidden" name="next" value={page} />
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="city-ask-h" className="font-display text-[20px] text-primary-900 leading-tight">
                Where do you play?
              </h2>
              <p id="city-ask-sub" className="hidden min-[400px]:block text-[13px] text-primary-500 mt-0.5">
                We&apos;ll show turfs and games in your city first.
              </p>
            </div>
            <button
              name="choice"
              value="all"
              data-source="ask_dismiss"
              aria-label="Close and show all of India"
              className="w-11 h-11 -mr-2 -mt-1.5 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-primary-50 focus-neon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Desktop: pills, search and the two actions flow in wrapping rows. */}
          <div className="md:mt-3 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-3">
            <div className="mt-2 -mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto scrollbar-hide snap-x md:mt-0 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible">
              {/* Phones: search is the first pill (icon only), so the sheet stays short. */}
              <a
                href={changeHref}
                onClick={openSearch}
                aria-label={`Search ${cityCount} cities`}
                className="md:hidden snap-start shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full border border-primary-200 bg-primary-50 text-primary-700 press-tight focus-neon"
              >
                <Search className="w-4 h-4" aria-hidden />
              </a>
              {cities.map((c) => (
                <button key={c.id} name="choice" value={c.id} data-source="ask" className={PILL}>
                  {c.label}
                  <span className="font-normal text-primary-500 tabular-nums">{c.n.toLocaleString("en-IN")}</span>
                </button>
              ))}
            </div>
            <a
              href={changeHref}
              onClick={openSearch}
              className="hidden md:inline-flex h-11 w-64 items-center gap-2 px-4 rounded-full bg-primary-50 border border-primary-200 text-[14px] text-primary-500 focus-neon"
            >
              <Search className="w-4 h-4" aria-hidden />
              Search {cityCount} cities
            </a>
            <div className="mt-1 flex items-center justify-between gap-x-3 md:mt-0 md:justify-start md:gap-x-6">
              <button
                type="button"
                onClick={onGps}
                disabled={locating}
                className="h-11 inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold text-primary-900 focus-neon disabled:opacity-70"
              >
                <Navigation className="w-4 h-4 text-accent-600" aria-hidden />
                {locating ? (
                  "Finding you…"
                ) : (
                  <>
                    <span className="min-[400px]:hidden">Use my location</span>
                    <span className="hidden min-[400px]:inline">Use my precise location</span>
                  </>
                )}
              </button>
              <button
                name="choice"
                value="all"
                data-source="ask"
                className="h-11 inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold text-accent-700 focus-neon"
              >
                <Globe className="w-4 h-4" aria-hidden />
                <span className="min-[400px]:hidden">All of India</span>
                <span className="hidden min-[400px]:inline">Show all of India</span>
              </button>
            </div>
          </div>
          <p aria-live="polite" className="text-[13px] text-primary-600">
            {status}
          </p>
          {far && (
            <button
              type="button"
              onClick={() => choose(far.id, "gps")}
              className="mt-1 mb-2 h-11 px-4 inline-flex items-center rounded-full bg-primary-900 text-white text-[14px] font-semibold press-tight focus-neon"
            >
              Show {labelFor(far.id)}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Navigation, Search, X } from "lucide-react";
import { useAsk } from "@/components/ask/AskProvider";
import { labelFor, locateCity, openCityPicker, setCityPref, type CitySource } from "@/lib/city";
import { trackCity } from "@/lib/analytics/city";

export type CityAskProps = {
  cities: { id: string; label: string; n: number }[];
  cityCount: number;
  page: "/" | "/turfs" | "/games";
  /** No-JS target of the search row: the page's own city list. */
  changeHref: string;
};

/**
 * First-visit "Where do you play?" for a visitor whose city the IP did
 * not give away. A compact bottom sheet docked above the bottom nav on
 * phones (the hero stays visible), a small card at the bottom left on
 * desktop. Non-modal: no backdrop, no scroll lock, no focus trap.
 *
 * Server-rendered into the all-India /, /turfs and /games only and shown
 * purely by CSS when <html data-city-state="unknown">, so crawlers (no
 * cookie) and anyone who already answered never see it. Before hydration
 * every button is a native form post to /api/city.
 */
export function CityAsk({ cities, cityCount, page, changeHref }: CityAskProps) {
  const { open: askOpen } = useAsk();
  const [answered, setAnswered] = useState(false);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState("");
  const [far, setFar] = useState<{ id: string; km: number } | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && getComputedStyle(el).display !== "none") trackCity("city_ask_shown", { page });
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

  return (
    <section
      ref={ref}
      id="city-ask"
      className="city-ask fixed z-[45] inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:left-6 md:bottom-6 md:w-[380px]"
      role="dialog"
      aria-modal="false"
      aria-labelledby="city-ask-h"
      aria-describedby="city-ask-sub"
      hidden={askOpen || answered}
      onKeyDown={(e) => {
        if (e.key === "Escape") choose("all", "ask_dismiss");
      }}
    >
      <div className="rounded-t-3xl md:rounded-3xl bg-white border border-primary-200 shadow-elevated px-4 pt-3 pb-3 max-h-[45dvh] md:max-h-none overflow-y-auto animate-slide-up motion-reduce:animate-none">
        <form method="post" action="/api/city" onSubmit={onSubmit}>
          <input type="hidden" name="next" value={page} />
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="city-ask-h" className="font-display text-[20px] text-primary-900 leading-tight">
                Where do you play?
              </h2>
              <p id="city-ask-sub" className="text-[13px] text-primary-500 mt-0.5">
                We&apos;ll show turfs and games in your city first.
              </p>
            </div>
            <button
              name="choice"
              value="all"
              data-source="ask_dismiss"
              aria-label="Close and show all of India"
              className="w-11 h-11 -mr-2 -mt-1 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-primary-50 focus-neon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide snap-x md:flex-wrap md:overflow-visible">
            {cities.map((c) => (
              <button
                key={c.id}
                name="choice"
                value={c.id}
                data-source="ask"
                className="snap-start shrink-0 h-11 px-4 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-900 press-tight focus-neon hover:border-primary-900"
              >
                {c.label}
                <span className="font-normal text-primary-500 tabular-nums">{c.n.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
          <a
            href={changeHref}
            onClick={(e) => {
              e.preventDefault();
              openCityPicker("search");
            }}
            className="mt-2 h-11 w-full inline-flex items-center gap-2 px-4 rounded-full bg-primary-50 border border-primary-200 text-[14px] text-primary-500 focus-neon"
          >
            <Search className="w-4 h-4" />
            Search {cityCount} cities
          </a>
          <div className="mt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onGps}
              disabled={locating}
              className="h-11 inline-flex items-center gap-2 text-[14px] font-semibold text-primary-900 focus-neon disabled:opacity-70"
            >
              <Navigation className="w-4 h-4 text-accent-600" />
              {locating ? "Finding you…" : "Use my precise location"}
            </button>
            <button
              name="choice"
              value="all"
              data-source="ask"
              className="h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-700 focus-neon"
            >
              <Globe className="w-4 h-4" />
              Show all of India
            </button>
          </div>
          <p aria-live="polite" className="text-[13px] text-primary-600 min-h-0">
            {status}
          </p>
          {far && (
            <button
              type="button"
              onClick={() => choose(far.id, "gps")}
              className="mt-2 h-11 px-4 inline-flex items-center rounded-full bg-primary-900 text-white text-[14px] font-semibold press-tight focus-neon"
            >
              Show {labelFor(far.id)}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

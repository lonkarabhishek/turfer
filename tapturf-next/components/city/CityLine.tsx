"use client";

import { Loader2, MapPin } from "lucide-react";
import { openCityPicker } from "@/lib/city";
import type { CityLineProps } from "@/lib/cityLine";
import { usePendingCity } from "./cityPending";
import { prefetchLiveCities } from "./liveCityList";

const ACTION = "inline-flex items-center h-11 font-semibold text-accent-700 hover:text-accent-800 focus-neon";

function Change({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      // The picker's counts come from /api/cities: start it before the tap lands.
      onPointerDown={prefetchLiveCities}
      onPointerEnter={prefetchLiveCities}
      onFocus={prefetchLiveCities}
      onClick={(e) => {
        e.preventDefault();
        openCityPicker("list");
      }}
      role="button"
      className={ACTION}
    >
      {children}
    </a>
  );
}

/**
 * One quiet line near the top of /, /turfs and /games that says which
 * city the page shows and why, with a one-tap Change. All copy comes
 * from server props; ", based on your location" and Pick a city /
 * Change / Back to your city are switched by CSS from <html data-city-*>,
 * set before the first paint, so nothing swaps after load.
 *
 * A div with data-nosnippet (Google ignores it on <p>), so this UI line
 * never becomes a search snippet. Change opens a dialog, so it is a
 * role=button link whose href is the no-JS fallback. The live region is
 * always mounted; only its text changes.
 */
export function CityLine(props: CityLineProps) {
  const pending = usePendingCity();
  return (
    <div
      id="city-line"
      tabIndex={-1}
      data-nosnippet=""
      className="flex flex-wrap items-center gap-x-1.5 min-h-[44px] text-[13px] min-[400px]:text-[14px] text-primary-600 outline-none"
    >
      <span className="sr-only" aria-live="polite">
        {pending ? `Switching to ${pending}…` : ""}
      </span>
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 text-accent-600 shrink-0 animate-spin" aria-hidden />
          <span aria-hidden>Switching to {pending}…</span>
        </>
      ) : (
        <>
          <MapPin className="w-4 h-4 text-accent-600 shrink-0" aria-hidden />
          {props.kind === "city" && (
            <>
              <span>
                Showing <b className="font-semibold text-primary-900">{props.label}</b>
                <span className="city-geo">
                  , <span className="min-[380px]:hidden">near you</span>
                  <span className="hidden min-[380px]:inline">based on your location</span>
                </span>
                .
              </span>
              <Change href={props.changeHref}>Change</Change>
            </>
          )}
          {props.kind === "fallback" && (
            <>
              <span>
                No turfs in {props.requestedLabel} yet.{" "}
                {props.showing ? (
                  <>
                    Showing <b className="font-semibold text-primary-900">{props.showing.label}</b>, {props.showing.km} km away.
                  </>
                ) : (
                  <>Showing all of India.</>
                )}
              </span>
              <Change href={props.changeHref}>Change</Change>
            </>
          )}
          {props.kind === "india" && (
            <>
              <span>Showing all of India.</span>
              <span className="city-line-pick">
                <Change href={props.changeHref}>Pick a city</Change>
              </span>
              <span className="city-line-change">
                <Change href={props.changeHref}>Change</Change>
              </span>
              <span className="city-line-back">
                <a href={props.backHref} className={ACTION}>
                  Back to your city
                </a>
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}

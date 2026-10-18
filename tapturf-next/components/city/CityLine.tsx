"use client";

import { Loader2, MapPin } from "lucide-react";
import { openCityPicker } from "@/lib/city";
import type { CityLineProps } from "@/lib/cityLine";
import { usePendingCity } from "./cityPending";

const ACTION = "inline-flex items-center h-11 font-semibold text-accent-700 hover:text-accent-800 focus-neon";

function Change({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openCityPicker("list");
      }}
      className={ACTION}
    >
      {children}
    </a>
  );
}

/**
 * One quiet line near the top of /, /turfs and /games that says which
 * city the page shows and why, with a one-tap Change. All copy comes
 * from server props; ", based on your location" and Pick a city / Back
 * to your city are switched by CSS from <html data-city-*>, set before
 * the first paint, so nothing swaps after load.
 */
export function CityLine(props: CityLineProps) {
  const pending = usePendingCity();
  return (
    <p id="city-line" tabIndex={-1} className="flex flex-wrap items-center gap-x-1.5 min-h-[44px] text-[13px] min-[400px]:text-[14px] text-primary-600 outline-none">
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 text-accent-600 shrink-0 animate-spin" aria-hidden />
          <span aria-live="polite">Switching to {pending}…</span>
        </>
      ) : (
        <>
          <MapPin className="w-4 h-4 text-accent-600 shrink-0" aria-hidden />
          {props.kind === "city" && (
            <>
              <span>
                Showing <b className="font-semibold text-primary-900">{props.label}</b>
                <span className="city-geo">, based on your location</span>.
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
              <span className="city-line-back">
                <a href={props.backHref} className={ACTION}>
                  Back to your city
                </a>
              </span>
            </>
          )}
        </>
      )}
    </p>
  );
}

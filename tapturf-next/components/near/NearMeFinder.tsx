"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, LocateFixed, Navigation, X } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { getUserLocation } from "@/lib/utils/location";
import { CITIES, CITY_LIST_AND, guessCityFromAddress, isCity, labelFor } from "@/lib/city";
import type { Turf } from "@/types/turf";

type NearTurf = Turf & { distanceKm: number };
type Result = { turfs: NearTurf[]; within5: number; within10: number };
type State = "idle" | "locating" | "loading" | "done" | "denied" | "error";

/** Nearest turf further than this means we don't cover the visitor's area yet. */
const FAR_KM = 60;

/**
 * "Use my location" for /turf-near-me. Asks for location only on tap
 * (or straight away if the visitor already allowed it), then shows the
 * nearest turfs with distances. The server-rendered lists below stay
 * the crawlable part of the page; this is the interactive layer.
 */
export function NearMeFinder({ total }: { total: number }) {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<Result | null>(null);

  const find = useCallback(async () => {
    setState("locating");
    try {
      const me = await getUserLocation();
      setState("loading");
      const res = await fetch(`/api/turfs/near?lat=${me.lat.toFixed(4)}&lng=${me.lng.toFixed(4)}&limit=12`);
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as Result);
      setState("done");
    } catch (e) {
      setState((e as GeolocationPositionError)?.code === 1 ? "denied" : "error");
    }
  }, []);

  // Already allowed for this site: no prompt, just show results.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let alive = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (alive && p.state === "granted") void find();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [find]);

  const busy = state === "locating" || state === "loading";
  const nearest = result?.turfs[0];
  const far = nearest ? nearest.distanceKm > FAR_KM : false;
  const nearestCity = nearest
    ? isCity(nearest.city) ? nearest.city : guessCityFromAddress(nearest.address)
    : null;

  return (
    <div>
      {state !== "done" && (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={find}
            disabled={busy}
            className="press-tight inline-flex items-center justify-center gap-2.5 rounded-full bg-accent-500 hover:bg-accent-600 disabled:opacity-80 text-white text-[17px] font-semibold px-8 py-4 shadow-lg shadow-accent-500/30 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LocateFixed className="w-5 h-5" strokeWidth={2.25} />
            )}
            {state === "locating" ? "Finding you…" : state === "loading" ? "Sorting turfs…" : "Use my location"}
          </button>
          <p className="text-[13px] text-primary-500 text-center max-w-sm">
            {state === "denied"
              ? "Location is turned off for this site. Pick your city or area below instead."
              : state === "error"
                ? "Couldn't get your location. Try again, or pick your area below."
                : `We sort all ${total} turfs by distance. Your location stays on your phone.`}
          </p>
          {(state === "denied" || state === "error") && (
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {CITIES.map((c) => (
                <a
                  key={c.id}
                  href={`#${c.id}`}
                  className="h-9 px-4 inline-flex items-center rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-medium text-primary-900"
                >
                  {c.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {busy && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-2xl bg-primary-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-primary-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-primary-100" />
            </div>
          ))}
        </div>
      )}

      {state === "done" && result && (
        <section aria-live="polite" className="text-left">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-600">
                <Navigation className="w-3.5 h-3.5 fill-current" /> Nearest to you
              </p>
              <h2 className="font-display text-[24px] md:text-[30px] text-primary-900 leading-tight mt-1">
                {far
                  ? "No turfs close to you yet"
                  : result.within5 > 0
                    ? `${result.within5} turf${result.within5 !== 1 ? "s" : ""} within 5 km`
                    : result.within10 > 0
                      ? `${result.within10} turf${result.within10 !== 1 ? "s" : ""} within 10 km`
                      : "Closest turfs to you"}
              </h2>
              {far && (
                <p className="text-[15px] text-primary-500 mt-1">
                  We list turfs in {CITY_LIST_AND}. Here are the closest ones.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setState("idle");
              }}
              className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] font-medium text-primary-700"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
            {result.turfs.map((t, i) => (
              <TurfCard key={t.id} turf={t} distanceKm={t.distanceKm} priority={i < 2} />
            ))}
          </div>
          {nearestCity && !far && (
            <div className="mt-8 text-center">
              <Link
                href={`/${nearestCity}`}
                className="inline-flex items-center h-11 px-6 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold"
              >
                See all turfs in {labelFor(nearestCity)}
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { MapPin, Check, X, Loader2 } from "lucide-react";
import { CITIES, getCityPref, setCityPref, autoDetectCity, type CityId } from "@/lib/city";

/**
 * Small chip in the header that says "Nashik", "Pune", or "All cities".
 * Tap → sheet with a choice of Nashik / Pune / All cities.
 * Choice is stored in localStorage and broadcast so downstream
 * components (LoggedInHome, TurfListingClient) can react.
 */
export function CityPicker() {
  const [city, setCity] = useState<CityId | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const stored = getCityPref();
    setCity(stored);
    setMounted(true);

    // First-time auto-detect: if the user has no city set and
    // we haven't asked before, try geolocation → nearest city.
    if (!stored) {
      setDetecting(true);
      autoDetectCity()
        .then((c) => {
          if (c) {
            setCity(c);
            window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: c }));
          }
        })
        .finally(() => setDetecting(false));
    }

    // Sync across tabs + same-tab pick events
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tapturf_city_v1") setCity(getCityPref());
    };
    const onChange = () => setCity(getCityPref());
    window.addEventListener("storage", onStorage);
    window.addEventListener("tapturf:city-changed", onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tapturf:city-changed", onChange);
    };
  }, []);

  const redetect = async () => {
    setDetecting(true);
    // Clear the "already tried" flag so we can ask again.
    try { localStorage.removeItem("tapturf_city_autodetect_v1"); } catch { /* ignore */ }
    const c = await autoDetectCity();
    if (c) {
      setCity(c);
      window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: c }));
    }
    setDetecting(false);
  };

  const pick = (next: CityId | null) => {
    setCityPref(next);
    setCity(next);
    setOpen(false);
    // Notify same-tab listeners
    window.dispatchEvent(new CustomEvent("tapturf:city-changed", { detail: next }));
  };

  const label = city ? CITIES.find((c) => c.id === city)?.label : "All cities";

  // Don't SSR the current pref (localStorage is client-only) → avoid mismatch
  if (!mounted) return <span aria-hidden className="w-16 h-8" />;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full border border-primary-200 bg-white hover:border-accent-500 transition-colors focus-neon"
        aria-label={`Current city: ${label}. Tap to change.`}
      >
        {detecting ? (
          <Loader2 className="w-3.5 h-3.5 text-accent-600 animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-accent-600" />
        )}
        <span className="text-[12px] font-semibold text-primary-800">
          {detecting ? "Locating…" : label}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
          <div className="absolute inset-0 bg-primary-800/50 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated animate-slide-up">
            {/* Grabber */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 bg-primary-300 rounded-full" />
            </div>

            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors"
            >
              <X className="w-4 h-4 text-primary-500" />
            </button>

            <div className="px-5 pt-6 pb-4">
              <p className="text-[11px] font-mono uppercase tracking-widest text-primary-500 mb-1">
                // Playing where?
              </p>
              <h2 className="font-display uppercase text-3xl text-primary-800 leading-none tracking-tight">
                Pick your city
              </h2>
            </div>

            <div className="px-2 pb-2">
              {CITIES.map((c) => {
                const active = city === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => pick(c.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-primary-50 transition-colors focus-neon"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-accent-50 border border-accent-500/30 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-accent-600" />
                      </span>
                      <span className="font-display uppercase text-xl text-primary-800 leading-none tracking-wide">
                        {c.label}
                      </span>
                    </span>
                    {active && <Check className="w-5 h-5 text-accent-600" strokeWidth={2.5} />}
                  </button>
                );
              })}

              <div className="h-px bg-primary-200 mx-4 my-2" />

              <button
                onClick={redetect}
                disabled={detecting}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-primary-50 transition-colors focus-neon disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-accent-700">
                  {detecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Getting your location…
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      Use my location
                    </>
                  )}
                </span>
              </button>

              <button
                onClick={() => pick(null)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-primary-50 transition-colors focus-neon"
              >
                <span className="text-[13px] font-semibold text-primary-500">
                  Show all cities
                </span>
                {city === null && <Check className="w-4 h-4 text-accent-600" strokeWidth={2.5} />}
              </button>
            </div>

            <div className="sm:hidden h-[env(safe-area-inset-bottom)] bg-white" />
          </div>
        </div>
      )}
    </>
  );
}

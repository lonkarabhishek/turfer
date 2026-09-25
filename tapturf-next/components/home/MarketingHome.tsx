"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Search,
  Gamepad2,
  Loader2,
  MapPin,
  Check,
  X,
} from "lucide-react";
import {
  CITIES,
  getCityPref,
  setCityPref,
  autoDetectCity,
  labelFor,
  isCity,
  type CityId,
} from "@/lib/city";

/**
 * Marketing home (logged-out visitors) — deliberately stripped to two
 * primary CTAs: find a turf, find a game. The old page tried to be a
 * store shelf; visitors want to get to one of those two searches fast
 * and the rest of the site handles depth.
 *
 * Props are the per-city turf counts from the server so we can print an
 * honest "89 turfs live" number without an extra client-side fetch.
 */
export function MarketingHome() {
  const [city, setCity] = useState<CityId | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    const pref = getCityPref();
    setCity(pref);
    setHydrated(true);
    // If the visitor has no preference yet, silently try geolocation.
    // Non-blocking; if they deny/timeout we just fall back to "all
    // cities".
    if (!pref) {
      setAutoDetecting(true);
      autoDetectCity()
        .then((detected) => {
          if (detected) {
            setCityPref(detected);
            setCity(detected);
            // Notify sibling components (header CityPicker,
            // TurfListingClient, LoggedInHome) so they resync.
            window.dispatchEvent(
              new CustomEvent("tapturf:city-changed", { detail: detected }),
            );
          }
        })
        .finally(() => setAutoDetecting(false));
    }

    // Keep in sync when the header CityPicker (or any other consumer)
    // changes the city. Without this, picking Pune from the header
    // would leave this home stuck showing Nashik.
    const onChange = () => setCity(getCityPref());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tapturf_city_v1") setCity(getCityPref());
    };
    window.addEventListener("tapturf:city-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("tapturf:city-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Central pick handler used by the sheet AND any other in-page
  // control that wants to change city. Writes to storage AND fires the
  // event so siblings (the header pill, listings, etc.) can react.
  const applyCity = (next: CityId | null) => {
    setCityPref(next);
    setCity(next);
    window.dispatchEvent(
      new CustomEvent("tapturf:city-changed", { detail: next }),
    );
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem-3.5rem)] md:min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[520px] text-center">
          {/* Hero: one headline, one line of support, two actions. */}
          <h1 className="font-display text-primary-900 text-display-xl mb-4">
            Book turf.
            <br />
            <span className="text-accent-500">Find your squad.</span>
          </h1>
          <p className="text-primary-500 text-[17px] md:text-xl leading-snug max-w-[420px] mx-auto mb-9">
            The easiest way to find a sports turf or join an open match near you.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/turfs"
              className="press-tight inline-flex items-center justify-center gap-2 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[17px] font-semibold px-7 py-3.5 transition-colors"
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={2.25} />
              Find a turf
            </Link>
            <Link
              href="/games"
              className="press-tight inline-flex items-center justify-center gap-2 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[17px] font-semibold px-7 py-3.5 transition-colors"
            >
              <Gamepad2 className="w-[18px] h-[18px]" strokeWidth={2.25} />
              Join a game
            </Link>
          </div>

          {/* Single 'Pick your city' button (opens a sheet). Much
              cleaner than an inline row of chips, which fought the
              two CTAs for attention. */}
          <div className="mt-8 flex items-center justify-center">
            <button
              onClick={() => setCityOpen(true)}
              className="press-tight inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[15px] text-accent-600 hover:text-accent-700"
            >
              <MapPin className="w-4 h-4" />
              <span>{isCity(city) ? labelFor(city) : "All cities"}</span>
              {autoDetecting && (
                <Loader2 className="w-3 h-3 animate-spin text-primary-400" />
              )}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Ultra-quiet secondary link */}
          <p className="mt-10 text-[13px] text-primary-500">
            or{" "}
            <Link
              href="/nashik"
              className="text-primary-800 underline underline-offset-2 hover:text-accent-600"
            >
              browse Nashik
            </Link>{" "}
            ·{" "}
            <Link
              href="/pune"
              className="text-primary-800 underline underline-offset-2 hover:text-accent-600"
            >
              browse Pune
            </Link>
          </p>
        </div>
      </div>

      {/* City sheet — bottom-anchored on mobile, centered on desktop.
          Kept lightweight (no external deps) with a translucent
          backdrop that dismisses on tap. */}
      {cityOpen && (
        <CitySheet
          value={city}
          onClose={() => setCityOpen(false)}
          onPick={(next) => {
            applyCity(next);
            setCityOpen(false);
          }}
          onDetect={async () => {
            setAutoDetecting(true);
            try {
              // autoDetectCity() short-circuits on the second call
              // via a one-shot 'tried' flag. When the user explicitly
              // taps "Use my location" we WANT to try again, so clear
              // that flag first.
              try {
                localStorage.removeItem("tapturf_city_autodetect_v1");
              } catch { /* ignore */ }
              const detected = await autoDetectCity();
              if (detected) applyCity(detected);
            } finally {
              setAutoDetecting(false);
              setCityOpen(false);
            }
          }}
          detecting={autoDetecting}
        />
      )}
    </div>
  );
}

// Static per-city tagline. Kept out of lib/city.ts because it's just
// display copy for this sheet, not data anyone else consumes.
const CITY_TAGLINE: Record<string, string> = {
  nashik: "Nashik, Maharashtra",
  pune: "Pune, Maharashtra",
};

/**
 * Small self-contained city picker sheet. Bottom-anchored on phones so
 * the thumb can reach every option; centered card on desktop. Uses the
 * same tokens/animations as the rest of the app so it feels native.
 */
function CitySheet({
  value,
  onClose,
  onPick,
  onDetect,
  detecting,
}: {
  value: CityId | null;
  onClose: () => void;
  onPick: (id: CityId | null) => void;
  onDetect: () => void;
  detecting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <button
        aria-label="Close city picker"
        onClick={onClose}
        className="absolute inset-0 bg-primary-900/50 animate-fade-in"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your city"
        className="relative w-full md:w-[440px] md:max-w-[calc(100vw-2rem)] bg-white rounded-t-3xl md:rounded-3xl shadow-elevated animate-slide-up overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Grabber (mobile visual affordance) + close */}
        <div className="pt-3 pb-2 flex justify-center md:hidden">
          <div className="w-10 h-1 rounded-full bg-primary-200" />
        </div>
        <button
          onClick={onClose}
          className="press-tight absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-primary-500" />
        </button>

        <div className="px-6 pt-4 pb-6">
          <p className="text-[11px] font-bold text-accent-600 mb-1">
            Location
          </p>
          <h2 className="font-display text-primary-900 text-2xl leading-tight">
            Where are you playing?
          </h2>
          <p className="text-sm text-primary-500 mt-1">
            We&apos;ll show turfs and games in your city.
          </p>

          {/* Options */}
          <div className="mt-5 space-y-2">
            {CITIES.map((c) => {
              const active = value === c.id;
              const tagline = CITY_TAGLINE[c.id] || "Maharashtra, India";
              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c.id)}
                  className={`press-tight w-full flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${
                    active
                      ? "border-accent-500 bg-accent-50/60"
                      : "border-primary-200 bg-white hover:border-primary-300"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        active ? "bg-accent-500 text-white" : "bg-primary-100 text-primary-600"
                      }`}
                    >
                      <MapPin className="w-5 h-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-primary-900 text-[15px] leading-tight">
                        {c.label}
                      </span>
                      <span className="block text-xs text-primary-500 mt-0.5">
                        {tagline}
                      </span>
                    </span>
                  </span>
                  {active && (
                    <Check className="w-5 h-5 text-accent-600" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}

            {/* All cities */}
            <button
              onClick={() => onPick(null)}
              className={`press-tight w-full flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${
                !value
                  ? "border-accent-500 bg-accent-50/60"
                  : "border-primary-200 bg-white hover:border-primary-300"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    !value ? "bg-accent-500 text-white" : "bg-primary-100 text-primary-600"
                  }`}
                >
                  <MapPin className="w-5 h-5" />
                </span>
                <span>
                  <span className="block font-semibold text-primary-900 text-[15px] leading-tight">
                    All cities
                  </span>
                  <span className="block text-xs text-primary-500 mt-0.5">
                    Show turfs across Nashik + Pune
                  </span>
                </span>
              </span>
              {!value && (
                <Check className="w-5 h-5 text-accent-600" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Use my location */}
          <button
            onClick={onDetect}
            disabled={detecting}
            className="press-tight mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-sm font-bold py-3 disabled:opacity-60"
          >
            {detecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Detecting…
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                Use my location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

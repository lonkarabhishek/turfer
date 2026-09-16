"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Gamepad2, Loader2 } from "lucide-react";
import {
  CITIES,
  getCityPref,
  setCityPref,
  autoDetectCity,
  labelFor,
  isCity,
  type CityId,
} from "@/lib/city";
import type { Turf } from "@/types/turf";

/**
 * Marketing home (logged-out visitors) — deliberately stripped to two
 * primary CTAs: find a turf, find a game. The old page tried to be a
 * store shelf; visitors want to get to one of those two searches fast
 * and the rest of the site handles depth.
 *
 * Props are the per-city turf counts from the server so we can print an
 * honest "89 turfs live" number without an extra client-side fetch.
 */
export function MarketingHome({
  nashikTurfs,
  puneTurfs,
}: {
  nashikTurfs: Turf[];
  puneTurfs: Turf[];
}) {
  const [city, setCity] = useState<CityId | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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
          }
        })
        .finally(() => setAutoDetecting(false));
    }
  }, []);

  const turfCount =
    city === "nashik"
      ? nashikTurfs.length
      : city === "pune"
        ? puneTurfs.length
        : nashikTurfs.length + puneTurfs.length;
  const cityLabel = isCity(city) ? labelFor(city) : "Nashik + Pune";

  return (
    <div className="min-h-[calc(100vh-3.5rem-3.5rem)] md:min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[520px] text-center">
          {/* Live pill — tiny credibility signal, real number */}
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-hot-500 pulse-live" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary-700">
              Live · {cityLabel} · {turfCount} turfs
            </span>
          </div>

          {/* Hero — short, direct, no fluff */}
          <h1 className="font-display uppercase tracking-tight text-primary-900 leading-[0.95] text-display-xl mb-4">
            Book turf.
            <br />
            <span className="text-accent-500">Find your squad.</span>
          </h1>
          <p className="text-primary-600 text-base md:text-lg leading-snug max-w-[420px] mx-auto mb-10">
            The fastest way to book a sports turf or join an open match near you.
          </p>

          {/* Two primary CTAs — nothing else competes for attention */}
          <div className="flex flex-col gap-3">
            <Link
              href="/turfs"
              className="press-tight group flex items-center justify-between rounded-2xl bg-primary-900 hover:bg-primary-800 text-white px-6 py-5 shadow-elevated"
            >
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Search className="w-5 h-5" strokeWidth={2.5} />
                </span>
                <span className="text-left">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-white/70">
                    I need a
                  </span>
                  <span className="block text-lg font-display uppercase tracking-wide leading-none mt-0.5">
                    Turf
                  </span>
                </span>
              </span>
              <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/games"
              className="press-tight group flex items-center justify-between rounded-2xl bg-accent-500 hover:bg-accent-600 text-white px-6 py-5 shadow-neon"
            >
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5" strokeWidth={2.5} />
                </span>
                <span className="text-left">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-white/80">
                    I want a
                  </span>
                  <span className="block text-lg font-display uppercase tracking-wide leading-none mt-0.5">
                    Game
                  </span>
                </span>
              </span>
              <ArrowRight className="w-5 h-5 opacity-90 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* City row — quiet, secondary. Auto-detected on first visit. */}
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary-400">
              City
            </span>
            {CITIES.map((c) => {
              const active = city === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCityPref(c.id);
                    setCity(c.id);
                  }}
                  className={`press-tight text-[12px] font-semibold uppercase tracking-widest rounded-full px-3 py-1.5 border transition-colors ${
                    active
                      ? "bg-primary-900 text-white border-primary-900"
                      : "bg-white text-primary-700 border-primary-200 hover:border-primary-300"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
            <button
              onClick={() => {
                setCityPref(null);
                setCity(null);
              }}
              className={`press-tight text-[12px] font-semibold uppercase tracking-widest rounded-full px-3 py-1.5 border transition-colors ${
                !city && hydrated
                  ? "bg-primary-900 text-white border-primary-900"
                  : "bg-white text-primary-700 border-primary-200 hover:border-primary-300"
              }`}
            >
              All
            </button>
            {autoDetecting && (
              <span className="inline-flex items-center gap-1 text-[11px] text-primary-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Detecting…
              </span>
            )}
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
    </div>
  );
}

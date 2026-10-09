"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LocateFixed, Sparkles, X } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { getCityPref, labelFor, isCity } from "@/lib/city";
import { getUserLocation, type Coords } from "@/lib/utils/location";
import { sportBySlug } from "@/lib/sports";
import type { Turf } from "@/types/turf";

type AskResponse = {
  query: string;
  summary: string;
  offTopic: boolean;
  source: "claude" | "keywords";
  filters: {
    city: string | null;
    sport: string | null;
    areas: string[];
    maxPrice: number | null;
    time: string | null;
    open24x7: boolean;
    wantsNearby: boolean;
    needs: string[];
    players: number | null;
    sort: string;
  };
  needsLocation: boolean;
  relaxed: string[];
  total: number;
  turfs: (Turf & { distanceKm?: number })[];
};

const EXAMPLES = [
  "Box cricket in Kothrud under ₹1,000",
  "Football turf near me tonight",
  "24 hour cricket turf in Hyderabad",
  "Cheap turf for 12 people in Thane",
];

/**
 * Ask TapTurf: type what you want in plain words, get real turfs.
 * The server turns the sentence into filters and runs them over our
 * listings, so every result is a venue we list. On the home page it
 * sits under the two main buttons; on /turfs above the filters.
 */
export function AskTurf({ variant = "home" }: { variant?: "home" | "listing" }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [locating, setLocating] = useState(false);
  const locRef = useRef<Coords | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (query: string, loc?: Coords | null) => {
    const text = query.trim();
    if (text.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: text });
      const city = getCityPref();
      if (city) params.set("city", city);
      const at = loc ?? locRef.current;
      if (at) {
        params.set("lat", at.lat.toFixed(4));
        params.set("lng", at.lng.toFixed(4));
      }
      const r = await fetch(`/api/ask?${params}`);
      if (r.status === 429) throw new Error("That's a lot of searches. Give it a few minutes.");
      if (!r.ok) throw new Error("Search is taking a break. Try the filters below.");
      setRes((await r.json()) as AskResponse);
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  const useLocation = async () => {
    setLocating(true);
    try {
      const me = await getUserLocation();
      locRef.current = me;
      await run(res?.query ?? q, me);
    } catch {
      setError("Couldn't get your location. Add an area to your search instead.");
    } finally {
      setLocating(false);
    }
  };

  const clear = () => {
    setRes(null);
    setError(null);
    setQ("");
    inputRef.current?.focus();
  };

  const chips = res ? describeFilters(res) : [];
  const moreHref = res ? moreLink(res) : "/turfs";
  const wide = variant === "home";

  return (
    <section className={wide ? "mt-7 text-left" : "mb-4"} aria-label="Ask TapTurf">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="relative"
      >
        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-accent-500" strokeWidth={2.25} />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={160}
          enterKeyHint="search"
          placeholder="Describe what you want"
          className="w-full h-12 pl-11 pr-24 rounded-full bg-white border border-primary-200 shadow-soft text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 2}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-full bg-primary-900 hover:bg-primary-800 disabled:opacity-40 text-white text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
        </button>
      </form>

      {!res && !busy && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                void run(ex);
              }}
              className="shrink-0 h-8 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] text-primary-700 whitespace-nowrap"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-[14px] text-hot-600">{error}</p>}

      {busy && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5" aria-hidden>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-2xl bg-primary-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-primary-100" />
            </div>
          ))}
        </div>
      )}

      {res && !busy && (
        <div className="mt-5" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-[20px] md:text-[22px] text-primary-900 leading-tight">
                {res.offTopic ? "That one's not about turfs" : res.summary}
              </p>
              {!res.offTopic && (
                <p className="text-[13px] text-primary-500 mt-1">
                  {res.total === 0
                    ? "Nothing matched. Try fewer conditions."
                    : `${res.total} match${res.total === 1 ? "" : "es"}${res.relaxed.length ? `, after widening ${res.relaxed.join(" and ")}` : ""}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] font-medium text-primary-700"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="h-7 px-2.5 inline-flex items-center rounded-full bg-accent-50 text-accent-700 text-[12px] font-medium">
                  {c}
                </span>
              ))}
            </div>
          )}

          {res.needsLocation && (
            <button
              type="button"
              onClick={useLocation}
              disabled={locating}
              className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[14px] font-semibold"
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              Use my location to sort by distance
            </button>
          )}

          {res.offTopic ? (
            <p className="mt-3 text-[15px] text-primary-600">
              Try a sport, an area or a budget. {res.summary}
            </p>
          ) : (
            <>
              <div className={`mt-5 grid grid-cols-1 sm:grid-cols-2 ${wide ? "" : "md:grid-cols-3 lg:grid-cols-4"} gap-x-5 gap-y-7`}>
                {res.turfs.map((t, i) => (
                  <TurfCard key={t.id} turf={t} distanceKm={t.distanceKm} priority={i < 2} />
                ))}
              </div>
              {res.total > res.turfs.length && (
                <div className="mt-6 text-center">
                  <Link
                    href={moreHref}
                    className="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold"
                  >
                    See all {res.total} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function describeFilters(r: AskResponse): string[] {
  const f = r.filters;
  const out: string[] = [];
  if (f.sport) out.push(sportBySlug(f.sport)?.name ?? f.sport);
  for (const a of f.areas) out.push(a);
  if (f.city && isCity(f.city) && f.areas.length === 0) out.push(labelFor(f.city));
  if (f.wantsNearby) out.push("Near you");
  if (f.maxPrice != null) out.push(`Under ₹${f.maxPrice.toLocaleString("en-IN")}/hr`);
  if (f.time) out.push({ morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" }[f.time] ?? f.time);
  if (f.open24x7) out.push("Open 24 hours");
  for (const n of f.needs) out.push(n.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()));
  if (f.players) out.push(`${f.players} players`);
  return out;
}

function moreLink(r: AskResponse): string {
  const { city, sport } = r.filters;
  if (city && isCity(city) && sport) return `/${city}/${sport}`;
  if (city && isCity(city)) return `/${city}`;
  if (sport) return `/sport/${sport}`;
  return "/turfs";
}

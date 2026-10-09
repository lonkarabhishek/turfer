"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LocateFixed, Sparkles, X } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { GameCard } from "@/components/game/GameCard";
import { getCityPref, labelFor, isCity } from "@/lib/city";
import { getUserLocation, type Coords } from "@/lib/utils/location";
import { sportBySlug } from "@/lib/sports";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";

type AskResponse = {
  query: string;
  intent: "find_turf" | "find_game" | "compare" | "question" | "other";
  summary: string;
  source: "claude" | "keywords";
  filters: {
    city: string | null;
    sport: string | null;
    areas: string[];
    maxPrice: number | null;
    time: string | null;
    when: string | null;
    skill: string | null;
    open24x7: boolean;
    wantsNearby: boolean;
    needs: string[];
    players: number | null;
    sort: string;
  };
  needsLocation: boolean;
  relaxed: string[];
  total: number;
  failed?: boolean;
  turfs?: (Turf & { distanceKm?: number })[];
  games?: (Game & { distanceKm?: number })[];
  missing?: string[];
  compare?: { verdict: string; rows: { label: string; values: string[] }[]; best_for: string[]; caveats: string | null } | null;
  answer?: { answer: string; covered: boolean } | null;
};

const EXAMPLES = [
  "Box cricket in Kothrud under ₹1,000",
  "Football games near me this weekend",
  "Hindu Gymkhana vs Vedant Sports Academy",
  "Does CC Turf Pardi have parking?",
  "24 hour cricket turf in Hyderabad",
];

/**
 * Ask TapTurf: one box for finding turfs, finding games, comparing
 * two venues, or asking about one. The server reads the sentence,
 * then answers from our own listings. On the home page it sits under
 * the two main buttons; on /turfs above the filters.
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

  const wide = variant === "home";
  const grid = `mt-5 grid grid-cols-1 sm:grid-cols-2 ${wide ? "" : "md:grid-cols-3 lg:grid-cols-4"} gap-x-5 gap-y-7`;

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
          placeholder="Ask for a turf, a game, or compare two"
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
              <p className="font-display text-[20px] md:text-[22px] text-primary-900 leading-tight">{headline(res)}</p>
              <p className="text-[13px] text-primary-500 mt-1">{subline(res)}</p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] font-medium text-primary-700"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          {(res.intent === "find_turf" || res.intent === "find_game") && <Chips res={res} />}

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

          {res.intent === "find_turf" && (
            <>
              <div className={grid}>
                {(res.turfs ?? []).map((t, i) => (
                  <TurfCard key={t.id} turf={t} distanceKm={t.distanceKm} priority={i < 2} />
                ))}
              </div>
              {res.total > (res.turfs?.length ?? 0) && <More href={moreLink(res)} label={`See all ${res.total}`} />}
            </>
          )}

          {res.intent === "find_game" && (
            <>
              <div className={`mt-5 grid grid-cols-1 ${wide ? "" : "md:grid-cols-2"} gap-4`}>
                {(res.games ?? []).map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
              {res.total === 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <More href="/games" label="See all open games" />
                  <More href="/game/create" label="Host one" tone="light" />
                </div>
              ) : (
                <More href="/games" label={res.total > (res.games?.length ?? 0) ? `See all ${res.total} games` : "All open games"} />
              )}
            </>
          )}

          {res.intent === "compare" && <Compare res={res} wide={wide} />}

          {res.intent === "question" && (
            <>
              {res.answer ? (
                <p className="mt-3 text-[16px] text-primary-800 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3">{res.answer.answer}</p>
              ) : (
                <p className="mt-3 text-[15px] text-primary-600">
                  {res.missing?.length
                    ? `We couldn't find "${res.missing[0]}" in our listings. Check the spelling, or search for it first.`
                    : "Couldn't answer that right now. The turf page has the details and a Call button."}
                </p>
              )}
              {res.turfs?.length ? (
                <div className={grid}>
                  {res.turfs.map((t) => (
                    <TurfCard key={t.id} turf={t} />
                  ))}
                </div>
              ) : null}
            </>
          )}

          {res.intent === "other" && (
            <p className="mt-3 text-[15px] text-primary-600">Try a sport and an area, &ldquo;games near me&rdquo;, or two venue names with &ldquo;vs&rdquo;.</p>
          )}
        </div>
      )}
    </section>
  );
}

function headline(r: AskResponse): string {
  if (r.intent === "other") return "That one's not about turfs";
  return r.summary;
}

function subline(r: AskResponse): string {
  if (r.failed) return "Something went wrong on our side. Try again in a moment.";
  switch (r.intent) {
    case "find_turf":
      return r.total === 0
        ? "Nothing matched. Try fewer conditions."
        : `${r.total} match${r.total === 1 ? "" : "es"}${r.relaxed.length ? `, after widening ${r.relaxed.join(" and ")}` : ""}`;
    case "find_game":
      return r.total === 0
        ? "No open games match yet. Host one and we'll list it."
        : `${r.total} open game${r.total === 1 ? "" : "s"}${r.relaxed.length ? `, after widening ${r.relaxed.join(" and ")}` : ""}`;
    case "compare":
      return r.missing?.length ? `Couldn't find ${r.missing.map((m) => `"${m}"`).join(" or ")} in our listings.` : "From listed rates, hours, facilities and recent reviews.";
    case "question":
      return r.answer?.covered === false ? "Not listed on TapTurf yet." : r.turfs?.[0] ? `About ${r.turfs[0].name}.` : "";
    default:
      return "";
  }
}

function Chips({ res }: { res: AskResponse }) {
  const f = res.filters;
  const out: string[] = [];
  if (f.sport) out.push(sportBySlug(f.sport)?.name ?? f.sport);
  for (const a of f.areas) out.push(a);
  if (f.city && isCity(f.city) && f.areas.length === 0) out.push(labelFor(f.city));
  if (f.wantsNearby) out.push("Near you");
  if (f.maxPrice != null) out.push(`Under ₹${f.maxPrice.toLocaleString("en-IN")}${res.intent === "find_game" ? "" : "/hr"}`);
  if (f.when) out.push({ today: "Today", tomorrow: "Tomorrow", weekend: "This weekend", this_week: "This week" }[f.when] ?? f.when);
  if (f.skill) out.push(f.skill.replace(/^\w/, (c) => c.toUpperCase()));
  if (f.time && res.intent === "find_turf") out.push({ morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" }[f.time] ?? f.time);
  if (f.open24x7) out.push("Open 24 hours");
  for (const n of f.needs) out.push(n.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()));
  if (f.players) out.push(`${f.players} players`);
  if (!out.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {out.map((c) => (
        <span key={c} className="h-7 px-2.5 inline-flex items-center rounded-full bg-accent-50 text-accent-700 text-[12px] font-medium">
          {c}
        </span>
      ))}
    </div>
  );
}

function Compare({ res, wide }: { res: AskResponse; wide: boolean }) {
  const turfs = res.turfs ?? [];
  const c = res.compare;
  if (turfs.length < 2) {
    return (
      <p className="mt-3 text-[15px] text-primary-600">
        {turfs.length === 1 ? "Found one of them. Add the second venue\u2019s name and try again." : "Name two venues we list, for example two turfs from the same city."}
      </p>
    );
  }
  return (
    <div className="mt-4">
      {c ? (
        <>
          <p className="text-[16px] text-primary-800 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3">{c.verdict}</p>
          <div className="mt-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-[14px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="text-left text-[12px] font-semibold uppercase tracking-wide text-primary-400 pb-2 pr-3" />
                  {turfs.map((t) => (
                    <th key={t.id} className="text-left font-semibold text-primary-900 pb-2 pr-3 align-bottom">
                      <Link href={`/turf/${t.id}`} className="hover:text-accent-600">
                        {t.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.label} className="align-top">
                    <td className="py-2 pr-3 text-primary-500 whitespace-nowrap border-t border-primary-100">{row.label}</td>
                    {turfs.map((t, i) => (
                      <td key={t.id} className="py-2 pr-3 text-primary-800 border-t border-primary-100">
                        {row.values[i] ?? "Not listed"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="align-top">
                  <td className="py-2 pr-3 text-primary-500 whitespace-nowrap border-t border-primary-100">Best for</td>
                  {turfs.map((t, i) => (
                    <td key={t.id} className="py-2 pr-3 font-medium text-accent-700 border-t border-primary-100">
                      {c.best_for[i] ?? ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {c.caveats && <p className="mt-2 text-[12px] text-primary-400">{c.caveats}</p>}
        </>
      ) : (
        <p className="text-[15px] text-primary-600">Couldn&rsquo;t write the comparison right now. Both pages are below.</p>
      )}
      <div className={`mt-5 grid grid-cols-1 sm:grid-cols-2 ${wide ? "" : "md:grid-cols-3"} gap-x-5 gap-y-7`}>
        {turfs.map((t) => (
          <TurfCard key={t.id} turf={t} />
        ))}
      </div>
    </div>
  );
}

function More({ href, label, tone = "dark" }: { href: string; label: string; tone?: "dark" | "light" }) {
  return (
    <div className="mt-6 text-center">
      <Link
        href={href}
        className={`inline-flex items-center gap-1.5 h-11 px-6 rounded-full text-[15px] font-semibold ${
          tone === "dark" ? "bg-primary-900 hover:bg-primary-800 text-white" : "bg-primary-100 hover:bg-primary-200 text-primary-900"
        }`}
      >
        {label} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function moreLink(r: AskResponse): string {
  const { city, sport } = r.filters;
  if (city && isCity(city) && sport) return `/${city}/${sport}`;
  if (city && isCity(city)) return `/${city}`;
  if (sport) return `/sport/${sport}`;
  return "/turfs";
}

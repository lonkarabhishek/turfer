"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LocateFixed, RotateCcw, Sparkles } from "lucide-react";
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
  reply: string;
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
  memo: Record<string, unknown>;
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

type Turn = { user: string; res: AskResponse | null; error?: string };

const EXAMPLES = [
  "Box cricket in Kothrud under ₹1,000",
  "Football games near me this weekend",
  "Hindu Gymkhana vs Vedant Sports Academy",
  "Does CC Turf Pardi have parking?",
  "24 hour cricket turf in Hyderabad",
];

/**
 * Ask TapTurf: a small chat for finding turfs, finding games,
 * comparing two venues, or asking about one. The server reads each
 * message with the last few turns for context, then answers from our
 * own listings. Results for the latest turn render under the thread.
 */
export function AskTurf({ variant = "home" }: { variant?: "home" | "listing" }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [locating, setLocating] = useState(false);
  const locRef = useRef<Coords | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const last = turns.length ? turns[turns.length - 1] : null;
  const res = last?.res ?? null;

  const run = useCallback(
    async (query: string, loc?: Coords | null) => {
      const text = query.trim();
      if (text.length < 2) return;
      setBusy(true);
      setQ("");
      // Previous completed turns go back as context for follow-ups.
      const history = turns
        .filter((t) => t.res)
        .slice(-3)
        .map((t) => ({ user: t.user, reply: t.res!.reply, filters: t.res!.memo }));
      setTurns((prev) => [...prev, { user: text, res: null }]);
      try {
        const params = new URLSearchParams({ q: text });
        const city = getCityPref();
        if (city) params.set("city", city);
        const at = loc ?? locRef.current;
        if (at) {
          params.set("lat", at.lat.toFixed(4));
          params.set("lng", at.lng.toFixed(4));
        }
        if (history.length) params.set("h", JSON.stringify(history));
        const r = await fetch(`/api/ask?${params}`);
        if (r.status === 429) throw new Error("That's a lot of questions in a row. Give it a few minutes.");
        if (!r.ok) throw new Error("I'm having trouble right now. The filters below still work.");
        const data = (await r.json()) as AskResponse;
        setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, res: data } : t)));
      } catch (e) {
        const msg = (e as Error).message || "Something went wrong.";
        setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, error: msg } : t)));
      } finally {
        setBusy(false);
      }
    },
    [turns],
  );

  // Keep the newest exchange in view on phones.
  useEffect(() => {
    if (turns.length > 1) threadRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length]);

  const useLocation = async () => {
    setLocating(true);
    try {
      const me = await getUserLocation();
      locRef.current = me;
      // Re-ask the same thing with a location, replacing the last turn.
      const again = last?.user ?? q;
      setTurns((prev) => prev.slice(0, -1));
      await run(again, me);
    } catch {
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, error: "Couldn't get your location. Add an area instead." } : t)));
    } finally {
      setLocating(false);
    }
  };

  const reset = () => {
    setTurns([]);
    setQ("");
    inputRef.current?.focus();
  };

  const wide = variant === "home";
  const grid = `mt-4 grid grid-cols-1 sm:grid-cols-2 ${wide ? "" : "md:grid-cols-3 lg:grid-cols-4"} gap-x-5 gap-y-7`;
  const started = turns.length > 0;

  return (
    <section className={wide ? "mt-7 text-left" : "mb-4"} aria-label="Ask TapTurf">
      {started && (
        <div ref={threadRef} className="mb-3 space-y-2.5">
          {turns.map((t, i) => (
            <div key={i} className="space-y-2.5">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-900 text-white text-[15px] px-4 py-2.5 leading-snug">{t.user}</p>
              </div>
              <div className="flex justify-start">
                <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-primary-100 text-primary-900 text-[15px] px-4 py-2.5 leading-snug">
                  {t.error ? (
                    <span className="text-hot-600">{t.error}</span>
                  ) : t.res ? (
                    <>
                      {t.res.reply}
                      {i === turns.length - 1 && <Subline res={t.res} />}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-primary-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

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
          enterKeyHint="send"
          placeholder={started ? "Ask a follow-up" : "Ask for a turf, a game, or compare two"}
          className="w-full h-12 pl-11 pr-24 rounded-full bg-white border border-primary-200 shadow-soft text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 2}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-full bg-primary-900 hover:bg-primary-800 disabled:opacity-40 text-white text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : started ? "Send" : "Ask"}
        </button>
      </form>

      {!started && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void run(ex)}
              className="shrink-0 h-8 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] text-primary-700 whitespace-nowrap"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {started && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium text-primary-500 hover:text-primary-800 hover:bg-primary-100"
          >
            <RotateCcw className="w-3 h-3" /> Start over
          </button>
        </div>
      )}

      {busy && !res && turns.length === 1 && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5" aria-hidden>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-2xl bg-primary-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-primary-100" />
            </div>
          ))}
        </div>
      )}

      {res && !busy && (
        <div className="mt-2" aria-live="polite">
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
              <div className={`mt-4 grid grid-cols-1 ${wide ? "" : "md:grid-cols-2"} gap-4`}>
                {(res.games ?? []).map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
              {res.total === 0 ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <More href="/games" label="See all open games" inline />
                  <More href="/game/create" label="Host one" tone="light" inline />
                </div>
              ) : (
                <More href="/games" label={res.total > (res.games?.length ?? 0) ? `See all ${res.total} games` : "All open games"} />
              )}
            </>
          )}

          {res.intent === "compare" && <Compare res={res} wide={wide} />}

          {res.intent === "question" && (
            <>
              {res.answer && (
                <p className="mt-3 text-[16px] text-primary-800 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3">{res.answer.answer}</p>
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
        </div>
      )}
    </section>
  );
}

/** Second line inside the reply bubble: counts and what was widened. */
function Subline({ res }: { res: AskResponse }) {
  let text = "";
  if (res.failed) text = "Something went wrong on our side. Try again in a moment.";
  else
    switch (res.intent) {
      case "find_turf":
        text =
          res.total === 0
            ? "Nothing matched that. Try fewer conditions."
            : `${res.total} match${res.total === 1 ? "" : "es"}${res.relaxed.length ? `, after widening ${res.relaxed.join(" and ")}.` : "."}`;
        break;
      case "find_game":
        text =
          res.total === 0
            ? "No open games match yet. You could host one and I'll list it."
            : `${res.total} open game${res.total === 1 ? "" : "s"}${res.relaxed.length ? `, after widening ${res.relaxed.join(" and ")}.` : "."}`;
        break;
      case "compare":
        if (res.missing?.length) text = `I couldn't find ${res.missing.map((m) => `"${m}"`).join(" or ")} in our listings. Check the spelling?`;
        else if ((res.turfs?.length ?? 0) < 2) text = "Name two venues we list and I'll put them side by side.";
        break;
      case "question":
        if (res.missing?.length) text = `I couldn't find "${res.missing[0]}" in our listings. Check the spelling, or search for it first.`;
        else if (!res.answer) text = "Couldn't answer that right now. The turf page has the details and a Call button.";
        break;
    }
  if (!text) return null;
  return <span className="block mt-1 text-[13px] text-primary-500">{text}</span>;
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
    <div className="mt-1 flex flex-wrap gap-1.5">
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
    return turfs.length ? (
      <div className={`mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-7`}>
        {turfs.map((t) => (
          <TurfCard key={t.id} turf={t} />
        ))}
      </div>
    ) : null;
  }
  return (
    <div className="mt-3">
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

function More({ href, label, tone = "dark", inline = false }: { href: string; label: string; tone?: "dark" | "light"; inline?: boolean }) {
  const link = (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 h-11 px-6 rounded-full text-[15px] font-semibold ${
        tone === "dark" ? "bg-primary-900 hover:bg-primary-800 text-white" : "bg-primary-100 hover:bg-primary-200 text-primary-900"
      }`}
    >
      {label} <ArrowRight className="w-4 h-4" />
    </Link>
  );
  return inline ? link : <div className="mt-6 text-center">{link}</div>;
}

function moreLink(r: AskResponse): string {
  const { city, sport } = r.filters;
  if (city && isCity(city) && sport) return `/${city}/${sport}`;
  if (city && isCity(city)) return `/${city}`;
  if (sport) return `/sport/${sport}`;
  return "/turfs";
}

"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, Loader2, MapPin, Navigation } from "lucide-react";
import { isCitySlug, labelFor, locateCity, setCityPref, type CityCount, type CitySource } from "@/lib/city";
import { trackCity } from "@/lib/analytics/city";

export type PickPage = "/" | "/turfs" | "/games";

const SUB: Record<PickPage, string> = {
  "/": "Pick your city and we'll show you its turfs and open games.",
  "/turfs": "Pick your city to see its turfs, with prices and ratings.",
  "/games": "Pick your city to see open games you can join.",
};

const CHIP =
  "h-11 px-4 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:border-primary-900 focus-neon disabled:opacity-60";

/** Chips shown before "More cities". */
const TOP = 12;

/**
 * The city-first screen: what every human whose city is not confirmed
 * gets on /, /turfs and /games (proxy.ts rewrites them to app/c/pick).
 * The IP-detected city, if any, is the one big answer; "Use my location"
 * and the city chips are the others. There is no "all of India" choice.
 *
 * Tiny on purpose: no turf data, no fetch. `cities` is every city with
 * active turfs and its count, biggest first (pickCities in
 * app/c/pick/meta.ts: the hourly live list /api/cities serves the picker);
 * the biggest twelve are the first chips, the rest sit A to Z under
 * "More cities", so a city added to the database shows up here without a
 * code change. Every city is a submit button of a native form
 * post to /api/city, so a tap before hydration still works (303 back to
 * this URL with the cookie set). After hydration a tap stores the pick
 * with setCityPref, the same as the picker, and CitySync answers the
 * change with a full load of this same URL, which the proxy then serves
 * as the city's page (no stale pick screen left in the client router).
 * The section's id is how CitySync knows this screen is on show.
 */
export function CityPick({ detected, page, cities }: { detected: string | null; page: PickPage; cities: CityCount[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState("");
  const [far, setFar] = useState<{ id: string; km: number } | null>(null);

  useEffect(() => {
    trackCity("city_ask_shown", { page, detected: detected ?? "none" });
  }, [page, detected]);

  const choose = (id: string, source: CitySource) => {
    // Every chip is a city slug already; this only guards a bad answer,
    // which would otherwise leave the spinner up with nothing to open.
    if (!isCitySlug(id)) {
      setStatus("Couldn't open that city. Pick another below.");
      return;
    }
    setBusy(id);
    setStatus(`Opening ${labelFor(id)}…`);
    setCityPref(id, { source });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (b?.value) choose(b.value, "ask");
  };

  const onGps = async () => {
    if (busy || locating) return;
    setLocating(true);
    setStatus("");
    setFar(null);
    const r = await locateCity();
    setLocating(false);
    if ("city" in r) return choose(r.city, "gps");
    if (r.error === "far") {
      setFar(r.nearest);
      setStatus(`No TapTurf city within 200 km of you yet. The closest is ${labelFor(r.nearest.id)}, ${r.nearest.km} km away.`);
    } else if (r.error === "denied") setStatus("Location is off. Pick your city below.");
    else if (r.error === "unsupported") setStatus("This browser can't share your location. Pick your city below.");
    else setStatus("Couldn't get your location. Pick your city below.");
  };

  // Never the detected city: it is the big button.
  const others = cities.filter((c) => c.id !== detected).map((c) => ({ ...c, label: labelFor(c.id) }));
  const top = others.slice(0, TOP);
  const rest = others.slice(TOP).sort((a, b) => a.label.localeCompare(b.label));
  const spin = (id: string) => (busy === id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null);
  const chip = (c: { id: string; label: string; n: number }) => (
    <li key={c.id}>
      <button name="choice" value={c.id} disabled={busy !== null} className={CHIP}>
        {spin(c.id)}
        {c.label}
        {c.n > 0 && <span className="font-normal text-primary-500 tabular-nums">{c.n.toLocaleString("en-IN")}</span>}
      </button>
    </li>
  );
  const gpsLabel = locating ? "Finding you…" : "Use my location";

  return (
    <section id="tt-pick" aria-labelledby="pick-h" className="max-w-xl mx-auto px-4 pt-8 pb-12 md:pt-16">
      <h1 id="pick-h" className="font-display text-[30px] min-[400px]:text-[34px] md:text-[44px] font-bold tracking-tight text-primary-900 leading-[1.1]">
        Where do you play?
      </h1>
      <p className="mt-2 text-[15px] md:text-[17px] text-primary-600">{SUB[page]}</p>

      <form method="post" action="/api/city" onSubmit={onSubmit} aria-busy={busy !== null || undefined} className="mt-6">
        <input type="hidden" name="next" value={page} />

        {detected && (
          <button
            name="choice"
            value={detected}
            disabled={busy !== null}
            aria-label={`Continue with ${labelFor(detected)}`}
            className="w-full min-h-[76px] px-4 min-[400px]:px-5 py-3 flex items-center justify-between gap-3 rounded-2xl bg-primary-900 text-white text-left shadow-elevated hover:bg-primary-950 focus-neon disabled:opacity-90"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="hidden min-[440px]:inline-flex w-10 h-10 shrink-0 rounded-full bg-white/10 items-center justify-center">
                <MapPin className="w-5 h-5 text-accent-400" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] text-white/70">Looks like you&apos;re in</span>
                <span className="block break-words text-[20px] min-[440px]:text-[22px] font-bold leading-tight">{labelFor(detected)}</span>
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-1.5 h-11 px-3 min-[360px]:px-4 rounded-full bg-accent-600 text-[15px] font-semibold">
              {busy === detected ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
              Continue
              {busy === detected ? null : <ArrowRight className="hidden min-[360px]:block w-4 h-4" aria-hidden />}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onGps}
          disabled={locating || busy !== null}
          className={
            detected
              ? "mt-3 w-full min-h-12 py-2 text-center inline-flex items-center justify-center gap-2 rounded-2xl border border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:border-primary-900 focus-neon disabled:opacity-70"
              : "w-full h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-900 text-white text-[16px] font-semibold shadow-elevated hover:bg-primary-950 focus-neon disabled:opacity-80"
          }
        >
          {/* One inline run, so a label that wraps keeps the icon beside its first line. */}
          <span>
            {locating ? (
              <Loader2 className="inline-block w-4 h-4 mr-2 align-[-3px] animate-spin" aria-hidden />
            ) : (
              <Navigation className={`inline-block w-4 h-4 mr-2 align-[-3px] ${detected ? "text-accent-600" : "text-accent-400"}`} aria-hidden />
            )}
            {detected && !locating ? `Not in ${labelFor(detected)}? Use my location` : gpsLabel}
          </span>
        </button>

        <p aria-live="polite" className="mt-2 empty:mt-0 text-[14px] text-primary-600">
          {status}
        </p>
        {far && (
          <button type="button" onClick={() => choose(far.id, "gps")} disabled={busy !== null} className={`${CHIP} mt-1`}>
            {spin(far.id)}
            Show {labelFor(far.id)}
          </button>
        )}

        <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-primary-500">
          {detected ? "Or pick your city" : "Pick your city"}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">{top.map(chip)}</ul>
        {rest.length > 0 && (
          <details className="group mt-3">
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer inline-flex items-center gap-1.5 h-11 px-2 -mx-2 rounded-full text-[15px] font-semibold text-accent-700 hover:text-accent-800 focus-neon">
              More cities ({rest.length})
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">{rest.map(chip)}</ul>
          </details>
        )}
      </form>

      <p className="mt-8 text-[13px] text-primary-500">You can change your city any time from the menu.</p>
    </section>
  );
}

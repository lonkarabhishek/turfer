"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { NO_CITY, byCity, cityLabel, type Person } from "@/lib/admin/people";

/**
 * Sign-ups by city for the stretch the chart shows. A city's bar is its
 * recorded sign-ups (picked, located or from the internet connection)
 * plus, lighter, best guesses from activity for accounts made before
 * cities were recorded. Tapping a city shows only its sign-ups in the
 * chart and the list; tapping it again, or All cities, shows everyone.
 */

// One hue: the chart's green for recorded cities, a lighter step of it for guesses.
const RECORDED = "#16A34A";
const GUESSED = "#86CFA0";
const NOT_KNOWN = "#D1D5DB";
const TRACK = "#F3F4F6";
const FIRST = 8;

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export function CityBreakdown({
  people,
  city,
  onCity,
  label,
}: {
  /** Everyone who signed up in the stretch shown, every city. */
  people: Person[];
  city: string | null;
  onCity: (city: string | null) => void;
  label: string;
}) {
  const [all, setAll] = useState(false);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const { cities, unknown } = useMemo(() => byCity(people), [people]);
  const total = people.length;
  const guesses = cities.some((c) => c.guessed > 0);
  const max = Math.max(1, unknown, ...cities.map((c) => c.total));

  // The picked city stays in the list, even at 0 in this stretch, so it can be cleared.
  const rows = city && city !== NO_CITY && !cities.some((c) => c.id === city) ? [...cities, { id: city, label: cityLabel(city), recorded: 0, guessed: 0, total: 0 }] : cities;
  const shown = all ? rows : rows.slice(0, FIRST).concat(rows.slice(FIRST).filter((c) => c.id === city));
  const hidden = rows.length - shown.length;

  return (
    <div className="mt-6 border-t border-primary-100 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h3 ref={headRef} tabIndex={-1} className="font-semibold text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 rounded">
            By city
          </h3>
          <p className="text-[13px] text-primary-500">
            {total.toLocaleString("en-IN")} {total === 1 ? "person" : "people"} · {label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-primary-500">
          <Key color={RECORDED} text="Recorded" />
          {guesses && <Key color={GUESSED} text="Best guess from activity" />}
          {unknown > 0 && <Key color={NOT_KNOWN} text="Not known" />}
          {city !== null && (
            <button
              type="button"
              // This button goes away: keep focus on the heading.
              onClick={() => {
                headRef.current?.focus();
                onCity(null);
              }}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-primary-200 font-semibold text-primary-700 hover:bg-primary-50">
              <X className="w-3.5 h-3.5" aria-hidden /> All cities
            </button>
          )}
        </div>
      </div>

      {total === 0 && city === null ? (
        <p className="mt-3 rounded-xl bg-primary-50 px-4 py-6 text-center text-sm text-primary-600">No one signed up in this stretch.</p>
      ) : (
        <div role="group" aria-label="Show only one city's sign-ups" className="mt-3 grid gap-x-8 gap-y-0.5 md:grid-cols-2">
          {shown.map((c) => (
            <Bar
              key={c.id}
              name={c.label}
              parts={[
                [c.recorded, RECORDED],
                [c.guessed, GUESSED],
              ]}
              total={c.total}
              of={total}
              max={max}
              pressed={city === c.id}
              described={c.guessed ? `${c.recorded} recorded, ${c.guessed} best ${c.guessed === 1 ? "guess" : "guesses"}` : null}
              onClick={() => onCity(city === c.id ? null : c.id)}
            />
          ))}
          {(unknown > 0 || city === NO_CITY) && (
            <Bar name="Not known" parts={[[unknown, NOT_KNOWN]]} total={unknown} of={total} max={max} pressed={city === NO_CITY} described={null} muted onClick={() => onCity(city === NO_CITY ? null : NO_CITY)} />
          )}
        </div>
      )}

      {/* One toggle that stays put, so focus stays on it. */}
      {(all ? rows.length > FIRST : hidden > 0) && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="mt-2 text-[13px] font-semibold text-primary-700 underline underline-offset-2">
          {all ? `Show the top ${FIRST}` : `Show all ${rows.length} cities`}
        </button>
      )}
    </div>
  );
}

function Key({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {text}
    </span>
  );
}

function Bar({
  name,
  parts,
  total,
  of,
  max,
  pressed,
  described,
  muted = false,
  onClick,
}: {
  name: string;
  parts: [number, string][];
  total: number;
  of: number;
  max: number;
  pressed: boolean;
  described: string | null;
  muted?: boolean;
  onClick: () => void;
}) {
  const drawn = parts.filter(([n]) => n > 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={`${name}: ${total.toLocaleString("en-IN")} ${total === 1 ? "sign-up" : "sign-ups"}, ${pct(total, of)}%${described ? ` (${described})` : ""}`}
      className={`w-full min-h-10 px-2 py-1.5 rounded-lg text-left grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 transition-colors ${pressed ? "bg-primary-100 ring-1 ring-primary-300" : "hover:bg-primary-50"}`}
    >
      <span className={`truncate text-[13px] ${pressed ? "font-bold text-primary-900" : muted ? "text-primary-500" : "text-primary-800"}`}>{name}</span>
      <span className="text-[13px] text-primary-900" style={{ fontVariantNumeric: "tabular-nums" }}>
        {total.toLocaleString("en-IN")}
        <span className="ml-1.5 text-[11px] text-primary-400">{pct(total, of)}%</span>
      </span>
      {/* Thin bar, 2px gaps between parts, rounded ends; the track shows the scale. */}
      <span className="col-span-2 flex h-2 rounded-full overflow-hidden" style={{ background: TRACK }} aria-hidden>
        <span className="flex h-full gap-[2px]" style={{ width: `${(total / max) * 100}%`, background: "white" }}>
          {drawn.map(([n, color], i) => (
            <span key={i} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: color }} />
          ))}
        </span>
      </span>
    </button>
  );
}

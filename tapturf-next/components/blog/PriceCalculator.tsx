"use client";

import { useMemo, useState } from "react";

/**
 * Per-player price splitter used in the Pune pricing article. Venues
 * rarely publish exact hourly rates, so the useful thing a reader can
 * actually take away is "what does this cost me and my squad?".
 * All math is client-side; no network, no state persistence.
 */
export function PriceCalculator({
  defaults,
  caption,
}: {
  defaults?: { pricePerHour?: number; players?: number; hours?: number };
  caption?: string;
}) {
  const [pricePerHour, setPricePerHour] = useState<number>(defaults?.pricePerHour ?? 800);
  const [players, setPlayers] = useState<number>(defaults?.players ?? 10);
  const [hours, setHours] = useState<number>(defaults?.hours ?? 1);

  const total = useMemo(() => Math.max(0, pricePerHour * hours), [pricePerHour, hours]);
  const perPlayer = useMemo(
    () => (players > 0 ? Math.round(total / players) : 0),
    [total, players],
  );

  return (
    <div className="my-8 rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-accent-50/40 p-5 sm:p-6 not-prose">
      {caption && (
        <p className="text-xs font-bold text-accent-600 mb-3">
          {caption}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Field
          label="Turf price / hour"
          prefix="₹"
          value={pricePerHour}
          min={0}
          max={5000}
          step={50}
          onChange={setPricePerHour}
        />
        <Field
          label="Players"
          value={players}
          min={2}
          max={30}
          step={1}
          onChange={setPlayers}
        />
        <Field
          label="Hours"
          value={hours}
          min={1}
          max={6}
          step={1}
          onChange={setHours}
        />
      </div>
      <div className="rounded-2xl bg-white border border-primary-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-primary-500 mb-1">
            Per player
          </p>
          <p className="font-display text-4xl sm:text-5xl text-primary-900 tabular-nums leading-none">
            ₹{perPlayer.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="text-sm text-primary-500">
          Total for the slot: <span className="font-semibold text-primary-800 tabular-nums">₹{total.toLocaleString("en-IN")}</span>
          {players > 0 && (
            <>
              <br />
              {players} players · {hours} hr{hours > 1 ? "s" : ""}
            </>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-primary-400 leading-snug">
        Venues publish prices as slot bands (morning / evening / weekend), and rates change without notice. Always confirm the current rate with the turf before you commit.
      </p>
    </div>
  );
}

function Field({
  label,
  prefix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  prefix?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-primary-500">
        {label}
      </span>
      <div className="flex items-center rounded-xl border border-primary-200 bg-white overflow-hidden focus-within:border-accent-500 transition-colors">
        {prefix && (
          <span className="pl-3 text-primary-500 select-none">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const raw = parseInt(e.target.value, 10);
            if (Number.isNaN(raw)) return onChange(min);
            onChange(Math.max(min, Math.min(max, raw)));
          }}
          className="flex-1 min-w-0 px-3 py-2 text-primary-900 font-semibold tabular-nums bg-transparent focus:outline-none"
        />
      </div>
    </label>
  );
}

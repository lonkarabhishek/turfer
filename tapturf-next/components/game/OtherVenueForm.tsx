"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { cityInfo, getCityPref, matchCities } from "@/lib/city";
import { loadLiveCities, type LiveRow } from "@/components/city/liveCityList";
import { VENUE_LENGTH, venueCityValue, venueFormProblems, venueText, type VenueKey } from "@/lib/games/otherVenue";
import type { TypedVenue } from "@/types/game";

const input =
  "w-full min-h-12 rounded-xl border bg-white px-3.5 py-3 text-base text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600";
const label = "block text-[14px] font-medium text-primary-800 mb-1";

/** The form's words, as typed (the city as typed, or a picked city's id). */
export type VenueDraft = { name: string; address: string; area: string; city: string; cityId: string | null; mapsUrl: string };

/** A fresh form: the name from the search, the city from the visitor's city. */
export function venueDraft(name = "", from?: TypedVenue | null): VenueDraft {
  if (from) {
    const known = cityInfo(from.city);
    return { name: from.name, address: from.address, area: from.area ?? "", city: known.label, cityId: from.city, mapsUrl: from.mapsUrl ?? "" };
  }
  const pref = getCityPref();
  return { name: venueText(name), address: "", area: "", city: pref ? cityInfo(pref).label : "", cityId: pref, mapsUrl: "" };
}

/**
 * "Not on TapTurf? Add the venue": the place a host types when the turf
 * isn't listed (lib/games/otherVenue.ts has the rules the server checks
 * again). Name and address are needed, the area and a Google Maps link
 * may be left out; the city starts as the visitor's and suggests the live
 * cities as it is typed (another town is fine as typed). Each field says
 * what's wrong once it has been left, or all of them on "Use this venue".
 */
export function OtherVenueForm({
  draft,
  onDraft,
  onUse,
  onCancel,
}: {
  draft: VenueDraft;
  onDraft: (d: VenueDraft) => void;
  onUse: (v: TypedVenue) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<VenueKey, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [live, setLive] = useState<LiveRow[] | null>(null);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadLiveCities().then((rows) => alive && setLive(rows));
    return () => {
      alive = false;
    };
  }, []);

  const problems = venueFormProblems({ name: draft.name, address: draft.address, area: draft.area, city: draft.city, mapsUrl: draft.mapsUrl });
  const shown = (k: VenueKey) => (tried || touched[k] ? problems[k] : undefined);
  const set = (patch: Partial<VenueDraft>) => onDraft({ ...draft, ...patch });
  const leave = (k: VenueKey) => setTouched((t) => ({ ...t, [k]: true }));

  const suggestions = useMemo(() => {
    const q = draft.city.trim();
    if (!live || !q || draft.cityId) return [];
    return matchCities(q, live).slice(0, 5);
  }, [live, draft.city, draft.cityId]);

  const use = () => {
    setTried(true);
    if (Object.keys(problems).length > 0) {
      const first = (["venue_name", "venue_address", "venue_area", "venue_city", "venue_maps_url"] as const).find((k) => problems[k]);
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    const liveIds = (live ?? []).map((c) => c.id);
    onUse({
      name: venueText(draft.name),
      address: venueText(draft.address),
      area: venueText(draft.area) || null,
      city: draft.cityId && cityInfo(draft.cityId).label.toLowerCase() === venueText(draft.city).toLowerCase() ? draft.cityId : venueCityValue(draft.city, liveIds),
      mapsUrl: venueText(draft.mapsUrl) || null,
    });
  };

  const field = (k: VenueKey) => {
    const err = shown(k);
    return {
      id: `${id}-${k}`,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": [err ? `${id}-${k}-err` : "", k === "venue_maps_url" ? `${id}-maps-hint` : ""].filter(Boolean).join(" ") || undefined,
      onBlur: () => leave(k),
      className: `${input} ${err ? "border-hot-500" : "border-primary-300"}`,
    };
  };
  const error = (k: VenueKey) =>
    shown(k) ? (
      <p id={`${id}-${k}-err`} className="mt-1 text-[13px] font-medium text-hot-600 leading-snug">
        {shown(k)}
      </p>
    ) : null;

  return (
    <div role="group" aria-labelledby={`${id}-h`} className="px-4 py-4">
      <p id={`${id}-h`} className="flex items-center gap-2 text-[16px] font-bold text-primary-900">
        <MapPin className="w-4 h-4 text-accent-600 shrink-0" aria-hidden />
        Add a venue that isn&apos;t on TapTurf
      </p>
      <p className="mt-1 text-[13px] text-primary-500 leading-snug">Players see its name and address on the game page.</p>

      <div className="mt-4 space-y-3.5">
        <div>
          <label htmlFor={`${id}-venue_name`} className={label}>Venue name</label>
          <input
            {...field("venue_name")}
            type="text"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={VENUE_LENGTH.venue_name[1] + 10}
            placeholder="e.g. Shivaji Maidan"
            autoComplete="off"
          />
          {error("venue_name")}
        </div>

        <div>
          <label htmlFor={`${id}-venue_address`} className={label}>Address</label>
          <textarea
            {...field("venue_address")}
            value={draft.address}
            onChange={(e) => set({ address: e.target.value })}
            maxLength={VENUE_LENGTH.venue_address[1] + 10}
            rows={2}
            placeholder="Street, landmark, area"
            className={`${field("venue_address").className} resize-none`}
          />
          {error("venue_address")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${id}-venue_area`} className={label}>
              Area <span className="font-normal text-primary-500">(optional)</span>
            </label>
            <input {...field("venue_area")} type="text" value={draft.area} onChange={(e) => set({ area: e.target.value })} maxLength={VENUE_LENGTH.venue_area[1] + 10} placeholder="e.g. Baner" autoComplete="off" />
            {error("venue_area")}
          </div>
          <div className="relative min-w-0">
            <label htmlFor={`${id}-venue_city`} className={label}>City</label>
            <input
              {...field("venue_city")}
              type="text"
              value={draft.city}
              onChange={(e) => {
                set({ city: e.target.value, cityId: null });
                setCityOpen(true);
              }}
              onFocus={() => setCityOpen(true)}
              onBlur={() => {
                leave("venue_city");
                // After a tap on a suggestion has landed.
                setTimeout(() => setCityOpen(false), 150);
              }}
              maxLength={VENUE_LENGTH.venue_city[1] + 10}
              placeholder="e.g. Pune"
              autoComplete="off"
              role="combobox"
              aria-expanded={cityOpen && suggestions.length > 0}
              aria-controls={`${id}-cities`}
              aria-autocomplete="list"
            />
            {cityOpen && suggestions.length > 0 && (
              <ul id={`${id}-cities`} role="listbox" className="absolute z-[70] left-0 right-0 top-full mt-1 rounded-xl border border-primary-200 bg-white shadow-elevated overflow-hidden">
                {suggestions.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        set({ city: c.label, cityId: c.id });
                        setCityOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 min-h-11 text-[15px] text-primary-900 hover:bg-accent-50"
                    >
                      {c.label}
                      {c.state && c.state !== "India" && <span className="text-primary-500">, {c.state}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error("venue_city")}
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-venue_maps_url`} className={label}>
            Google Maps link <span className="font-normal text-primary-500">(optional)</span>
          </label>
          <input
            {...field("venue_maps_url")}
            type="url"
            inputMode="url"
            value={draft.mapsUrl}
            onChange={(e) => set({ mapsUrl: e.target.value })}
            maxLength={VENUE_LENGTH.venue_maps_url[1] + 10}
            placeholder="https://maps.app.goo.gl/…"
            autoComplete="off"
          />
          <p id={`${id}-maps-hint`} className="mt-1 text-[12px] text-primary-500 leading-snug">
            In Google Maps, open the place, tap Share, then Copy link, and paste it here.
          </p>
          {error("venue_maps_url")}
        </div>
      </div>

      {/* No blur on the press (mouse or touch): a field left with an error would put its line above the
          button and move it from under the finger, and the tap would be lost. use() then shows every error. */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={use}
        className="mt-5 w-full min-h-12 rounded-full bg-primary-800 hover:bg-primary-900 text-white text-[16px] font-bold shadow-elevated focus-neon"
      >
        Use this venue
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="mt-1 w-full min-h-11 rounded-full text-[15px] font-semibold text-primary-600 hover:text-primary-900 focus-neon"
      >
        Cancel
      </button>
      <p className="mt-1 text-[12px] text-primary-500 leading-snug text-center">For bookings, contact the venue directly.</p>
    </div>
  );
}

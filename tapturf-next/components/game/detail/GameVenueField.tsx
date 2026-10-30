"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, Undo2 } from "lucide-react";
import { nearbyTurfsForSport, searchTurfs } from "@/lib/queries/users";
import { sportVenues } from "@/lib/sports";
import { gamePlace } from "@/lib/utils/game";
import { NEARBY_MAX_KM, gameSportPage, nearbyVenues, venueDistance, venueLine, type VenueOption } from "@/lib/utils/gameVenue";

type Current = { id: string; name: string; area?: string | null; city?: string | null; address?: string | null; lat?: number | null; lng?: number | null };
type Hit = { id: string; name: string; address: string; area?: string | null; city?: string | null };

/**
 * While typing, the search row sits at the top of the sheet, so the
 * answers show under it and above the keys (a 320 px phone has room for
 * little else with the keyboard up).
 */
function liftToTop(el: HTMLElement | null) {
  const box = el?.closest<HTMLElement>("[role=dialog]");
  if (el && box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
}

/**
 * The edit sheet's venue (host only): the turf the game is at, and
 * "Change venue" for when it fell through. The same search as the create
 * flow (searchTurfs: active turfs, cleaned names) and, so the host need
 * not know a name, the nearest other venues that list the game's sport.
 * A pick only stages the move: Undo puts the old turf back, and nothing
 * is saved (or anyone told) until Save changes.
 */
export function GameVenueField({
  current,
  sport,
  picked,
  onPick,
  wasBooked,
  booked,
  onBooked,
}: {
  current: Current | null | undefined;
  sport: string;
  /** The staged new venue; null keeps the current one. */
  picked: VenueOption | null;
  onPick: (v: VenueOption | null) => void;
  /** The sheet said booked (at the current turf) when the venue was picked: the new one is asked about, not assumed. */
  wasBooked: boolean;
  booked: boolean;
  onBooked: (b: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The last answer and the words it was for: a list for older words is not shown.
  const [found, setFound] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [nearby, setNearby] = useState<VenueOption[] | null>(null);
  // The nearby list could not be read: said so (not "none within 25 km"), with Try again.
  const [nearbyFailed, setNearbyFailed] = useState(false);
  const page = gameSportPage(sport);
  const lat = current?.lat;
  const lng = current?.lng;
  const currentId = current?.id;
  const q = query.trim();

  // As in the create flow: 2 letters, then a search 300 ms after the last key.
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const { data } = await searchTurfs(q);
      if (alive) setFound({ q, hits: data });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  // The nearby list, once, the first time the panel opens (again after Try again).
  useEffect(() => {
    if (!open || nearby || nearbyFailed || !page || lat == null || lng == null) return;
    let alive = true;
    nearbyTurfsForSport(Number(lat), Number(lng), page.slug).then((rows) => {
      if (!alive) return;
      if (rows) setNearby(nearbyVenues({ id: currentId, lat, lng }, rows, page));
      else setNearbyFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [open, nearby, nearbyFailed, page, lat, lng, currentId]);

  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (found && row.current?.contains(document.activeElement)) liftToTop(row.current);
  }, [found]);

  const choose = (v: VenueOption) => {
    onPick(v.id === currentId ? null : v);
    setOpen(false);
    setQuery("");
  };

  const shown = picked ?? current;
  const place = shown ? gamePlace(shown) : "";
  const hits = found && found.q === q ? found.hits.filter((t) => t.id !== currentId) : null;

  return (
    <div role="group" aria-labelledby="edit-venue-h">
      <p id="edit-venue-h" className="block text-[14px] font-medium text-primary-700 mb-1">Venue</p>
      <div className={`rounded-xl border px-4 py-3 ${picked ? "border-accent-600 bg-accent-50" : "border-primary-200 bg-primary-50"}`}>
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 mt-0.5 shrink-0 text-accent-600" aria-hidden />
          <div className="flex-1 min-w-0">
            {picked && <p className="text-[12px] font-semibold uppercase tracking-wide text-accent-700">New venue</p>}
            <p className="text-[16px] font-semibold text-primary-900 leading-snug [overflow-wrap:anywhere]">{shown?.name ?? "No venue"}</p>
            {place && <p className="text-[14px] text-primary-500 leading-snug">{place}</p>}
            {picked && current && (
              <p className="mt-1 text-[13px] text-primary-500 leading-snug [overflow-wrap:anywhere]">Was {venueLine(current)}</p>
            )}
          </div>
          {picked ? (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="shrink-0 -mr-2 -my-1 min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-[15px] font-semibold text-accent-700 hover:bg-white"
            >
              <Undo2 className="w-4 h-4" aria-hidden />
              Undo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(!open);
                setQuery("");
              }}
              aria-expanded={open}
              aria-controls="edit-venue-panel"
              className="shrink-0 -mr-2 -my-1 min-h-11 px-3 rounded-full text-[15px] font-semibold text-accent-700 hover:bg-white"
            >
              {open ? "Close" : "Change venue"}
            </button>
          )}
        </div>
      </div>

      {picked && (
        <p className="mt-2 text-[13px] text-primary-500 leading-snug">
          Saved when you tap Save changes. Everyone in the game, and anyone waiting on a request, gets a notification.
        </p>
      )}

      {picked && wasBooked && (
        <div className="mt-3">
          <p id="edit-venue-booked" className="text-[15px] font-medium text-primary-900 leading-snug [overflow-wrap:anywhere]">Is {picked.name} booked?</p>
          <div role="radiogroup" aria-labelledby="edit-venue-booked" className="mt-2 grid grid-cols-2 gap-2">
            {[
              { v: false, label: "Not yet" },
              { v: true, label: "Yes, booked" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={booked === o.v}
                onClick={() => onBooked(o.v)}
                className={`min-h-11 rounded-full border text-[15px] font-semibold ${booked === o.v ? "border-primary-900 bg-primary-900 text-white" : "border-primary-300 bg-white text-primary-800"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[13px] text-primary-500">A booking at the old turf doesn&apos;t move with the game.</p>
        </div>
      )}

      {open && !picked && (
        <div id="edit-venue-panel" className="mt-2 rounded-xl border border-primary-200 bg-white">
          <div ref={row} className="flex items-center gap-2 border-b border-primary-100 px-4">
            <Search className="w-4 h-4 shrink-0 text-primary-400" aria-hidden />
            <label htmlFor="edit-venue-search" className="sr-only">Search a turf by name or area</label>
            <input
              id="edit-venue-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // After the keys have come up (ViewportOverlay has caught up by then).
              onFocus={() => setTimeout(() => liftToTop(row.current), 300)}
              placeholder="Turf name or area…"
              autoComplete="off"
              enterKeyHint="search"
              className="flex-1 min-w-0 min-h-12 bg-transparent text-base md:text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none"
            />
          </div>

          {q.length >= 2 ? (
            <div aria-live="polite">
              {hits === null ? (
                <p className="px-4 py-3 text-[14px] text-primary-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Searching…
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-3 text-[14px] text-primary-500">No turfs found. Try a different name</p>
              ) : (
                <ul className="max-h-64 overflow-y-auto overscroll-contain">
                  {hits.map((t) => (
                    <li key={t.id} className="border-b border-primary-100 last:border-0">
                      <button type="button" onClick={() => choose({ id: t.id, name: t.name, area: t.area, city: t.city, address: t.address })} className="w-full text-left px-4 py-3 min-h-12 hover:bg-accent-50">
                        <span className="block text-[15px] font-semibold text-primary-900 leading-snug [overflow-wrap:anywhere]">{t.name}</span>
                        {t.address && <span className="text-[13px] text-primary-500 leading-snug line-clamp-1">{t.address}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : page && current && lat != null && lng != null ? (
            <div>
              <p className="px-4 pt-3 text-[13px] font-semibold text-primary-700 [overflow-wrap:anywhere]">
                {sportVenues(page)} near {current.name}
              </p>
              {nearbyFailed ? (
                <div className="px-4 py-2 flex items-center gap-3">
                  <p className="flex-1 min-w-0 text-[14px] text-primary-500 leading-snug">Couldn&apos;t load nearby turfs. Search by name above.</p>
                  <button
                    type="button"
                    onClick={() => setNearbyFailed(false)}
                    className="shrink-0 -mr-2 min-h-11 px-3 rounded-full text-[15px] font-semibold text-accent-700 hover:bg-accent-50"
                  >
                    Try again
                  </button>
                </div>
              ) : nearby === null ? (
                <p className="px-4 py-3 text-[14px] text-primary-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Finding the nearest ones…
                </p>
              ) : nearby.length === 0 ? (
                <p className="px-4 py-3 text-[14px] text-primary-500">None other within {NEARBY_MAX_KM} km. Search by name above.</p>
              ) : (
                <>
                  <ul className="mt-1">
                    {nearby.map((v) => {
                      const where = gamePlace(v);
                      const far = venueDistance(v.km);
                      return (
                        <li key={v.id} className="border-b border-primary-100 last:border-0">
                          <button type="button" onClick={() => choose(v)} className="w-full flex items-center gap-3 text-left px-4 py-3 min-h-12 hover:bg-accent-50">
                            <span className="flex-1 min-w-0">
                              <span className="block text-[15px] font-semibold text-primary-900 leading-snug [overflow-wrap:anywhere]">{v.name}</span>
                              {where && <span className="block text-[13px] text-primary-500 leading-snug">{where}</span>}
                            </span>
                            {far && <span className="shrink-0 text-[14px] font-medium text-primary-700 tabular-nums">{far}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-4 pb-3 pt-1 text-[12px] text-primary-500 [overflow-wrap:anywhere]">Straight-line distance from {current.name}, not by road.</p>
                </>
              )}
            </div>
          ) : (
            <p className="px-4 py-3 text-[14px] text-primary-500">Search for the turf you&apos;re moving to.</p>
          )}
        </div>
      )}
    </div>
  );
}

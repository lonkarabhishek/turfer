"use client";

import { useEffect, useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { formatDistance, getUserLocation, haversineKm } from "@/lib/utils/location";

/**
 * "3.2 km away" for the person viewing a game. If they've already
 * allowed location for the site we measure straight away; otherwise
 * it's one tap, so we never throw a permission prompt on page load.
 * Renders nothing when the turf has no coordinates.
 */
export function GameDistance({
  lat,
  lng,
  tone = "light",
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** "light" = white text for the dark hero card. */
  tone?: "light" | "dark";
}) {
  const [km, setKm] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "locating" | "denied" | "error">("idle");
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat != null && lng != null;

  const locate = async () => {
    if (!hasCoords) return;
    setState("locating");
    try {
      const me = await getUserLocation();
      const d = haversineKm(me, { lat: Number(lat), lng: Number(lng) });
      if (Number.isFinite(d)) {
        setKm(d);
        setState("idle");
      } else {
        setState("error");
      }
    } catch (e) {
      setState((e as GeolocationPositionError)?.code === 1 ? "denied" : "error");
    }
  };

  // Auto-measure only when permission is already granted.
  useEffect(() => {
    if (!hasCoords || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let alive = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (!alive || p.state !== "granted") return;
        getUserLocation()
          .then((me) => {
            const d = haversineKm(me, { lat: Number(lat), lng: Number(lng) });
            if (alive && Number.isFinite(d)) setKm(d);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hasCoords, lat, lng]);

  if (!hasCoords) return null;

  const pill =
    tone === "light"
      ? "bg-white/15 text-white border border-white/20 hover:bg-white/25"
      : "bg-primary-100 text-primary-900 hover:bg-primary-200";
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;

  if (km != null) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${pill}`}>
          <Navigation className="w-3.5 h-3.5 fill-current" />
          {formatDistance(km)} away
        </span>
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold ${pill}`}
        >
          Directions
        </a>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={locate}
      disabled={state === "locating"}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-70 ${pill}`}
    >
      {state === "locating" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Navigation className="w-3.5 h-3.5" />
      )}
      {state === "locating"
        ? "Locating"
        : state === "denied"
          ? "Location blocked in browser"
          : state === "error"
            ? "Couldn't locate. Try again"
            : "How far is it?"}
    </button>
  );
}

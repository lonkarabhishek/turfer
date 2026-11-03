import Link from "next/link";
import { ChevronRight, ExternalLink, MapPin } from "lucide-react";
import type { SportFamily } from "@/lib/utils/sport";
import { GameDistance } from "../GameDistance";
import { GameMap } from "../GameMap";
import { GamePhoto } from "./GamePhoto";

/**
 * Where you'll play: the turf (its page has photos, prices, reviews and
 * other games), the full address, how far it is, and the map (behind the
 * cookie choice, as before). A venue the host typed because it isn't on
 * TapTurf (no href) has no page to link: its name, a quiet "Not on
 * TapTurf", its address and place, and Open in Maps (the host's own Google
 * Maps link, else a search for it).
 */
export function GameWhere({
  href,
  name,
  address,
  place,
  photos,
  family,
  lat,
  lng,
  mapSrc,
  mapHref,
}: {
  /** The turf's page; none for a venue not on TapTurf. */
  href?: string | null;
  name: string;
  address: string | null | undefined;
  /** "Baner, Pune": shown for a typed venue under its address. */
  place?: string;
  photos: readonly string[] | undefined;
  family: SportFamily;
  lat: number | null | undefined;
  lng: number | null | undefined;
  mapSrc: string | null;
  mapHref: string | null;
}) {
  return (
    <section aria-labelledby="where-h">
      <h2 id="where-h" className="text-[20px] font-bold text-primary-900">Where you&apos;ll play</h2>
      {href ? (
        <Link
          href={href}
          className="mt-3 flex items-center gap-3 rounded-2xl border border-primary-200 bg-white p-3 hover:bg-primary-50 transition-colors"
        >
          <GamePhoto photos={photos} family={family} className="relative size-14 shrink-0 rounded-xl" />
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-semibold text-primary-900 leading-snug line-clamp-2 [overflow-wrap:anywhere]">{name}</span>
            <span className="block text-[14px] text-primary-500 leading-snug">Photos, prices, reviews and other games here</span>
          </span>
          <ChevronRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
        </Link>
      ) : (
        <div className="mt-3 rounded-2xl border border-primary-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="size-11 shrink-0 rounded-xl bg-accent-50 border border-accent-200 grid place-items-center">
              <MapPin className="w-5 h-5 text-accent-700" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold text-primary-900 leading-snug [overflow-wrap:anywhere]">{name}</p>
              {address && <p className="mt-0.5 text-[15px] text-primary-700 leading-relaxed [overflow-wrap:anywhere]">{address}</p>}
              {place && <p className="text-[14px] text-primary-500 leading-snug">{place}</p>}
              <p className="mt-1.5 text-[13px] text-primary-500 leading-snug">Not on TapTurf: the host added this venue and books it.</p>
            </div>
          </div>
          {mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-3 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:bg-primary-50"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Open in Maps
            </a>
          )}
        </div>
      )}
      {href && address && <p className="mt-3 text-[15px] text-primary-700 leading-relaxed">{address}</p>}
      <div className="mt-3 empty:hidden">
        <GameDistance lat={lat} lng={lng} tone="dark" />
      </div>
      {mapSrc && (
        <div className="mt-3 rounded-2xl border border-primary-200 overflow-hidden">
          <GameMap src={mapSrc} openHref={mapHref} />
        </div>
      )}
    </section>
  );
}

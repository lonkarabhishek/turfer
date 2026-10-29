import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { SportFamily } from "@/lib/utils/sport";
import { GameDistance } from "../GameDistance";
import { GameMap } from "../GameMap";
import { GamePhoto } from "./GamePhoto";

/**
 * Where you'll play: the turf (its page has photos, prices, reviews and
 * other games), the full address, how far it is, and the map (behind the
 * cookie choice, as before).
 */
export function GameWhere({
  href,
  name,
  address,
  photos,
  family,
  lat,
  lng,
  mapSrc,
  mapHref,
}: {
  href: string;
  name: string;
  address: string | null | undefined;
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
      {address && <p className="mt-3 text-[15px] text-primary-700 leading-relaxed">{address}</p>}
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

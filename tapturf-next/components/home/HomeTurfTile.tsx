"use client";

import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { HideOnErrorImg } from "@/components/ui/HideOnErrorImg";
import type { HomeTile } from "@/lib/home/types";

const SEP = " · ";

/**
 * One photo tile in the home's top-turfs strip. Markup only; the photo
 * URL arrives already sized. `eager` marks the page's single eager image.
 */
export function HomeTurfTile({ tile, eager = false }: { tile: HomeTile; eager?: boolean }) {
  return (
    <Link href={`/turf/${tile.id}`} className="group block rounded-2xl press-tight focus-neon card-lift">
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-primary-100">
        <MapPin className="absolute inset-0 m-auto w-8 h-8 text-primary-300" aria-hidden />
        {tile.photo && (
          <HideOnErrorImg
            src={tile.photo}
            alt=""
            width={480}
            height={360}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding="async"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
          />
        )}
      </div>
      <p className="mt-2.5 text-[15px] font-semibold text-primary-900 truncate">{tile.name}</p>
      <p className="text-[13px] text-primary-500 truncate">
        {tile.place}
        {tile.sport ? `${SEP}${tile.sport}` : ""}
      </p>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-[13px]">
        {tile.rating > 0 && tile.reviews > 0 ? (
          <span className="inline-flex items-center gap-1 text-primary-900">
            <Star className="w-3.5 h-3.5 fill-current" />
            {tile.rating.toFixed(1)}
            <span className="text-primary-400">({tile.reviews.toLocaleString("en-IN")})</span>
          </span>
        ) : (
          <span />
        )}
        {tile.price && <span className="font-semibold tabular-nums text-primary-900 truncate">{tile.price}</span>}
      </p>
    </Link>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { User } from "lucide-react";
import { PhotoImg } from "@/components/ui/PhotoImg";
import { initialsColor, initialsOf, presetOf, sizedPhotoUrl } from "@/lib/account/avatar";

/**
 * A person's picture, round: their photo, the sports avatar they picked,
 * or the initials of their name on a colour of its own when there is none
 * or the photo fails to load (never a blank circle). `size` is in CSS
 * pixels: it reserves the space (no layout shift) and sizes the request
 * (a Google photo is asked for at about twice that). Decorative by
 * default, since the name is always next to it; pass `alt` where it
 * stands alone. Lazy unless `eager` (the header, the nav).
 */
export function UserAvatar({
  src,
  name,
  size,
  className = "",
  alt = "",
  eager = false,
}: {
  src?: string | null;
  name?: string | null;
  size: number;
  className?: string;
  alt?: string;
  eager?: boolean;
}) {
  // The address that failed, so a new picture is tried again.
  const [broken, setBroken] = useState<string | null>(null);
  const box: CSSProperties = { width: size, height: size };
  if (src && broken !== src) {
    return (
      <PhotoImg
        src={presetOf(src) ? src : sizedPhotoUrl(src, size)}
        alt={alt}
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onBroken={() => setBroken(src)}
        className={`shrink-0 rounded-full object-cover bg-primary-100 ${className}`}
        style={box}
      />
    );
  }
  const letters = initialsOf(name);
  const named = alt ? { role: "img" as const, "aria-label": alt } : { "aria-hidden": true as const };
  return (
    <span
      {...named}
      className={`shrink-0 inline-grid place-items-center rounded-full font-semibold leading-none text-white select-none ${className}`}
      style={{ ...box, backgroundColor: initialsColor(name), fontSize: Math.max(9, Math.round(size * (letters.length > 1 ? 0.38 : 0.44))) }}
    >
      {letters || <User style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.25} aria-hidden />}
    </span>
  );
}

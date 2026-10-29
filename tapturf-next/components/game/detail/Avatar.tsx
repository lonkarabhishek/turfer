"use client";

import { useState } from "react";
import { PhotoImg } from "@/components/ui/PhotoImg";

/**
 * A person's round photo, or the first letter of their name on light
 * green when there is none or it fails to load. Decorative: the name is
 * always next to it. `className` sets the size and the letter's size.
 */
export function Avatar({ src, name, className = "size-8 text-[13px]" }: { src?: string | null; name?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initial = (String(name ?? "").trim()[0] ?? "?").toUpperCase();
  if (src && !broken) {
    return (
      <PhotoImg
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onBroken={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover bg-primary-100 ${className}`}
      />
    );
  }
  return (
    <span aria-hidden="true" className={`shrink-0 rounded-full bg-accent-100 text-accent-800 font-semibold grid place-items-center ${className}`}>
      {initial}
    </span>
  );
}

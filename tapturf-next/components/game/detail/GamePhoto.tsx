"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { imageUrlForCard } from "@/lib/utils/images";
import type { SportFamily } from "@/lib/utils/sport";
import { SportArt } from "./SportArt";

/**
 * A turf photo over its sport drawing, in a box the caller sizes (so
 * nothing moves when it loads). The photo fades in once loaded; a photo
 * that fails gives way to the next one, and after the last, the drawing
 * stays. Google and Drive links go out with no referrer.
 */
export function GamePhoto({
  photos,
  family,
  className = "",
  imgClassName = "",
  eager = false,
  hero = false,
  sizes,
  children,
}: {
  photos: readonly string[] | null | undefined;
  family: SportFamily;
  /** Size, shape and position of the box. */
  className?: string;
  imgClassName?: string;
  /** Load now (the hero, the first cards); otherwise lazily. */
  eager?: boolean;
  /** The page's main photo: high fetch priority and a full-size source for wide screens. */
  hero?: boolean;
  sizes?: string;
  /** Drawn over the photo (chips). */
  children?: React.ReactNode;
}) {
  const list = photos ?? [];
  const [index, setIndex] = useState(0);
  const url = list[index];
  const small = url ? imageUrlForCard(url) : null;
  return (
    <div className={`overflow-hidden bg-accent-100 ${className}`}>
      <SportArt family={family} className="absolute inset-0 w-full h-full" />
      {url && small && (
        <FadeImg
          key={url}
          src={small}
          srcSet={hero && small !== url ? `${small} 800w, ${url} 1600w` : undefined}
          sizes={hero && small !== url ? sizes : undefined}
          eager={eager}
          hero={hero}
          className={`game-photo absolute inset-0 w-full h-full object-cover ${imgClassName}`}
          onBroken={() => setIndex((i) => (list[i] === url ? i + 1 : i))}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The <img>: marked ready (data-ready, which fades it in) when it loads,
 * and reported broken when it fails, including when either happened
 * before hydration (a server-rendered card's photo), which React's
 * onLoad and onError never hear about (see components/ui/PhotoImg.tsx).
 */
function FadeImg({
  src,
  srcSet,
  sizes,
  eager,
  hero,
  className,
  onBroken,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  eager: boolean;
  hero: boolean;
  className: string;
  onBroken: () => void;
}) {
  const [ready, setReady] = useState(false);
  const broken = useRef(onBroken);
  useEffect(() => {
    broken.current = onBroken;
  });
  const check = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) {
      setReady(true);
      return;
    }
    const at = img.getAttribute("src");
    if (!at || typeof img.decode !== "function") return;
    img.decode().then(
      () => setReady(true),
      () => {
        if (img.getAttribute("src") === at) broken.current();
      },
    );
  }, []);
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={check}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt=""
      loading={eager ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      data-ready={ready ? "" : undefined}
      onLoad={() => setReady(true)}
      onError={onBroken}
      className={className}
    />
  );
}

import Image from "next/image";
import logo from "@/public/logo.png";

/**
 * The TapTurf logo (public/logo.png, transparent). next/image serves a
 * resized WebP, so the 1.6 MB master never reaches the browser. The
 * artwork includes the wordmark, so callers don't add text next to it.
 */
export function Logo({
  height = 40,
  className = "",
  priority = false,
}: {
  /** Rendered height in px; width follows the 1071x957 artwork. */
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  const width = Math.round((height * logo.width) / logo.height);
  return (
    <Image
      src={logo}
      alt="TapTurf"
      width={width}
      height={height}
      priority={priority}
      sizes={`${width * 2}px`}
      className={`select-none ${className}`}
      draggable={false}
    />
  );
}

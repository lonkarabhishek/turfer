import { ArrowUpRight } from "lucide-react";
// Relative, so npm run test:badge can render it under plain Node.
import { PREFERRED_SOURCE_ART, PREFERRED_SOURCE_URL } from "../../lib/preferredSource";

/**
 * "Add TapTurf as a preferred source on Google" (lib/preferredSource.ts):
 * a plain link to Google's page for TapTurf, opened in a new tab. Nothing
 * here asks Google for anything until it is tapped: the star is served
 * from tapturf.in, there is no script, and a link to another site is
 * never prefetched. Small and quiet: on the desktop footer (dark), in
 * the menu and at the end of every blog post, never near Call or
 * WhatsApp. No hooks, so server and client components can both use it.
 *
 * The words are the link's name: "Add TapTurf as a" and "preferred
 * source on Google" read as one sentence (the space between them keeps
 * it so for screen readers), then "(opens in a new tab)" for them only.
 */
export function PreferredSourceBadge({
  tone = "light",
  wide = false,
  className = "",
  onClick,
}: {
  /** light: white card on white pages; dark: on the black footer. */
  tone?: "light" | "dark";
  /** Fill the row (the menu sheet) instead of fitting the words. */
  wide?: boolean;
  className?: string;
  /** From a client component only (the menu closes itself). */
  onClick?: () => void;
}) {
  const dark = tone === "dark";
  return (
    <a
      href={PREFERRED_SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-preferred-source=""
      className={`group ${wide ? "flex w-full" : "inline-flex max-w-full"} items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors focus-neon ${
        dark
          ? "border-white/15 bg-white/[0.04] hover:border-white/35 hover:bg-white/[0.08]"
          : "border-primary-200 bg-white hover:border-accent-400 hover:bg-accent-50/40"
      }${className ? ` ${className}` : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a 32px same-origin SVG; next/image adds nothing here. */}
      <img
        src={PREFERRED_SOURCE_ART.src}
        width={PREFERRED_SOURCE_ART.width}
        height={PREFERRED_SOURCE_ART.height}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-8 h-8 shrink-0"
      />
      <span className="min-w-0 flex-1 text-left leading-tight">
        <span className={`block text-[11px] font-medium ${dark ? "text-primary-300" : "text-primary-500"}`}>
          Add TapTurf as a
        </span>{" "}
        <span className={`block text-[13px] font-semibold ${dark ? "text-white" : "text-primary-900"}`}>
          preferred source on Google
        </span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        // Hidden under 360px wide, so the words stay on two lines there.
        className={`w-4 h-4 shrink-0 transition-colors max-[359px]:hidden ${
          dark ? "text-primary-400 group-hover:text-white" : "text-primary-400 group-hover:text-accent-600"
        }`}
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

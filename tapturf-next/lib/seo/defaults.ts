/**
 * Metadata pieces every page shares.
 *
 * Next 16 merges metadata key by key (next/dist/lib/metadata/
 * resolve-metadata.js walks `for key in metadata`): a page's `robots`,
 * `openGraph` or `twitter` replaces the layout's whole object, and
 * `robots: undefined` wipes it. So a page that sets robots passes one of
 * these constants, and a page that sets openGraph passes its images (the
 * default card when it has none of its own) and siteName, with
 * `twitter: TWITTER_CARD` beside it.
 *
 * Pure (type imports only), so node --test runs the modules that use it.
 */
import type { Metadata } from "next";

export const SITE_URL = "https://www.tapturf.in";
export const SITE_NAME = "TapTurf";

/** The share card for pages without a photo of their own (public/og-logo.png, 1200x630). */
export const DEFAULT_OG_IMAGE = {
  url: "https://www.tapturf.in/og-logo.png",
  width: 1200,
  height: 630,
  alt: "TapTurf",
} as const;

/** Indexable, with the large image preview and full-length snippets. */
export const ROBOTS_INDEX = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
} as const satisfies NonNullable<Metadata["robots"]>;

/** Kept out of the index (thin or past pages), links still followed. */
export const ROBOTS_NOINDEX_FOLLOW = {
  index: false,
  follow: true,
  googleBot: { index: false, follow: true },
} as const satisfies NonNullable<Metadata["robots"]>;

/** Large share cards on X and the apps that read twitter:card. */
export const TWITTER_CARD = { card: "summary_large_image" } as const satisfies NonNullable<Metadata["twitter"]>;

/**
 * Live TapTurf player reports a turf needs before its JSON-LD carries an
 * AggregateRating (stars in search). Only first-party reports count
 * (reviews.source null, status live); Google's ratings never do. Never
 * seed, invent or reward reports to reach it.
 */
export const AGGREGATE_RATING_MIN_REPORTS = 5;

/**
 * When the search templates (titles, descriptions, JSON-LD) last
 * changed. The sitemap gives turf, city, sport and blog pages at least
 * this lastmod, so Google fetches every page whose head changed. In the
 * commit that merges the change into main, set it to that moment as a
 * full timestamp with its offset, like "2026-10-28T16:30:00+05:30" (not
 * the day: midnight comes before every crawl that day saw the old head;
 * not without an offset: each machine reads that in its own zone), never
 * a time in the future, and bump it the same way whenever the templates
 * change again. test:seo checks all three.
 */
export const SEO_TEMPLATE_DATE = "2026-10-31T14:45:00+05:30";

/** The openGraph fields every page repeats (a page's openGraph replaces the layout's). */
export const OG_BASE = { siteName: SITE_NAME, locale: "en_IN", type: "website" } as const;

/**
 * Words a title or description must never use: TapTurf takes no
 * booking (players call or WhatsApp the turf), ranks nothing it cannot
 * source, shows no star glyph as if the rating were its own, and does
 * not hurry anyone. Tests run every template through this.
 */
export const BANNED_COPY: readonly RegExp[] = [
  /\bbook(?:ing|ed|s)?\b(?! fee)/i,
  /★/,
  /\b(?:best|top|no\.?\s?1)\b/i,
  /\b(?:hurry|filling fast|slots? (?:are )?filling|today only|limited)\b/i,
  /\bcompare\b/i,
];

/** The first banned phrase in `s`, or null. */
export function bannedCopy(s: string): string | null {
  for (const re of BANNED_COPY) {
    const m = re.exec(s);
    if (m) return m[0];
  }
  return null;
}

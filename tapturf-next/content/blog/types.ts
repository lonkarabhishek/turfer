// Content blocks for a blog post. Kept structured (not raw HTML/MD) so we
// can style them consistently with the rest of TapTurf without pulling in
// a markdown dep + sanitizer. Add new block types here as we need them.

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string; id?: string }
  | { type: "h3"; text: string; id?: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; by?: string }
  | { type: "callout"; title: string; text: string }
  | { type: "cta"; text: string; href: string; label: string }
  // Linked turf callout. Renders as a card, cross-links to /turf/[id].
  | {
      type: "turf";
      rank?: number;
      id: string;
      name: string;
      area: string;
      rating?: string | number;
      reviews?: number;
      note?: string;
    }
  // NEW: A grid of small stat tiles for at-a-glance stats.
  // Rendered as a responsive 2-4 column card row.
  | { type: "stat-grid"; items: { value: string; label: string; hint?: string }[] }
  // NEW: Comparison / feature table. Rows are strings so the writer
  // can drop in "✓", "—", "₹500" etc.
  | {
      type: "table";
      caption?: string;
      columns: string[];
      rows: (string | number)[][];
    }
  // NEW: FAQ block. Renders as accessible <details> accordion AND emits
  // FAQPage JSON-LD from the same source.
  | { type: "faq"; items: { q: string; a: string }[] }
  // NEW: A row of real turf cards — resolves each ID against the shared
  // turf snapshot (content/blog/data/turfs.ts) at render time so the
  // author only writes IDs. Photos come from the real turf cover.
  | { type: "related-turfs"; title?: string; ids: string[] }
  // NEW: Interactive per-player price calculator (client component).
  // Used in the Pune pricing article — venues rarely publish exact
  // prices, so the value is helping people split their own.
  | {
      type: "price-calc";
      defaults?: { pricePerHour?: number; players?: number; hours?: number };
      caption?: string;
    }
  // NEW: Full-width image with alt (uses next/image, lazy).
  | { type: "image"; src: string; alt: string; caption?: string };

export type PostCategory =
  | "Best Turfs"
  | "Guides"
  | "Rules"
  | "Playbook"
  | "Nashik"
  | "Pune"
  | "Mumbai";

export type PostCity = "nashik" | "pune" | "mumbai" | null;

export interface Post {
  slug: string;
  title: string;
  description: string; // SEO meta description + card subtitle
  hook: string;        // one-line hook for the listing card
  category: PostCategory;
  city: PostCity;
  readMinutes: number;
  publishedAt: string; // YYYY-MM-DD
  updatedAt?: string;
  coverEmoji: string;  // fallback + card accent
  /** Optional hero photo (used on the article page + OG image). */
  heroImage?: { url: string; alt: string; credit?: string };
  keywords: string[];
  blocks: Block[];
  /** Optional pinned CTA for the sticky mobile bar. */
  cta?: { href: string; label: string };
}

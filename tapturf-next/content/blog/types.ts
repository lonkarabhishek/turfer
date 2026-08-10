// Content blocks for a blog post. Kept structured (not raw HTML/MD) so we
// can style them consistently with the rest of TapTurf without pulling in
// a markdown dep + sanitizer. Add new block types here as we need them.

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
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
    };

export type PostCategory =
  | "Best Turfs"
  | "Guides"
  | "Rules"
  | "Playbook"
  | "Nashik"
  | "Pune";

export type PostCity = "nashik" | "pune" | null;

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
  coverEmoji: string;  // used as visual accent on the card + hero
  keywords: string[];
  blocks: Block[];
}

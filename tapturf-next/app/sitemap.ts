import type { MetadataRoute } from "next";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { ALL_POSTS } from "@/content/blog";
import { SPORT_PAGES, turfPlaysSport } from "@/lib/sports";
import { CITIES } from "@/lib/city";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";

// Sitemap was being served with age ~8.8 days from the Vercel cache
// even though DB rows changed within the hour. Cap it to an hour so
// Googlebot always sees fresh lastmod, and let the future revalidate
// webhook (P0-2) blow it away sooner on writes.
export const revalidate = 3600;

const BASE = "https://www.tapturf.in";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createReadOnlyClient();

  const [{ data: turfs }, { data: games }] = await Promise.all([
    supabase.from("turfs").select("id, updated_at, city, sports").eq("is_active", true),
    supabase
      .from("games")
      .select("id, updated_at, date, start_time, status")
      .in("status", ["open", "upcoming", "active"]),
  ]);

  const sports = SPORT_PAGES.map((sp) => sp.slug);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE}/turfs`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/games`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    // City landing pages — key for local SEO
    {
      url: `${BASE}/nashik`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/pune`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/mumbai`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Blog posts - static content, high SEO value for topical authority.
  const blogPages: MetadataRoute.Sitemap = ALL_POSTS.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt || p.publishedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const sportPages: MetadataRoute.Sitemap = sports.map((sport) => ({
    url: `${BASE}/sport/${sport}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // "<sport> turfs in <city>" pages, only where there are enough turfs
  // to be indexable (same threshold the page uses for noindex).
  const splitSports = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : [])
      .flatMap((x) => (typeof x === "string" ? x.split(",") : []))
      .map((x) => x.trim())
      .filter(Boolean);
  const citySportPages: MetadataRoute.Sitemap = CITIES.flatMap((c) =>
    SPORT_PAGES.filter(
      (sp) =>
        (turfs ?? []).filter((t) => t.city === c.id && turfPlaysSport(splitSports(t.sports), sp)).length >=
        MIN_TURFS_TO_INDEX,
    ).map((sp) => ({
      url: `${BASE}/${c.id}/${sp.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: sp.slug === "football" || sp.slug === "box-cricket" ? 0.9 : 0.8,
    })),
  );

  const turfPages: MetadataRoute.Sitemap = (turfs ?? []).map((turf) => ({
    url: `${BASE}/turf/${turf.id}`,
    lastModified: turf.updated_at ? new Date(turf.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Only future games — expired ones aren't valuable in Google's index.
  const now = new Date();
  const gamePages: MetadataRoute.Sitemap = (games ?? [])
    .filter((g) => {
      if (!g.date || !g.start_time) return false;
      return new Date(`${g.date}T${g.start_time}`).getTime() > now.getTime();
    })
    .map((g) => ({
      url: `${BASE}/game/${g.id}`,
      lastModified: g.updated_at ? new Date(g.updated_at) : new Date(),
      changeFrequency: "hourly",
      priority: 0.6,
    }));

  return [
    ...staticPages,
    ...blogPages,
    ...sportPages,
    ...citySportPages,
    ...turfPages,
    ...gamePages,
  ];
}

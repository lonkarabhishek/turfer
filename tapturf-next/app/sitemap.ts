import type { MetadataRoute } from "next";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { ALL_POSTS } from "@/content/blog";
import { SPORT_PAGES, turfPlaysSport } from "@/lib/sports";
import { getLiveCities } from "@/lib/queries/cities";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";
import { TOOLS } from "@/lib/tools/registry";
import { fetchAllRows } from "@/lib/queries/turfs";
import { isGameExpired } from "@/lib/utils/game";
import { turfPath } from "@/lib/utils/turfPath";
import { PRIVACY_UPDATED } from "@/lib/policy";
import { SEO_TEMPLATE_DATE } from "@/lib/seo/defaults";

// Sitemap was being served with age ~8.8 days from the Vercel cache
// even though DB rows changed within the hour. Cap it to an hour so
// Googlebot always sees fresh lastmod, and let the future revalidate
// webhook (P0-2) blow it away sooner on writes.
export const revalidate = 3600;

const BASE = "https://www.tapturf.in";

/**
 * The newest of the given timestamps and the day the search templates
 * last changed (SEO_TEMPLATE_DATE): a page's title, description and
 * markup changing is a real change, and the date tells Google to fetch
 * it again. Unknown or unparsable dates are skipped.
 */
function latest(dates: (string | null | undefined)[]): Date {
  let best = new Date(SEO_TEMPLATE_DATE).getTime();
  for (const d of dates) {
    const t = d ? new Date(d).getTime() : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return new Date(best);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createReadOnlyClient();

  const [turfs, { data: games }] = await Promise.all([
    fetchAllRows<{ id: string; slug: string | null; updated_at: string | null; city: string | null; sports: unknown }>((from, to) =>
      supabase.from("turfs").select("id, slug, updated_at, city, sports").eq("is_active", true).order("id").range(from, to),
    ),
    supabase
      .from("games")
      .select("id, updated_at, date, start_time, status")
      .in("status", ["open", "upcoming", "active"]),
  ]);

  // Every city with active turfs, from the database.
  const liveCities = await getLiveCities();

  // A lastmod only where a date says when the page last changed: the
  // time of this regeneration (new Date()) told Google every hour that
  // they all had. / and /games change as games expire and picks move,
  // which nothing dates, so they carry none (lastmod is optional).
  const newestTurf = latest((turfs ?? []).map((t) => t.updated_at));
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE}/turfs`,
      lastModified: newestTurf,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/turf-near-me`,
      lastModified: newestTurf,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/games`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    // City landing pages, one per live city (biggest first). Key for local SEO.
    // As new as their newest turf, not the time of the fetch.
    ...liveCities.map((c) => ({
      url: `${BASE}/${c.id}`,
      lastModified: latest((turfs ?? []).filter((t) => t.city === c.id).map((t) => t.updated_at)),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    {
      url: `${BASE}/privacy`,
      lastModified: new Date(PRIVACY_UPDATED),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${BASE}/terms`,
      lastModified: new Date("2026-10-21"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${BASE}/blog`,
      // As new as its newest post.
      lastModified: latest(ALL_POSTS.map((p) => p.updatedAt || p.publishedAt)),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // Free sports tools: the hub (as new as its newest tool) and one page per tool.
    {
      url: `${BASE}/tools`,
      lastModified: new Date(TOOLS.map((t) => t.updated).sort().at(-1) ?? "2026-10-11"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...TOOLS.map((t) => ({
      url: `${BASE}/tools/${t.slug}`,
      lastModified: new Date(t.updated),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // Blog posts - static content, high SEO value for topical authority.
  const blogPages: MetadataRoute.Sitemap = ALL_POSTS.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: latest([p.updatedAt || p.publishedAt]),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const splitSports = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : [])
      .flatMap((x) => (typeof x === "string" ? x.split(",") : []))
      .map((x) => x.trim())
      .filter(Boolean);

  // Sport pages with at least one venue: one with none is an empty page.
  const sportPages: MetadataRoute.Sitemap = SPORT_PAGES.filter((sp) =>
    (turfs ?? []).some((t) => turfPlaysSport(splitSports(t.sports), sp)),
  ).map((sp) => ({
    url: `${BASE}/sport/${sp.slug}`,
    lastModified: latest((turfs ?? []).filter((t) => turfPlaysSport(splitSports(t.sports), sp)).map((t) => t.updated_at)),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // "<sport> turfs in <city>" pages, only where there are enough turfs
  // to be indexable (same threshold the page uses for noindex).
  const citySportPages: MetadataRoute.Sitemap = liveCities.flatMap((c) =>
    SPORT_PAGES.flatMap((sp) => {
      const here = (turfs ?? []).filter((t) => t.city === c.id && turfPlaysSport(splitSports(t.sports), sp));
      return here.length >= MIN_TURFS_TO_INDEX ? [{ sp, here }] : [];
    }).map(({ sp, here }) => ({
      url: `${BASE}/${c.id}/${sp.slug}`,
      lastModified: latest(here.map((t) => t.updated_at)),
      changeFrequency: "daily" as const,
      priority: sp.slug === "football" || sp.slug === "box-cricket" ? 0.9 : 0.8,
    })),
  );

  const turfPages: MetadataRoute.Sitemap = (turfs ?? []).map((turf) => ({
    url: `${BASE}${turfPath(turf)}`,
    // The row's last edit, or the day the turf templates changed if later.
    lastModified: latest([turf.updated_at]),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Only games still to come (India time); past ones are noindex.
  const gamePages: MetadataRoute.Sitemap = (games ?? [])
    .filter((g) => !!g.date && !!g.start_time && !isGameExpired(g))
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

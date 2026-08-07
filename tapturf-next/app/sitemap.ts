import type { MetadataRoute } from "next";
import { createReadOnlyClient } from "@/lib/supabase/server";

const BASE = "https://www.tapturf.in";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createReadOnlyClient();

  const [{ data: turfs }, { data: games }] = await Promise.all([
    supabase.from("turfs").select("id, updated_at").eq("is_active", true),
    supabase
      .from("games")
      .select("id, updated_at, date, start_time, status")
      .in("status", ["open", "upcoming", "active"]),
  ]);

  const sports = [
    "football",
    "cricket",
    "basketball",
    "badminton",
    "tennis",
    "pickleball",
  ];

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
  ];

  const sportPages: MetadataRoute.Sitemap = sports.map((sport) => ({
    url: `${BASE}/sport/${sport}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.8,
  }));

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

  return [...staticPages, ...sportPages, ...turfPages, ...gamePages];
}

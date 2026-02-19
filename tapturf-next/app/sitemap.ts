import type { MetadataRoute } from "next";
import { createServerClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const { data: turfs } = await supabase
    .from("turfs")
    .select("id, updated_at")
    .eq("is_active", true);

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
      url: "https://www.tapturf.in",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: "https://www.tapturf.in/turfs",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const sportPages: MetadataRoute.Sitemap = sports.map((sport) => ({
    url: `https://www.tapturf.in/sport/${sport}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const turfPages: MetadataRoute.Sitemap = (turfs ?? []).map((turf) => ({
    url: `https://www.tapturf.in/turf/${turf.id}`,
    lastModified: turf.updated_at ? new Date(turf.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  return [...staticPages, ...sportPages, ...turfPages];
}

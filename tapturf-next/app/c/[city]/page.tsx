import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";
import { getLiveCities } from "@/lib/queries/cities";
import { setListScope } from "@/lib/queries/listScope";

// The home for one city (proxy rewrite of /). Same window as app/page.tsx:
// an hour, since it shows open games; its city's list posts
// (turf-data:<city>) and the games key mark it stale sooner. Other
// cities' rows on it (the folded "Turfs in other cities": names and
// counts, no prices) can be up to the hour old.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  setListScope((await params).city);
  const [home, live] = await Promise.all([getHomeData(), getLiveCities()]);
  return homeMetadata(home, live.length);
}

export default async function CityHomePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  setListScope(city);
  return <HomeView requested={city} />;
}

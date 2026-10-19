import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";
import { getLiveCities } from "@/lib/queries/cities";

// The home for one city (proxy rewrite of /). Same window as app/page.tsx.
export const revalidate = 600;
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  const [home, live] = await Promise.all([getHomeData(), getLiveCities()]);
  return homeMetadata(home, live.length);
}

export default async function CityHomePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <HomeView requested={city} />;
}

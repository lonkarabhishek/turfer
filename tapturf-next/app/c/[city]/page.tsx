import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";

// The home for one city (proxy rewrite of /). Same window as app/page.tsx.
export const revalidate = 600;
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  return homeMetadata(await getHomeData());
}

export default async function CityHomePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <HomeView requested={city} />;
}

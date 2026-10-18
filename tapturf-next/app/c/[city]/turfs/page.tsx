import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";

// /turfs for one city (proxy rewrite). Same window as app/turfs/page.tsx.
export const revalidate = 600;
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  return turfsMetadata();
}

export default async function CityTurfsPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <TurfsView requested={city} />;
}

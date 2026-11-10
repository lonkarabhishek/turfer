import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";
import { setListScope } from "@/lib/queries/listScope";

// /turfs for one city (proxy rewrite). A day: its city's list posts
// (turf-data:<city>) mark it stale, so its turfs and prices follow the
// database within the list gap; the other cities' counts below it can be
// up to the day old.
export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  setListScope((await params).city);
  return turfsMetadata();
}

export default async function CityTurfsPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  setListScope(city);
  return <TurfsView requested={city} />;
}

import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";
import { getLiveCities } from "@/lib/queries/cities";
import { setListScope } from "@/lib/queries/listScope";
import { INDIA } from "@/lib/cache/listTags";

// Same window as HOME_REVALIDATE in lib/home/data.ts (Next needs a literal
// here): an hour, since it shows open games; any list post (turf-data:india)
// and the games key mark it stale sooner.
export const revalidate = 3600;

// The all-India home: what crawlers get. A visitor with a picked city is
// rewritten by proxy.ts to app/c/[city], which renders the same view for
// that city with the same metadata and canonical; anyone else is asked
// for their city first (app/c/pick).
export async function generateMetadata(): Promise<Metadata> {
  setListScope(INDIA);
  const [home, live] = await Promise.all([getHomeData(), getLiveCities()]);
  return homeMetadata(home, live.length);
}

export default function HomePage() {
  setListScope(INDIA);
  return <HomeView requested={null} />;
}

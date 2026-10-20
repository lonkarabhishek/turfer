import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";
import { getLiveCities } from "@/lib/queries/cities";

// Same window as HOME_REVALIDATE in lib/home/data.ts (Next needs a literal here).
export const revalidate = 600;

// The all-India home: what crawlers get. A visitor with a picked city is
// rewritten by proxy.ts to app/c/[city], which renders the same view for
// that city with the same metadata and canonical; anyone else is asked
// for their city first (app/c/pick).
export async function generateMetadata(): Promise<Metadata> {
  const [home, live] = await Promise.all([getHomeData(), getLiveCities()]);
  return homeMetadata(home, live.length);
}

export default function HomePage() {
  return <HomeView requested={null} />;
}

import type { Metadata } from "next";
import { getHomeData } from "@/lib/home/data";
import { homeMetadata } from "@/lib/seo/pageMetadata";
import { HomeView } from "@/components/home/HomeView";

// Never read the request (its cookies, headers or query) under app/c:
// it turns these ISR pages dynamic.
//
// The all-India home plus the first-visit city ask. proxy.ts rewrites /
// here only for a human whose city is unknown, so crawlers and "all of
// India" visitors (app/page.tsx) never get the ask's markup. Same
// window, metadata and canonical as app/page.tsx; direct hits on /c 308.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return homeMetadata(await getHomeData());
}

export default function AskHomePage() {
  return <HomeView requested={null} ask />;
}

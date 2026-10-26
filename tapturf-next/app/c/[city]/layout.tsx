import { notFound } from "next/navigation";
import { CITY_IDS, isCitySlug, isKnownCity } from "@/lib/city";
import { getLiveCities, isLiveCity } from "@/lib/queries/cities";

// Never call cookies(), headers() or read searchParams under app/c. It turns every city twin dynamic.
//
// Internal per-city twins of /, /turfs and /games. proxy.ts rewrites a
// visitor with a city to /c/<city>, /c/<city>/turfs or /c/<city>/games;
// the browser URL, metadata and canonical stay the public ones. Direct
// hits on /c are 308'd to the public URL by the proxy, and nothing links
// here. Revalidated like its public twin.
//
// Production builds render one page per curated or live city up front;
// previews and local builds render none (each renders on its first
// visit), so a preview no longer renders about 260 pages against the
// production database. A city the data team adds after a deploy renders
// on its first visit. The pages must not set dynamicParams = false: Next
// takes params on demand only when no segment of the route does.
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const live = await getLiveCities().catch(() => []);
  return [...new Set([...CITY_IDS, ...live.map((c) => c.id)])].map((city) => ({ city }));
}

// A confirmed pick is any city slug (lib/city.ts parseCityCookie), so a
// hand-edited cookie or a city that lost its last turf lands here too: a
// cheap 404 before any view renders, so such slugs never fill the ISR
// cache with full pages (CitySync then forgets the cookie). A curated
// city keeps its page with no turfs ("No turfs in X yet"); the live
// check is the hourly cached list, so no extra read.
export default async function CityVariantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  if (!isCitySlug(city) || (!isKnownCity(city) && !(await isLiveCity(city)))) notFound();
  return children;
}

import { notFound } from "next/navigation";
import { isCitySlug, isKnownCity } from "@/lib/city";
import { getLiveCities, isLiveCity } from "@/lib/queries/cities";
import { setListScope } from "@/lib/queries/listScope";
import { prerenderedTwinCities } from "@/lib/build/reads";
import { MIN_TURFS_TO_INDEX } from "@/lib/sportCity";

// Never call cookies(), headers() or read searchParams under app/c. It turns every city twin dynamic.
//
// Internal per-city twins of /, /turfs and /games. proxy.ts rewrites a
// visitor with a city to /c/<city>, /c/<city>/turfs or /c/<city>/games;
// the browser URL, metadata and canonical stay the public ones. Direct
// hits on /c are 308'd to the public URL by the proxy, and nothing links
// here. Revalidated like its public twin, and purged by its own city's
// list posts (turf-data:<city>, lib/queries/listScope.ts) and the games key.
//
// Production builds render the twins of every live city with at least
// MIN_TURFS_TO_INDEX active turfs (lib/build/reads.ts prerenderedTwinCities;
// until 10 Nov every curated and live city, about 670 pages and 425 MB of
// each deployment). Every other city, and one the data team adds after a
// deploy, renders on its first visit. Previews and local builds render
// none, so a preview never renders about 260 pages against the production
// database. No search effect: crawlers never get a twin. The pages must not
// set dynamicParams = false: Next takes params on demand only when no
// segment of the route does.
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const live = await getLiveCities().catch(() => []);
  return prerenderedTwinCities(live, MIN_TURFS_TO_INDEX).map((city) => ({ city }));
}

// A confirmed pick is any city slug (lib/city.ts parseCityCookie), so a
// hand-edited cookie or a city that lost its last turf lands here too: a
// cheap 404 before any view renders, so such slugs never fill the ISR
// cache with full pages (CitySync then forgets the cookie). A curated
// city keeps its page with no turfs ("No turfs in X yet"); the live
// check reads the counts once per render, as the page does.
export default async function CityVariantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  setListScope(city);
  if (!isCitySlug(city) || (!isKnownCity(city) && !(await isLiveCity(city)))) notFound();
  return children;
}

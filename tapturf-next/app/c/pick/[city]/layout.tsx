import { CITY_IDS } from "@/lib/city";
import { PICK_GUARD_JS, PICK_NONE } from "@/lib/cityRouting";

// Never call cookies(), headers() or read searchParams under app/c.
//
// The city-first pick screen ("Where do you play?"). proxy.ts rewrites
// /, /turfs and /games here for every human whose city is not confirmed
// (no cookie, an IP guess, unknown, the old "all"): /c/pick/<detected
// city>, or /c/pick/none when the IP gave nothing away. The browser URL,
// title and canonical stay the public ones; direct hits on /c 308.
// Static, one page per variant, served from the CDN: no turf data. The
// only read in the tree is the cached live city list (unstable_cache,
// 1 h), which the root layout's footer and the chip order (pickTop in
// ../meta.ts) share, so Next refreshes these pages hourly from that
// cache, never per request.
export const dynamicParams = false;

export function generateStaticParams() {
  return [...CITY_IDS, PICK_NONE].map((city) => ({ city }));
}

// The guard script runs before the screen paints and reloads once when
// the cookie already holds a confirmed pick (see PICK_GUARD_JS). React
// never runs it on a client navigation, only on a full page load.
export default function PickLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PICK_GUARD_JS }} />
      {children}
    </>
  );
}

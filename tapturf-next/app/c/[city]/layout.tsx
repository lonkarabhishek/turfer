import { CITY_IDS } from "@/lib/city";

// Never call cookies(), headers() or read searchParams under app/c. It turns 162 ISR pages dynamic.
//
// Internal per-city twins of /, /turfs and /games. proxy.ts rewrites a
// visitor with a city to /c/<city>, /c/<city>/turfs or /c/<city>/games;
// the browser URL, metadata and canonical stay the public ones. Direct
// hits on /c are 308'd to the public URL by the proxy, and nothing links
// here. One static page per curated city, revalidated like its public
// twin; any other id 404s without rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return CITY_IDS.map((city) => ({ city }));
}

export default function CityVariantLayout({ children }: { children: React.ReactNode }) {
  return children;
}

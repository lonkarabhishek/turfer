import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";
import { setListScope } from "@/lib/queries/listScope";
import { INDIA } from "@/lib/cache/listTags";

// A day: every list post (turf-data:india) marks it stale, so its turfs,
// prices and counts follow the database within the list gap.
export const revalidate = 86400;

// The all-India listing: what crawlers and every /turfs?q= search get. A
// visitor with a picked city is rewritten by proxy.ts to
// app/c/[city]/turfs (same metadata and canonical); anyone else is asked
// for their city first (app/c/pick/[city]/turfs).
export async function generateMetadata(): Promise<Metadata> {
  setListScope(INDIA);
  return turfsMetadata();
}

export default function TurfsPage() {
  setListScope(INDIA);
  return <TurfsView requested={null} />;
}

import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";

export const revalidate = 600;

// The all-India listing: what crawlers, "all of India", unknown visitors
// and every /turfs?q= search get. A visitor with a city is rewritten by
// proxy.ts to app/c/[city]/turfs (same metadata and canonical).
export async function generateMetadata(): Promise<Metadata> {
  return turfsMetadata();
}

export default function TurfsPage() {
  return <TurfsView requested={null} />;
}

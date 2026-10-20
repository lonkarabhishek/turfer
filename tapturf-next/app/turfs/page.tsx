import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";

export const revalidate = 600;

// The all-India listing: what crawlers and every /turfs?q= search get. A
// visitor with a picked city is rewritten by proxy.ts to
// app/c/[city]/turfs (same metadata and canonical); anyone else is asked
// for their city first (app/c/pick/[city]/turfs).
export async function generateMetadata(): Promise<Metadata> {
  return turfsMetadata();
}

export default function TurfsPage() {
  return <TurfsView requested={null} />;
}

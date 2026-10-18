import type { Metadata } from "next";
import { turfsMetadata } from "@/lib/seo/pageMetadata";
import { TurfsView } from "@/components/search/TurfsView";

// The all-India /turfs plus the first-visit city ask, for humans whose
// city is unknown (proxy rewrite). Same window, metadata and canonical
// as app/turfs/page.tsx. Never read the request here.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  return turfsMetadata();
}

export default function AskTurfsPage() {
  return <TurfsView requested={null} ask />;
}

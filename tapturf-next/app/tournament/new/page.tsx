import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TournamentCreate } from "@/components/tournament/TournamentCreate";

// Setting up a live tournament. Kept out of search: the Cricket Tournament
// Manager (/tools/cricket-tournament-scorer) is the page people find, and
// it links here. Not in the sitemap.
export const metadata: Metadata = {
  title: "Start a live tournament",
  description: "Set up a cricket tournament in a minute and share one link: fixtures made for you, a points table with NRR, playoffs and every match scored live.",
  robots: { index: false, follow: true },
};

export default function NewTournamentPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-5 md:py-10">
      <nav aria-label="Breadcrumb" className="text-[13px] text-primary-500 mb-3 flex items-center gap-1">
        <Link href="/tools" className="hover:text-primary-900">
          Tools
        </Link>
        <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        <Link href="/tools/cricket-tournament-scorer" className="hover:text-primary-900 truncate">
          Tournament Manager
        </Link>
      </nav>
      <header className="mb-5">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-accent-600">Live tournament</p>
        <h1 className="font-display tracking-tight text-primary-900 text-3xl sm:text-4xl leading-[1.05] mt-1">Start a live tournament</h1>
        <p className="mt-2 text-[16px] text-primary-600 leading-relaxed">One link for everyone: the points table, the fixtures, the playoffs and every match you score live. Free, and nobody needs an app.</p>
      </header>
      <TournamentCreate />
    </article>
  );
}

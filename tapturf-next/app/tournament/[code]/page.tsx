import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentFollow } from "@/components/tournament/TournamentFollow";
import { verifyTournamentCode } from "@/lib/tournament/codes";
import { tournamentKey, tournamentViewForPage } from "@/lib/tournament/server";
import { formatLabel } from "@/lib/tournament/standings";
import type { TournamentGetResponse } from "@/lib/tournament/types";

// A live tournament's page. Each open is one function call; the data comes
// from the cached read (lib/tournament/server.ts), so a page view is not a
// database read. User-made: never indexed, never in the sitemap, and never
// generateStaticParams here.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

// Every variant stays out of search; its links are still followed.
const ROBOTS = { index: false, follow: true };

const known = (code: string) => verifyTournamentCode(code, tournamentKey());

/** null: no such tournament; "unavailable": it could not be read just now. */
async function load(code: string): Promise<TournamentGetResponse | null | "unavailable"> {
  try {
    return await tournamentViewForPage(code);
  } catch (e) {
    console.warn("tournament page: read failed", code, e);
    return "unavailable";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  if (!known(code)) return { title: "Tournament not found", robots: ROBOTS };
  const data = await load(code);
  if (data === "unavailable") return { title: "Tournament", robots: ROBOTS };
  if (!data) return { title: "Tournament not found", robots: ROBOTS };
  const t = data.tournament;
  if (t.status === "removed") return { title: "Tournament taken down", robots: ROBOTS };
  // The layout's template adds " | TapTurf".
  const description = `${formatLabel(t.settings)}, ${t.teams.length} teams${t.settings.venue ? ` at ${t.settings.venue.name}` : ""}: the points table, fixtures, results and live scores.`;
  return {
    title: t.name,
    description,
    robots: ROBOTS,
    openGraph: {
      title: `${t.name} | TapTurf`,
      description,
      url: `/tournament/${code}`,
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
      images: [{ url: "/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
    },
  };
}

export default async function TournamentPage({ params }: Props) {
  const { code } = await params;
  if (!known(code)) notFound();
  const data = await load(code);
  if (data === null) notFound();
  if (data === "unavailable") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-primary-900 mb-2">The tournament will be back in a moment</h1>
        <p className="text-primary-600">We could not load it just now. Pull down to refresh, or try again in a minute.</p>
      </div>
    );
  }
  return <TournamentFollow key={code} code={code} initial={data} />;
}

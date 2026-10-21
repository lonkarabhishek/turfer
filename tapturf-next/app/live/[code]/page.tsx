import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { LiveFollow } from "@/components/live/LiveFollow";
import { derive } from "@/lib/cricket/scoring";
import { deriveBoard } from "@/lib/board";
import { verifyLiveCode } from "@/lib/live/codes";
import { isLiveBoard, sanitizeLive, type LiveMatch } from "@/lib/live/match";
import { getLiveForPage, liveWriteKey } from "@/lib/live/server";
import type { LiveGetResponse } from "@/lib/live/types";

// Each open is one function call; the data comes from the cached getter
// (lib/live/server.ts), so a page view is not a database read. Never add
// generateStaticParams here.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

// Every variant stays out of search; its links are still followed.
const ROBOTS = { index: false, follow: true };

/** The tag check, before any cache or database lookup: a made-up code stops here. */
function known(code: string): boolean {
  const key = liveWriteKey();
  return !!key && verifyLiveCode(code, key);
}

type Loaded = {
  /** As GET /api/live/<code> serves it, so the first paint and the polls agree. */
  initial: LiveGetResponse | null;
  match: LiveMatch | null;
  /** The server's clock after the read, so the follower's "Updated 20 s ago" does not depend on the phone's. */
  at: number;
};

/**
 * One read per render, shared by the metadata and the page. initial is
 * null when the database could not be read: the page then says the score
 * will be back and keeps polling, never a 404.
 */
const load = cache(async (code: string): Promise<Loaded> => {
  try {
    const row = await getLiveForPage(code);
    if (!row) return { initial: { status: "waiting", match: null, rev: 0, updatedAt: null }, match: null, at: Date.now() };
    const match = row.match == null ? null : sanitizeLive(row.match);
    return { initial: { status: row.status, match, rev: row.rev, updatedAt: row.updated_at }, match, at: Date.now() };
  } catch (e) {
    console.warn("live page: read failed", code, e);
    return { initial: null, match: null, at: Date.now() };
  }
});

// No match to read the sport from: the link may be the Live Scoreboard's, so nothing here says cricket.
const PLAIN_TITLE: Record<LiveGetResponse["status"], string> = {
  waiting: "Live score",
  live: "Live score",
  done: "Final score",
  stopped: "Live link turned off",
  expired: "Live link expired",
};

/** Title and description for the link preview: "Football: Red FC vs Blue FC live score", the headline under it. */
function describe(match: LiveMatch): { title: string; description: string } {
  if (isLiveBoard(match)) {
    const v = deriveBoard(match);
    // "Other sport" with no name typed has nothing to say there ("Game: A vs B" reads oddly).
    const sport = v.sport === "other" && !(v.setup.rules as { name?: string }).name ? "" : `${v.sportName}: `;
    return { title: `${sport}${v.teams.a.name} vs ${v.teams.b.name} live score`, description: v.headline };
  }
  const v = derive(match);
  return { title: `${v.setup.teamA} vs ${v.setup.teamB} live score`, description: v.headline };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  if (!known(code)) return { title: "Live score not found", robots: ROBOTS };
  const data = await load(code);
  if (!data.match) return { title: data.initial ? PLAIN_TITLE[data.initial.status] : "Live score", robots: ROBOTS };
  // The layout's template adds " | TapTurf".
  const { title, description } = describe(data.match);
  return {
    title,
    description,
    robots: ROBOTS,
    openGraph: {
      title: `${title} | TapTurf`,
      description,
      url: `/live/${code}`,
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
      images: [{ url: "/og-logo.png", width: 1200, height: 630, alt: "TapTurf" }],
    },
  };
}

export default async function LiveMatchPage({ params }: Props) {
  const { code } = await params;
  if (!known(code)) notFound();
  const { initial, at } = await load(code);
  return <LiveFollow key={code} code={code} initial={initial} serverNow={at} />;
}

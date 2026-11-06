import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { TurfSession } from "@/components/tools/TurfSession";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";

const tool = toolBySlug("turf-session")!;
const URL = `${TOOLS_BASE}/${tool.slug}`;
// A session's live link is a live tournament, which needs the server's write key. The page is static, so this is
// read at build; without the key the session hides the live link and this page does not mention it.
const LIVE_LINKS = Boolean(process.env.LIVE_WRITE_KEY);

// Built like the Live Cricket Scorer's page (plain metadata from the registry, for the site owner's approval).
export const metadata: Metadata = {
  title: { absolute: tool.title },
  description: tool.description,
  alternates: { canonical: URL },
  robots: ROBOTS_INDEX,
  openGraph: { ...OG_BASE, title: tool.title, description: tool.description, url: URL, images: [DEFAULT_OG_IMAGE] },
  twitter: TWITTER_CARD,
};

const FAQ = [
  {
    q: "Do we have to name the players?",
    a: "No. Just tap the runs: batters and bowlers go in as Batter 1 and Bowler 1. Add names in setup, or tap a name on the scorecard later, to see the top run scorers and wicket takers.",
  },
  {
    q: "What if we forgot to score a match?",
    a: "Tap Enter the final score and type each side's runs and wickets. It counts in the session result like any other match.",
  },
  {
    q: "Is it saved if my phone locks?",
    a: "Every ball is saved on your phone as you score, and the screen stays on while the scorer is open where your phone allows it. Open the page again and the match carries on.",
  },
  {
    q: "Can friends follow the session?",
    a: LIVE_LINKS
      ? "Tap Share a live link and send it to the group. They see the running result and every match, with no app or login. Started from a game on TapTurf, the result also shows on the game page."
      : "When you're done, share the summary picture or text on WhatsApp.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Playing a few short matches in one turf slot? Keep every match's score and the running result, Team A 3 - 2 Team B, on one phone. Score ball by ball, or just type the final score."
      explainer={[
        {
          title: "One phone, the whole slot",
          body: (
            <>
              <p>
                Type the two team names, pick the overs a match and tap Start match 1. When a match ends, Next match starts the next one straight away, with the other side batting first, and the running result goes on top: Titans lead 2-0, All square 3-3.
              </p>
              <p>
                Teams changed halfway through the slot? Rename them or move players across between matches; every result stays with the side that won it. Played from a game on TapTurf, the teams, format and venue are filled in from the game.
              </p>
            </>
          ),
        },
        {
          title: "Ball by ball or just the final score",
          body: (
            <>
              <p>
                Each match is scored on the{" "}
                <Link href="/tools/cricket-live-scorer" className="text-accent-700 font-semibold hover:underline">
                  Live Cricket Scorer
                </Link>
                &rsquo;s big buttons: dot, 1, 2, 3, 4, 6, wide, no-ball, wicket and undo, with the same house rules. Leave player names out and it picks the batters and bowlers for you, so a ball is one tap.
              </p>
              <p>Nobody scored a match? Type each side&rsquo;s runs and wickets in a few seconds and it counts like the rest.</p>
            </>
          ),
        },
        {
          title: "Share the result",
          body: (
            <>
              <p>End the session for a summary of every match, the result, and the top run scorers and wicket takers when players were named. Share it as a picture or as text on WhatsApp.</p>
              {LIVE_LINKS ? (
                <p>
                  Want the group to follow along? Share a live link: one page with the running result and every match, no app needed. Only the team names and results go on it; player names stay on your phone. The{" "}
                  <Link href="/privacy#live-tournaments" className="text-accent-700 font-semibold hover:underline">
                    privacy policy
                  </Link>{" "}
                  says more.
                </p>
              ) : (
                <p>Everything stays on the phone you scored on; nothing is uploaded and no account is needed.</p>
              )}
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <TurfSession cta={tool.cta} liveLinks={LIVE_LINKS} />
    </ToolPage>
  );
}

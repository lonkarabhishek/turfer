import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { TournamentScorer } from "@/components/tools/TournamentScorer";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";

const tool = toolBySlug("cricket-tournament-scorer")!;
const URL = `${TOOLS_BASE}/${tool.slug}`;

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
    q: "How is NRR calculated in a tournament?",
    a: "Add up every run a team scored and every ball it faced across its counted matches, and divide to get runs per over. Do the same for runs conceded and balls bowled. NRR is the difference. It is not the average of each match's NRR. No-result matches are left out; ties are counted.",
  },
  {
    q: "How are cricket tournament points calculated?",
    a: "By default a win is 2 points, a tie or no result is 1 and a loss is 0, which is what most leagues use. You can change the values when you set up the tournament. Teams level on points are separated by NRR, then by wins.",
  },
  {
    q: "Can I track a tri-series?",
    a: "Yes. Choose Tri-series, enter three team names and add matches as they are played. The table shows played, won, lost, tied, no result, points and NRR for each team. Round robin works the same way for up to ten teams.",
  },
  {
    q: "Does the scorer save my tournament?",
    a: "It is saved in your browser's local storage on this device, so refreshing or coming back later restores it. It is not uploaded anywhere and does not need an account. Clearing site data or using another device starts fresh.",
  },
  {
    q: "What happens when a team is all out?",
    a: "Standard rules count the full quota of overs against a side that is bowled out, not the overs it actually faced. Set Overs a side in the settings and tick All out on that innings, and the scorer applies the rule. Leave the setting blank and the overs you enter are used as they are.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Set up a bilateral series, tri-series or round robin, enter each match, and the points table, series score and net run rate work themselves out. Saved in your browser, no account."
      explainer={[
        {
          title: "Points table with NRR, done right",
          body: (
            <>
              <p>
                Every match is stored as runs, wickets and balls for both sides. Overs are read the cricket way, so 6.4 is six overs and four balls, 40 legal deliveries. From those totals the scorer keeps a live table: played, won, lost, tied, no result, points and NRR, sorted by points, then NRR, then wins.
              </p>
              <p>
                The winner is worked out from the scores. Override it for a tie decided by a super over, a result on DLS, or a washout marked as No result. Edit or delete any match and the table recalculates from scratch.
              </p>
              <p>
                Need just one match&rsquo;s numbers? The{" "}
                <Link href="/tools/cricket-nrr-calculator" className="text-accent-700 font-semibold hover:underline">
                  NRR calculator
                </Link>{" "}
                is quicker. Want to post the result? The{" "}
                <Link href="/tools/cricket-scorecard-maker" className="text-accent-700 font-semibold hover:underline">
                  scorecard maker
                </Link>{" "}
                turns a match into a shareable image.
              </p>
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <TournamentScorer cta={tool.cta} />
    </ToolPage>
  );
}

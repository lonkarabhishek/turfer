import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { LiveScorer } from "@/components/tools/LiveScorer";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";

const tool = toolBySlug("cricket-live-scorer")!;
const URL = `${TOOLS_BASE}/${tool.slug}`;
// Live links need the server's write key. The page is static, so this is
// read at build; an env change needs a redeploy anyway. Without the key the
// scorer hides the live link and this page does not mention it.
const LIVE_LINKS = Boolean(process.env.LIVE_WRITE_KEY);

export const metadata: Metadata = {
  title: { absolute: tool.title },
  description: tool.description,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: { title: tool.title, description: tool.description, url: URL, siteName: "TapTurf", type: "website" },
};

const FAQ = [
  {
    q: "How do I score a wide or a no-ball?",
    a: "Tap Wd or Nb, then the runs. For a wide, tap Wd again (or 0) for just the wide, or the number of runs they ran. For a no-ball, the number is runs off the bat, and you can switch it to byes or leg byes. Neither counts as a ball of the over, so the bowler bowls it again. A wide is 1 run and a no-ball 1 run by default; change either in House rules if your group plays 0 or 2.",
  },
  {
    q: "How does the free hit work?",
    a: "The ball after a no-ball is a free hit, and the scorer shows a yellow FREE HIT banner. On a free hit the batter can only be run out, so the scorer only offers run out when you tap W. If the free hit ball is itself a wide or a no-ball, the free hit carries on to the next ball. Groups that do not play free hits can switch it off in House rules.",
  },
  {
    q: "When does the strike change?",
    a: "When the batters run an odd number (1, 3 or 5), whether off the bat, as byes, leg byes or on a wide, and at the end of every over. Boundaries do not change ends. After a catch the new batter faces the next ball, as in the current Laws, but you can pick the other batter if your group plays the old crossing rule. Swap strike under More fixes any mix-up.",
  },
  {
    q: "What if I tap the wrong button?",
    a: "Tap Undo. It takes back the last ball, along with the batter or bowler you picked after it, and you can keep tapping it as far back as you need. Undid one too many? Redo puts it back. To fix a name, tap it on the scoring screen or the scorecard and type the right one; it changes everywhere, old balls included.",
  },
  {
    q: "Is my match saved, and can I share it?",
    a: LIVE_LINKS
      ? "Every ball is saved in your browser as you score, so a reload, a dead screen or closing the tab does not lose anything. Open the page again and the match carries on. Share live score sends a WhatsApp-ready update with the score, run rate, batters, bowler and this over. No account is needed, and nothing is uploaded unless you turn on a live link. With it on, anyone you send the link to can follow the match ball by ball, and you can turn it off any time."
      : "Every ball is saved in your browser as you score, so a reload, a dead screen or closing the tab does not lose anything. Open the page again and the match carries on. Share live score sends a WhatsApp-ready update with the score, run rate, batters, bowler and this over. Matches stay on the phone you scored on; nothing is uploaded and no account is needed.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Score your box cricket or turf match ball by ball on your phone. One tap a ball, and the scorecard, run rates, partnerships, graphs and commentary keep themselves up to date."
      explainer={[
        {
          title: "One tap a ball",
          body: (
            <>
              <p>
                Set the teams, overs and players, tap Start match, and the pad is under your thumb: 0, 1, 2, 3, 4 and 6 score a ball in one tap. Wd, Nb, Bye and LB take one more tap for the runs. W asks how they got out and who walks in next, in the same sheet. When an over ends, it asks who bowls next and greys out the bowler who just finished.
              </p>
              <p>
                Player names are optional. Start with Batter 1 and Bowler 1, and rename anyone by tapping their name, mid-match or after. Nobody needs an account, and it works in bright sunlight with big, high contrast buttons.
              </p>
            </>
          ),
        },
        {
          title: "Everything a scorer would write down",
          body: (
            <>
              <p>
                The live view shows the score, current and required run rates, the batters at the crease with runs and balls, the bowler&rsquo;s figures, this over ball by ball and the partnership. In a chase it also tells you where the other side were after the same number of balls.
              </p>
              <p>
                The full scorecard has how each batter got out, extras, fall of wickets, partnerships and bowling figures with maidens, wides and no-balls. There is an over by over list, a Manhattan chart of runs per over, a worm chart comparing both innings, and ball by ball commentary. At the end you get the result, top scorer, best bowler and a player of the match.
              </p>
              <p>
                Done? Make the result card turns the match into a square image for the group using the{" "}
                <Link href="/tools/cricket-scorecard-maker" className="text-accent-700 font-semibold hover:underline">
                  scorecard maker
                </Link>
                , filled in for you. Playing a league? Add the result to the{" "}
                <Link href="/tools/cricket-tournament-scorer" className="text-accent-700 font-semibold hover:underline">
                  tournament scorer
                </Link>{" "}
                for the points table and NRR.
              </p>
            </>
          ),
        },
        ...(LIVE_LINKS
          ? [
              {
                title: "A live link for everyone watching",
                body: (
                  <p>
                    Turn on a live link when you set up the match, or later from Share live score, and send it to the group. Followers just open the link: the score, scorecard, overs, graphs and commentary update as you score, with no app or sign-up. Only that match is uploaded, and you can turn the link off any time. The{" "}
                    <Link href="/privacy#live-links" className="text-accent-700 font-semibold hover:underline">
                      privacy policy
                    </Link>{" "}
                    says what is shared and for how long.
                  </p>
                ),
              },
            ]
          : []),
        {
          title: "Your house rules",
          body: (
            <p>
              Every box cricket group plays a little differently. Set a wide to 0 or 1 run, a no-ball to 1 or 2, free hits on or off, a limit on overs per bowler, last man stands, and a retire-at score like 30. You can change them mid-match from Match settings too, along with the overs and team names.
            </p>
          ),
        },
      ]}
      faq={FAQ}
    >
      <LiveScorer cta={tool.cta} liveLinks={LIVE_LINKS} />
    </ToolPage>
  );
}

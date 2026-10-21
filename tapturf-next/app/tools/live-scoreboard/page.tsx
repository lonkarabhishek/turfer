import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { LiveScoreboard } from "@/components/tools/LiveScoreboard";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";

const tool = toolBySlug("live-scoreboard")!;
const URL = `${TOOLS_BASE}/${tool.slug}`;
// Live links need the server's write key. The page is static, so this is
// read at build; an env change needs a redeploy anyway. Without the key the
// scoreboard hides the live link and this page does not mention it.
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
    q: "Can others follow the score?",
    a: LIVE_LINKS
      ? "Yes. Turn on a live link when you set up the match, or later from Share live score, and send it to the group on WhatsApp. You log in once to turn it on, with Google or your phone. Anyone with the link sees the score straight away, and a quick login keeps the clock, the sets and every goal or point updating as you tap. No app needed. The eye next to LIVE shows how many people are following. You can turn the link off any time, and only that match is uploaded."
      : "Share live score sends a WhatsApp-ready update with the score, the sets or the goals, and where the match is. Send a new one whenever the score changes. Matches stay on the phone you scored on; nothing is uploaded.",
  },
  {
    q: "Which rules does it follow?",
    a: "The current rules of each sport, with the common turf and club choices one tap away. Badminton plays to 21 with the 30th point winning at 29-all (BWF), or the new 15-point games capped at 21. Table tennis plays to 11, serve every 2 points and every point from 10-all (ITTF). Volleyball sets go to 25 and the deciding set to 15 (FIVB). Tennis has tiebreaks at 6-all, no-ad and a match tiebreak if you want them; padel uses the 2026 star point by default. Pickleball uses side-out scoring with the 0-0-2 start, or rally scoring. Football can go to a penalty shootout, and basketball shows the bonus after 4 team fouls in a quarter (FIBA).",
  },
  {
    q: "What if I tap the wrong side?",
    a: "Tap Undo. It takes back the last tap, and you can keep tapping it as far back as you need. Undid one too many? Redo puts it back. To fix who is serving, use Change server under More. Team names can be fixed any time from More or by tapping a name.",
  },
  {
    q: "How does the clock work?",
    a: "Football counts up from kick off and shows stoppage time after each half, so a goal in the 2nd half of 2 x 20 shows as 27'. Basketball counts down each quarter. Pause and Resume as the game stops, and Set time puts the clock to what the referee says. The time comes from your phone's clock, so it stays right with the screen off or the phone in a pocket.",
  },
  {
    q: "Is my match saved?",
    a: LIVE_LINKS
      ? "Every tap is saved in your browser as you score, so a reload, a dead screen or closing the tab loses nothing. Open the page again and the match carries on. No account is needed, and nothing is uploaded unless you turn on a live link."
      : "Every tap is saved in your browser as you score, so a reload, a dead screen or closing the tab loses nothing. Open the page again and the match carries on. No account is needed.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Keep score of your football, basketball, badminton, pickleball, tennis, table tennis, padel or volleyball game on your phone. Big buttons, one tap a point or goal, and the right rules for each sport."
      explainer={[
        {
          title: "Badminton, table tennis, volleyball, pickleball, tennis and padel",
          body: (
            <>
              <p>
                Pick who serves, then tap the half of the screen on the side that won the rally. The board does the rest: game and set points, deuce, who serves next and from which court, and when to change ends. When a game ends it asks before starting the next one, so an extra tap never scores in the new game, and Swap sides turns the screen round when the players change ends.
              </p>
              <p>
                Tennis and padel count 15, 30, 40 and deuce for you, with tiebreaks and the golden or star point. Pickleball calls the score as the server should, like 4-2-1, and works out side outs and the second server.
              </p>
            </>
          ),
        },
        {
          title: "Football and futsal",
          body: (
            <p>
              Tap Kick off to start the clock, then Goal under the team that scored. Penalty and own goal sit right under it, and yellow and red cards if you turn them on. Each goal gets its minute from the clock, and you can add the scorer&rsquo;s name after the tap without holding up the game. Level at full time? Turn on penalties and score the shootout kick by kick.
            </p>
          ),
        },
        {
          title: "Basketball",
          body: (
            <p>
              Quarters or halves on a countdown clock, or pickup games to 21 with no clock, or 3x3. Tap +2, +3 or a free throw for each team, count team fouls and timeouts, and the board says when a team is in the bonus. A tie at the end goes to a 5 minute overtime.
            </p>
          ),
        },
        {
          title: "Any other sport",
          body: (
            <p>
              Kabaddi, frisbee, carrom or a game your group made up: name it, pick +1 or +1 +2 +3 buttons, and play to a score or in halves. Playing cricket? Use the{" "}
              <Link href="/tools/cricket-live-scorer" className="text-accent-700 font-semibold hover:underline">
                Live Cricket Scorer
              </Link>{" "}
              for ball by ball scoring.
            </p>
          ),
        },
        ...(LIVE_LINKS
          ? [
              {
                title: "A live link for everyone watching",
                body: (
                  <p>
                    Turn on a live link and send it to the group. Followers just open it: the score, clock, sets, timeline and stats update as you tap, and the eye by LIVE shows how many are watching. Only that match is uploaded, and you can turn the link off any time. The{" "}
                    <Link href="/privacy#live-links" className="text-accent-700 font-semibold hover:underline">
                      privacy policy
                    </Link>{" "}
                    says what is shared and for how long.
                  </p>
                ),
              },
            ]
          : []),
      ]}
      faq={FAQ}
    >
      <LiveScoreboard cta={tool.cta} liveLinks={LIVE_LINKS} />
    </ToolPage>
  );
}

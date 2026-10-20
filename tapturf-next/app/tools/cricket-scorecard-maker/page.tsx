import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { ScorecardMaker } from "@/components/tools/ScorecardMaker";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";

const tool = toolBySlug("cricket-scorecard-maker")!;
const URL = `${TOOLS_BASE}/${tool.slug}`;

export const metadata: Metadata = {
  title: { absolute: tool.title },
  description: tool.description,
  alternates: { canonical: URL },
  robots: { index: true, follow: true },
  openGraph: { title: tool.title, description: tool.description, url: URL, siteName: "TapTurf", type: "website" },
};

const FAQ = [
  {
    q: "What is a cricket scorecard?",
    a: "A scorecard is the record of a match: each side's runs, wickets and overs, the result, and usually the standout performers. This tool makes the short, shareable version, the kind you post in the group after a box cricket game, rather than a ball-by-ball sheet.",
  },
  {
    q: "Can I create a cricket scorecard online for free?",
    a: "Yes. Everything here is free and runs in your browser. There is no account, no watermark beyond a small Made with TapTurf.in line, and nothing is uploaded anywhere.",
  },
  {
    q: "Can I download the scorecard?",
    a: "Yes. Download PNG saves a 1080 by 1080 image that looks sharp on WhatsApp, Instagram and in a group chat. On phones that support it, the Share button sends the image straight to WhatsApp or any other app.",
  },
  {
    q: "How is the result worked out?",
    a: "From the scores and who batted first. If the side batting first scored more, it won by the run difference. If the chasing side scored more, it won by wickets in hand. Ties are shown as Match tied. You can type over the suggested line at any time.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Type in the scores, get a clean match result card, and download or share it straight to the group. The result line is worked out from the scores for you."
      explainer={[
        {
          title: "Made for the post-match group chat",
          body: (
            <>
              <p>
                The card is square, dark and readable at a glance: both teams and scores up top, the result in a green band, and room for player of the match, top scorer, best bowler and the venue. It renders at 1080 by 1080 pixels, so it stays sharp after WhatsApp compresses it.
              </p>
              <p>
                Scoring the match as it happens? The{" "}
                <Link href="/tools/cricket-live-scorer" className="text-accent-700 font-semibold hover:underline">
                  live cricket scorer
                </Link>{" "}
                keeps the full scorecard ball by ball and hands the final scores to this card. Running a league? Enter the same match in the{" "}
                <Link href="/tools/cricket-tournament-scorer" className="text-accent-700 font-semibold hover:underline">
                  tournament scorer
                </Link>{" "}
                and the points table and NRR update by themselves.
              </p>
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <ScorecardMaker cta={tool.cta} />
    </ToolPage>
  );
}

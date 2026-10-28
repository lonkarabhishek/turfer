import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { TeamGenerator } from "@/components/tools/TeamGenerator";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";

const tool = toolBySlug("cricket-team-generator")!;
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
    q: "How do I randomly split cricket teams?",
    a: "Paste or type the player names, one per line, choose how many teams you want and tap Generate. The tool shuffles the names and deals them out evenly. Tap Regenerate for a fresh split.",
  },
  {
    q: "Can I create balanced cricket teams?",
    a: "Yes. Switch to Balanced and give each player a rating from 1 to 5. Players are sorted strongest first and dealt in snake order (1-2-3, 3-2-1, 1-2-3) so every team gets a similar total. Each team's total appears on its card.",
  },
  {
    q: "Can I generate more than two teams?",
    a: "Yes, two, three or four teams. With an uneven number of players the first teams get one extra player, so 10 players into 3 teams gives 4, 3 and 3.",
  },
  {
    q: "Does it save my players?",
    a: "No. Nothing leaves your phone and nothing is stored. Copy the teams with one tap and paste them into your WhatsApp group.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Paste the names, pick 2, 3 or 4 teams, and split them at random or balanced by a quick 1 to 5 rating. Regenerate until it feels fair, then copy the teams to your group."
      explainer={[
        {
          title: "Random or balanced",
          body: (
            <>
              <p>
                Random is the fair default for a casual box cricket night: everyone gets shuffled and dealt out, and nobody picked the sides. Balanced is for when the same two people always end up together and the match is over in four overs. Rate each player once and the generator spreads the strong and the new across the teams.
              </p>
              <p>
                Once the sides are set, use the{" "}
                <Link href="/tools/cricket-toss" className="text-accent-700 font-semibold hover:underline">
                  cricket toss
                </Link>{" "}
                to decide who bats, and the{" "}
                <Link href="/tools/cricket-tournament-scorer" className="text-accent-700 font-semibold hover:underline">
                  tournament scorer
                </Link>{" "}
                if the teams are playing a series.
              </p>
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <TeamGenerator cta={tool.cta} />
    </ToolPage>
  );
}

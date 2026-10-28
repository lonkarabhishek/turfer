import type { Metadata } from "next";
import { ToolPage } from "@/components/tools/ToolPage";
import { CricketToss } from "@/components/tools/CricketToss";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";

const tool = toolBySlug("cricket-toss")!;
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
    q: "How does a cricket toss work?",
    a: "One captain calls heads or tails while the coin is in the air. If the call matches the side that lands face up, that captain wins the toss and chooses whether to bat or bowl first. The other side gets whatever is left.",
  },
  {
    q: "Is an online coin toss random?",
    a: "Yes. This toss uses the browser's cryptographic random number generator where it is available, which is the same source used for security keys, so neither side is favoured. Each flip is independent of the last one.",
  },
  {
    q: "Who chooses whether to bat or bowl?",
    a: "The captain who wins the toss. On a turf with a short game, batting second lets you chase a known target; batting first under lights can be easier before the evening dew. Pick what suits your side.",
  },
  {
    q: "Can I use this on my phone at the ground?",
    a: "That is what it is for. The buttons are thumb-sized and the page works without signing in or installing anything. Tap heads or tails, flip, and show the screen to the other captain.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      compact
      intro="No coin in your pocket? Call heads or tails, flip, and see who bats. Ready the moment it loads and built for one hand on the turf."
      explainer={[
        {
          title: "A fair toss without a coin",
          body: (
            <>
              <p>
                Pick your call, hit Flip coin, and the coin spins and lands on heads or tails. The result says plainly whether your call won or lost. If you won, choose bat or bowl and the screen records it so there is no argument later.
              </p>
              <p>Start a new toss any time. Nothing is saved and nobody needs an account.</p>
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <CricketToss cta={tool.cta} />
    </ToolPage>
  );
}

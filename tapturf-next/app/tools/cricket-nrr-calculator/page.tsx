import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage } from "@/components/tools/ToolPage";
import { NrrCalculator } from "@/components/tools/NrrCalculator";
import { toolBySlug, TOOLS_BASE } from "@/lib/tools/registry";

const tool = toolBySlug("cricket-nrr-calculator")!;
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
    q: "What is NRR in cricket?",
    a: "Net run rate is the runs a team scores per over minus the runs it concedes per over. It separates teams level on points in a league or tournament table. A positive NRR means a team has scored faster than it has conceded.",
  },
  {
    q: "How is net run rate calculated?",
    a: "Divide total runs scored by total overs faced to get the run rate scored. Divide total runs conceded by total overs bowled to get the run rate conceded. NRR is the first number minus the second. For a tournament, add up runs and overs across every counted match before dividing, rather than averaging each match's NRR.",
  },
  {
    q: "How do cricket overs work in NRR calculations?",
    a: "An over has six legal balls, so overs are converted to balls first. 5.3 overs is 33 balls, which is 5.5 overs of six. Using 5.3 as a plain decimal would give a wrong run rate. This calculator does the conversion for you.",
  },
  {
    q: "Does 5.3 overs mean 5.3 overs mathematically?",
    a: "No. 5.3 means five overs and three balls. The digit after the point is the ball count and can only be 0 to 5. 5.6 or 5.7 is not a valid overs figure.",
  },
  {
    q: "What if a team is bowled out early?",
    a: "In most competition rules a side that is all out is treated as having faced its full quota of overs, so a team bowled out for 40 in 4 overs of a 6-over match is counted as 40 off 6. Enter the full quota in that case. The tournament scorer has an all-out switch that does this automatically.",
  },
];

export default function Page() {
  return (
    <ToolPage
      tool={tool}
      intro="Enter runs and overs for both sides and get run rate, opponent run rate and net run rate straight away. Overs are read the cricket way, so 5.3 is five overs and three balls."
      explainer={[
        {
          title: "How net run rate works",
          body: (
            <>
              <p>
                Run rate is runs per over. Your team&rsquo;s run rate is the runs you scored divided by the overs you faced. The opponent&rsquo;s run rate is the runs they scored divided by the overs they faced, which are the overs you bowled. Net run rate is the difference between the two.
              </p>
              <p>
                Example: your team makes 63 in 6 overs and the opponent makes 54 in 6 overs. Your run rate is 10.50, theirs is 9.00, so your NRR for the match is +1.500. A negative number means the other side scored faster.
              </p>
              <p>
                Overs are counted in balls. 5.3 overs is 33 balls, which is 5.5 overs of six, so 55 runs in 5.3 overs is a run rate of 10.00, not 10.38. Enter overs exactly as the scoreboard shows them and the calculator converts them.
              </p>
              <p>
                Tracking a whole league? The{" "}
                <Link href="/tools/cricket-tournament-scorer" className="text-accent-700 font-semibold hover:underline">
                  tournament scorer
                </Link>{" "}
                adds up runs and overs across every match and keeps a points table with NRR for you.
              </p>
            </>
          ),
        },
      ]}
      faq={FAQ}
    >
      <NrrCalculator cta={tool.cta} />
    </ToolPage>
  );
}

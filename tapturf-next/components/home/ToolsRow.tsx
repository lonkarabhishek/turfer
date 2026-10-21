import Link from "next/link";
import { Activity, ArrowUpRight, Calculator, Coins, ImageIcon, ListOrdered, Tally5, Users, type LucideIcon } from "lucide-react";
import { TOOLS, toolPath, type ToolSlug } from "@/lib/tools/registry";

/** At-the-pitch order: toss first, teams, then the scoring tools. A tool left out here never shows on home. */
const ORDER: ToolSlug[] = ["cricket-toss", "cricket-team-generator", "cricket-live-scorer", "live-scoreboard", "cricket-scorecard-maker", "cricket-nrr-calculator", "cricket-tournament-scorer"];

const ICONS: Record<ToolSlug, LucideIcon> = {
  "cricket-toss": Coins,
  "cricket-team-generator": Users,
  "cricket-live-scorer": Activity,
  "live-scoreboard": Tally5,
  "cricket-scorecard-maker": ImageIcon,
  "cricket-nrr-calculator": Calculator,
  "cricket-tournament-scorer": ListOrdered,
};

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** The free tools, for someone already at the ground. */
export function ToolsRow() {
  const tools = ORDER.map((slug) => TOOLS.find((t) => t.slug === slug)).filter((t) => t != null);
  if (tools.length === 0) return null;
  const howMany = WORDS[tools.length] ?? String(tools.length);
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12" aria-labelledby="tools-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="tools-h" className="font-display text-2xl md:text-3xl text-primary-800 tracking-tight">
            At the ground already?
          </h2>
          <p className="text-[13px] text-primary-500 mt-1">{howMany} free tools. No sign-up, built for a phone at the pitch.</p>
        </div>
        <Link
          href="/tools"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 whitespace-nowrap"
        >
          All tools <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
      {/* Seven cards: a swipe row until there is room for four across (4 + 3); three across would leave one alone. */}
      <ul className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 flex gap-3 overflow-x-auto snap-x scroll-px-4 scrollbar-hide lg:grid lg:grid-cols-4 lg:overflow-visible">
        {tools.map((t) => {
          const Icon = ICONS[t.slug];
          return (
            <li key={t.slug} className="w-[240px] shrink-0 snap-start lg:w-auto">
              <Link
                href={toolPath(t.slug)}
                className="press-tight card-lift focus-neon flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3 min-h-24 h-full hover:border-accent-400 hover:shadow-card-hover"
              >
                <span className="shrink-0 w-10 h-10 rounded-xl bg-accent-50 text-accent-700 inline-flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] lg:text-[14px] font-semibold text-primary-900 leading-tight">{t.name}</span>
                  <span className="block text-[13px] text-primary-500 mt-0.5 line-clamp-1">{t.tagline}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/tools"
        className="sm:hidden mt-3 flex h-11 items-center justify-center rounded-full border border-primary-200 text-[15px] font-semibold text-primary-900 press-tight focus-neon"
      >
        All {howMany.toLowerCase()} tools
      </Link>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, Coins, ImageIcon, ListOrdered, Users } from "lucide-react";
import { TOOLS, TOOLS_BASE, toolPath, type ToolSlug } from "@/lib/tools/registry";

export const metadata: Metadata = {
  title: { absolute: "Free Cricket Tools: NRR Calculator, Toss, Scorecard, Tournament Scorer | TapTurf" },
  description:
    "Free tools for cricket players and tournament organisers: NRR calculator, online toss, scorecard maker, series and tournament scorer with points table, and a team generator. No sign-up.",
  alternates: { canonical: TOOLS_BASE },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Free Cricket Tools | TapTurf",
    description: "NRR calculator, online toss, scorecard maker, tournament scorer and team generator. Free, no sign-up.",
    url: TOOLS_BASE,
    siteName: "TapTurf",
    type: "website",
  },
};

const ICONS: Record<ToolSlug, React.ComponentType<{ className?: string }>> = {
  "cricket-nrr-calculator": Calculator,
  "cricket-toss": Coins,
  "cricket-scorecard-maker": ImageIcon,
  "cricket-tournament-scorer": ListOrdered,
  "cricket-team-generator": Users,
};

export default function ToolsHub() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "TapTurf cricket tools",
    itemListElement: TOOLS.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, url: `${TOOLS_BASE}/${t.slug}` })),
  };
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-accent-600">Free</p>
        <h1 className="font-display tracking-tight text-primary-900 text-3xl sm:text-4xl md:text-5xl leading-[1.05] mt-2">TapTurf Tools</h1>
        <p className="mt-3 text-[17px] text-primary-600 leading-relaxed">Free tools for cricket players and tournament organizers. No sign-up, nothing to install, built to work on a phone at the ground.</p>
      </header>

      <ul className="grid sm:grid-cols-2 gap-3 sm:gap-4">
        {TOOLS.map((t) => {
          const Icon = ICONS[t.slug];
          return (
            <li key={t.slug}>
              <Link href={toolPath(t.slug)} className="press-tight flex items-start gap-4 rounded-2xl border border-primary-200 bg-white p-4 sm:p-5 hover:border-accent-400 hover:shadow-card-hover transition-all h-full">
                <span className="shrink-0 w-11 h-11 rounded-xl bg-accent-50 text-accent-700 inline-flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-primary-900 text-[16px]">{t.name}</span>
                  <span className="block text-[14px] text-primary-500 mt-0.5">{t.tagline}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-12 space-y-3 text-[15px] leading-relaxed text-primary-700">
        <h2 className="text-[22px] font-display text-primary-900">Made for turf cricket</h2>
        <p>
          These started as the things we kept doing by hand at box cricket nights: working out net run rate on a phone calculator, arguing about a toss, typing a result into WhatsApp. Each tool does one job, loads fast, and keeps your data on your own device.
        </p>
        <p>
          When the match is sorted, TapTurf is where you{" "}
          <Link href="/sport/box-cricket" className="text-accent-700 font-semibold hover:underline">
            find a box cricket turf
          </Link>{" "}
          or{" "}
          <Link href="/games" className="text-accent-700 font-semibold hover:underline">
            join an open game
          </Link>{" "}
          near you.
        </p>
      </div>
    </section>
  );
}

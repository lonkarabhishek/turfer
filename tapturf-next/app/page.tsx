import type { Metadata } from "next";
import Link from "next/link";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { HomeShell } from "@/components/home/HomeShell";
import { ArrowUpRight } from "lucide-react";

export const revalidate = 600;

// generateMetadata so the "N+ grounds" number in title/description
// stays honest as the DB grows, instead of the old hard-coded "90+".
export async function generateMetadata(): Promise<Metadata> {
  const [nashik, pune] = await Promise.all([
    getAllActiveTurfs("nashik"),
    getAllActiveTurfs("pune"),
  ]);
  const total = nashik.length + pune.length;
  // Round down to a tens boundary so we don't reprint stale counts
  // on every deploy — "175+" reads honest even if it becomes 176.
  const rounded = Math.max(50, Math.floor(total / 5) * 5);

  return {
    // absolute so layout's template doesn't add another "| TapTurf" —
    // the wordmark is already the first word.
    title: {
      absolute: "TapTurf — Cricket, Football & Sports Turfs in Nashik & Pune",
    },
    description: `Book sports turfs across Nashik and Pune. ${rounded}+ grounds for cricket, football, box cricket, badminton and more. Find a game, host a game, run the pitch.`,
    keywords:
      "turf booking nashik, turf booking pune, cricket turf nashik, cricket turf pune, football turf nashik, football turf pune, box cricket, sports turfs maharashtra, tapturf",
    openGraph: {
      title: "TapTurf — Book Turfs in Nashik & Pune",
      description: `${rounded}+ sports turfs across Nashik and Pune. Find a game, host a game, run the pitch.`,
      url: "https://www.tapturf.in",
      siteName: "TapTurf",
      locale: "en_IN",
      type: "website",
    },
    alternates: { canonical: "https://www.tapturf.in" },
  };
}

/**
 * Pick top turfs for a city — rating × review-count (Wilson-lite),
 * skipping unrated. Server-rendered so Googlebot sees turf links even
 * though the marketing hero mounts as a client component below.
 */
function topTurfsFor(all: Awaited<ReturnType<typeof getAllActiveTurfs>>) {
  return [...all]
    .filter((t) => t.rating > 0 && t.total_reviews > 0)
    .sort((a, b) => {
      const sa = a.rating * Math.log10(a.total_reviews + 1);
      const sb = b.rating * Math.log10(b.total_reviews + 1);
      return sb - sa;
    })
    .slice(0, 8);
}

export default async function HomePage() {
  const [nashikTurfs, puneTurfs] = await Promise.all([
    getAllActiveTurfs("nashik"),
    getAllActiveTurfs("pune"),
  ]);
  const total = nashikTurfs.length + puneTurfs.length;
  const topNashik = topTurfsFor(nashikTurfs);
  const topPune = topTurfsFor(puneTurfs);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TapTurf",
    url: "https://www.tapturf.in",
    description: `Find and book sports turfs across Nashik and Pune (${total}+ grounds).`,
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.tapturf.in/turfs?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeShell nashikTurfs={nashikTurfs} puneTurfs={puneTurfs} />

      {/* Server-rendered top-turf strips so crawlers see /turf/<id> links on
          the homepage even though the interactive marketing hero above is
          client-rendered. Hidden visually behind sr-only + a compact list
          below the fold; both are in initial HTML. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-14 space-y-10">
        {[
          { city: "Nashik", href: "/nashik" as const, list: topNashik, all: nashikTurfs.length },
          { city: "Pune",   href: "/pune"   as const, list: topPune,   all: puneTurfs.length },
        ]
          .filter((s) => s.list.length > 0)
          .map((section) => (
            <div key={section.city}>
              <div className="flex items-end justify-between mb-4">
                <h2 className="font-display uppercase text-2xl md:text-3xl text-primary-800 tracking-tight">
                  Popular in {section.city}
                </h2>
                <Link
                  href={section.href}
                  className="flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700 uppercase tracking-wide"
                >
                  All {section.all} <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.list.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/turf/${t.id}`}
                      className="flex items-start gap-2 rounded-xl border border-primary-200 bg-white p-3 hover:border-accent-500 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-primary-800 truncate">
                          {t.name}
                        </p>
                        <p className="text-[12px] text-primary-500 truncate">{t.address}</p>
                      </div>
                      {t.rating > 0 && t.total_reviews > 0 && (
                        <span className="text-[11px] font-semibold text-primary-800 shrink-0">
                          ★ {t.rating.toFixed(1)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
      <div className="h-16" />
    </>
  );
}

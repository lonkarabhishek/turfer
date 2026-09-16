import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getTurfsBySport } from "@/lib/queries/turfs";
import { TurfCard } from "@/components/turf/TurfCard";

// City coverage in copy — kept generic ("Nashik & Pune") since these
// pages list turfs from both cities. Was hardcoded to Nashik only.
const CITY_LABEL = "Nashik & Pune";

const sportInfo: Record<
  string,
  { name: string; icon: string; description: string }
> = {
  football: {
    name: "Football",
    icon: "⚽",
    description: `Find the best football turfs in ${CITY_LABEL}. 5-a-side, 7-a-side, and full-size turfs available.`,
  },
  cricket: {
    name: "Cricket",
    icon: "🏏",
    description: `Book cricket turfs and box cricket venues in ${CITY_LABEL}. Practice nets and match grounds.`,
  },
  basketball: {
    name: "Basketball",
    icon: "🏀",
    description: `Discover basketball courts in ${CITY_LABEL}. Indoor and outdoor options with great facilities.`,
  },
  badminton: {
    name: "Badminton",
    icon: "🏸",
    description: `Find badminton courts in ${CITY_LABEL}. Indoor courts with proper flooring and lighting.`,
  },
  tennis: {
    name: "Tennis",
    icon: "🎾",
    description: `Book tennis courts in ${CITY_LABEL}. Well-maintained courts for practice and matches.`,
  },
  pickleball: {
    name: "Pickleball",
    icon: "🏓",
    description: `Discover pickleball courts in ${CITY_LABEL}. The fastest growing sport with great venues.`,
  },
};

export async function generateStaticParams() {
  return Object.keys(sportInfo).map((sport) => ({ sport }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport } = await params;
  const info = sportInfo[sport];
  if (!info) return { title: "Sport Not Found" };

  const slug = info.name.toLowerCase();
  return {
    title: `${info.name} Turfs in ${CITY_LABEL} — Book Now | TapTurf`,
    description: `Find ${slug} turfs in ${CITY_LABEL}. Compare prices, check ratings, book instantly.`,
    keywords: [
      `${slug} turf nashik`,
      `${slug} turf pune`,
      `${slug} ground nashik`,
      `${slug} ground pune`,
      `${slug} court nashik`,
      `${slug} court pune`,
      `book ${slug} nashik`,
      `book ${slug} pune`,
    ].join(", "),
    openGraph: {
      title: `${info.name} Turfs in ${CITY_LABEL} | TapTurf`,
      description: info.description,
      url: `https://www.tapturf.in/sport/${sport}`,
      type: "website",
    },
    alternates: {
      canonical: `https://www.tapturf.in/sport/${sport}`,
    },
  };
}

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  const info = sportInfo[sport];
  if (!info) notFound();

  const turfs = await getTurfsBySport(info.name);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-primary-400 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-cream-400" />
        <Link href="/turfs" className="hover:text-primary-600 transition-colors">
          Turfs
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-cream-400" />
        <span className="text-primary-700 font-medium">{info.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <p className="text-xs font-semibold text-accent-600 uppercase tracking-widest mb-3">
          Sport Category
        </p>
        <div className="flex items-center gap-4 mb-3">
          <span className="text-5xl">{info.icon}</span>
          <div>
            <h1 className="text-[28px] md:text-[36px] font-bold text-primary-800 leading-tight font-serif">
              {info.name} turfs in {CITY_LABEL}
            </h1>
            <p className="text-base text-primary-400 mt-1">
              {turfs.length} {info.name.toLowerCase()} turf
              {turfs.length !== 1 ? "s" : ""} available
            </p>
          </div>
        </div>
        <p className="text-base text-primary-500 mt-4 max-w-2xl leading-relaxed">
          {info.description}
        </p>
      </div>

      {/* Grid */}
      {turfs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {turfs.map((turf) => (
            <TurfCard key={turf.id} turf={turf} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">{info.icon}</p>
          <p className="text-lg font-bold text-primary-800 font-serif">
            No {info.name.toLowerCase()} turfs found
          </p>
          <Link
            href="/turfs"
            className="mt-4 inline-flex text-sm font-semibold text-primary-600 underline underline-offset-4 hover:text-primary-400 transition-colors"
          >
            Browse all turfs
          </Link>
        </div>
      )}
    </div>
  );
}

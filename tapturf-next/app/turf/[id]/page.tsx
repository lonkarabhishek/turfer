import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Star, User } from "lucide-react";
import { getAllTurfIds, getTurfById } from "@/lib/queries/turfs";
import { summarisePrice } from "@/lib/utils/prices";
import { getPhone } from "@/lib/utils/seo";
import { convertGoogleDriveUrl } from "@/lib/utils/images";
import { areaFor } from "@/lib/utils/area";
import { labelFor, isCity } from "@/lib/city";
import { TurfImageGallery } from "@/components/turf/TurfImageGallery";
import { TurfPricing } from "@/components/turf/TurfPricing";
import { TurfDetails } from "@/components/turf/TurfDetails";
import { TurfAmenities } from "@/components/turf/TurfAmenities";
import { TurfMap } from "@/components/turf/TurfMap";
import { TurfJsonLd } from "@/components/turf/TurfJsonLd";
import { TurfReviews } from "@/components/turf/TurfReviews";
import { CTAButtons } from "@/components/ui/CTAButtons";

export const revalidate = 3600;

export async function generateStaticParams() {
  const ids = await getAllTurfIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const turf = await getTurfById(id);
  if (!turf) return { title: "Turf Not Found" };

  const priceSummary = summarisePrice(turf);
  const sports = turf.sports.join(", ");
  const primarySport = turf.sports[0]?.trim();
  const firstImage =
    turf.cover_image ||
    (turf.images[0] ? convertGoogleDriveUrl(turf.images[0]) : null);

  // City-aware metadata so Pune turfs don't get titled "Turf in Nashik".
  const cityLabel = isCity(turf.city) ? labelFor(turf.city) : "Maharashtra";
  const cityHash = isCity(turf.city) ? `#${turf.city}turf` : "";
  const area = areaFor(turf);
  const cityAndArea = area ? `${area}, ${cityLabel}` : cityLabel;

  const hasRatings = turf.total_reviews > 0 && turf.rating > 0;
  const ratingClause = hasRatings
    ? ` Rated ${Number(turf.rating).toFixed(1)} (${turf.total_reviews} Google reviews).`
    : "";
  const priceClause =
    priceSummary.kind === "real" ? ` Starting ${priceSummary.label}.` : "";
  // USP for the title, priority per brief:
  //   real price → "₹X/hr"
  //   covered {sport} → "Covered {Sport}"
  //   ground_format {sport} → "{Format} {Sport}"
  //   fallback → "Timings & Photos"
  const usp = (() => {
    if (priceSummary.kind === "real" && priceSummary.min != null) {
      return `₹${priceSummary.min}/hr`;
    }
    if (turf.is_covered && primarySport) return `Covered ${primarySport}`;
    if (turf.ground_format && primarySport) return `${turf.ground_format} ${primarySport}`;
    if (primarySport) return `${primarySport} Timings & Photos`;
    return "Timings & Photos";
  })();

  // Layout's title.template adds " | TapTurf" for us — never bake it
  // into the raw title or it appears twice. Target ≤55 chars here so
  // the SERP-visible "title | TapTurf" stays under Google's ~65-char
  // truncation ceiling.
  const fullTitle = `${turf.name} ${cityAndArea} – ${usp}`;
  const titleNoUsp = `${turf.name} ${cityAndArea}`;
  const titleShort = `${turf.name}, ${cityLabel}`;
  const title = fullTitle.length <= 55 ? fullTitle : titleNoUsp.length <= 55 ? titleNoUsp : titleShort;

  const photoCount = turf.images?.length ?? 0;
  const photoClause = photoCount > 0 ? ` ${photoCount} photos.` : "";
  const locationClause = area
    ? ` in ${area}, ${cityLabel}`
    : cityLabel
      ? ` in ${cityLabel}`
      : "";

  return {
    title,
    description:
      `${sports || "Sports turf"}${locationClause}.` +
      `${priceClause}${ratingClause}${photoClause} Call or WhatsApp to book.`,
    keywords: [
      turf.name,
      area ? `turf in ${area.toLowerCase()}` : null,
      `turf in ${cityLabel.toLowerCase()}`,
      `${cityLabel.toLowerCase()} turf booking`,
      ...turf.sports.map((s) => `${s.toLowerCase()} turf ${cityLabel.toLowerCase()}`),
      cityHash,
    ].filter(Boolean).join(", "),
    openGraph: {
      title: `${turf.name} — ${cityAndArea}`,
      description: `${sports || "Multi-sport"}${locationClause}.${priceClause}${ratingClause}`,
      url: `https://www.tapturf.in/turf/${turf.id}`,
      ...(firstImage && {
        images: [{ url: firstImage, width: 1200, height: 630 }],
      }),
      type: "website",
      locale: "en_IN",
      siteName: "TapTurf",
    },
    alternates: { canonical: `https://www.tapturf.in/turf/${turf.id}` },
  };
}

export default async function TurfDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const turf = await getTurfById(id);
  if (!turf) notFound();

  const phone = getPhone(turf);
  const sidebarPrice = summarisePrice(turf);

  return (
    <div className="has-bottom-cta">
      <TurfJsonLd turf={turf} />

      {/* Breadcrumb */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-1.5 text-sm text-primary-400 overflow-x-auto scrollbar-hide">
        <Link href="/" className="hover:text-primary-600 transition-colors whitespace-nowrap">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        <Link href="/turfs" className="hover:text-primary-600 transition-colors whitespace-nowrap">
          Turfs
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        <span className="text-primary-700 font-medium truncate">{turf.name}</span>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Title section */}
        <div className="mb-6">
          <h1 className="text-[28px] md:text-[36px] font-bold text-primary-800 leading-tight font-serif">
            {turf.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            {turf.total_reviews > 0 && turf.rating > 0 ? (
              <>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-accent-500 text-accent-500" />
                  <span className="font-semibold text-primary-700">{Number(turf.rating).toFixed(1)}</span>
                </div>
                <span className="text-cream-400">·</span>
                <span className="text-primary-500 underline underline-offset-2">
                  {turf.total_reviews} review{turf.total_reviews !== 1 ? "s" : ""}
                </span>
              </>
            ) : (
              <span className="text-primary-400">No ratings yet</span>
            )}
            <span className="text-cream-400">·</span>
            <span className="text-primary-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {turf.address}
            </span>
          </div>

          {/* Sport tags */}
          {turf.sports.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {turf.sports.map((sport) => (
                <Link
                  key={sport}
                  href={`/sport/${sport.toLowerCase()}`}
                  className="text-xs font-semibold bg-primary-50 border border-primary-100 hover:bg-primary-100 text-primary-600 px-3 py-1.5 rounded-full transition-colors"
                >
                  {sport}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Image gallery */}
        <TurfImageGallery images={turf.images} />

        {/* Main content + sidebar */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          {/* Left content */}
          <div>
            {/* Managed by section */}
            {turf.owner_name && (
              <div className="flex items-center gap-4 pb-6 border-b border-cream-300">
                <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-primary-800 font-serif">
                    Managed by {turf.owner_name}
                  </h2>
                  {turf.sports.length > 0 && (
                    <p className="text-sm text-primary-400">
                      {turf.sports.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {turf.description && (
              <div className="section-divider">
                <p className="text-base text-primary-600 leading-relaxed whitespace-pre-line">
                  {turf.description}
                </p>
              </div>
            )}

            <TurfAmenities turf={turf} />
            <TurfDetails turf={turf} />
            <TurfPricing turf={turf} />

            {/* Google Maps — show whenever we have any locatable signal
                (coords, an embeddable iframe, or at least an address to
                search on). TurfMap itself returns null when it can't
                produce a usable embed. */}
            {(turf.gmap_embed_link || (turf.lat != null && turf.lng != null) || turf.address) && (
              <div className="section-divider">
                <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">
                  Where you&apos;ll play
                </h2>
                <TurfMap
                  embedLink={turf.gmap_embed_link}
                  lat={turf.lat}
                  lng={turf.lng}
                  address={turf.address}
                  name={turf.name}
                />
              </div>
            )}

            {/* Reviews — Google summary card + in-app reviews + write form.
                The old standalone "Read on Google" link is now folded
                into TurfReviews so there's a single reviews section. */}
            <TurfReviews
              turfId={turf.id}
              googleRating={turf.rating}
              googleReviewCount={turf.total_reviews}
              googleReviewUrl={turf.external_review_url}
            />
          </div>

          {/* Right sidebar — sticky booking card */}
          <div className="hidden lg:block">
            <div className="sticky top-24 border border-cream-300 rounded-2xl p-6 shadow-elevated bg-white">
              <div className="mb-1">
                {sidebarPrice.kind === "real" ? (
                  <div>
                    <span className="text-[26px] font-bold text-primary-800 font-serif">
                      ₹{sidebarPrice.min}
                      {sidebarPrice.min !== sidebarPrice.max ? `–₹${sidebarPrice.max}` : ""}
                    </span>
                    <span className="text-base text-primary-400 font-normal"> /hr</span>
                  </div>
                ) : sidebarPrice.kind === "reported" ? (
                  <div>
                    <span className="text-[22px] font-bold text-primary-800 font-serif">
                      ~₹{sidebarPrice.min}
                      {sidebarPrice.min !== sidebarPrice.max ? `–₹${sidebarPrice.max}` : ""}
                    </span>
                    <span className="text-sm text-primary-400 font-normal"> /hr</span>
                    <p className="text-[11px] text-primary-400 mt-1">
                      Reported by players · unverified
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-[22px] font-bold text-primary-800 font-serif">
                      Price on request
                    </span>
                    <p className="text-[13px] text-primary-500 mt-1">
                      Call or WhatsApp for slot rates
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 mb-6 text-sm">
                {turf.total_reviews > 0 && turf.rating > 0 ? (
                  <>
                    <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                    <span className="font-semibold text-primary-700">{Number(turf.rating).toFixed(1)}</span>
                    <span className="text-primary-400 ml-0.5">
                      ({turf.total_reviews} review{turf.total_reviews !== 1 ? "s" : ""})
                    </span>
                  </>
                ) : (
                  <span className="text-primary-400">No ratings yet</span>
                )}
              </div>

              {phone ? (
                <CTAButtons
                  phone={phone}
                  turfName={turf.name}
                  address={turf.address}
                />
              ) : (
                <p className="text-sm text-primary-400 text-center py-4">
                  Contact information not available
                </p>
              )}

              <p className="text-xs text-center text-primary-300 mt-4">
                No booking fee. Contact turf directly to reserve your slot.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed CTA */}
      {phone && (
        <CTAButtons
          phone={phone}
          turfName={turf.name}
          address={turf.address}
          variant="fixed-bottom"
        />
      )}
    </div>
  );
}

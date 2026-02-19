import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Star, ExternalLink, Share, User } from "lucide-react";
import { getAllTurfIds, getTurfById } from "@/lib/queries/turfs";
import { getMinimumPrice } from "@/lib/utils/prices";
import { getPhone } from "@/lib/utils/seo";
import { convertGoogleDriveUrl } from "@/lib/utils/images";
import { TurfImageGallery } from "@/components/turf/TurfImageGallery";
import { TurfPricing } from "@/components/turf/TurfPricing";
import { TurfDetails } from "@/components/turf/TurfDetails";
import { TurfAmenities } from "@/components/turf/TurfAmenities";
import { TurfMap } from "@/components/turf/TurfMap";
import { TurfJsonLd } from "@/components/turf/TurfJsonLd";
import { CTAButtons } from "@/components/ui/CTAButtons";
import { StarRating } from "@/components/ui/StarRating";

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

  const minPrice = getMinimumPrice(turf);
  const sports = turf.sports.join(", ");
  const firstImage =
    turf.cover_image ||
    (turf.images[0] ? convertGoogleDriveUrl(turf.images[0]) : null);

  return {
    title: `${turf.name} - Book Now | Turf in Nashik`,
    description: `Book ${turf.name} in ${turf.address}. Starting ₹${minPrice}/hr. ${sports}. Rated ${Number(turf.rating).toFixed(1)} stars (${turf.total_reviews} reviews). Call or WhatsApp to book.`,
    openGraph: {
      title: `${turf.name} - Turf in Nashik`,
      description: `${turf.address}. Starting ₹${minPrice}/hr. ${sports}.`,
      url: `https://www.tapturf.in/turf/${turf.id}`,
      ...(firstImage && {
        images: [{ url: firstImage, width: 1200, height: 630 }],
      }),
      type: "website",
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
  const minPrice = getMinimumPrice(turf);

  return (
    <div className="has-bottom-cta">
      <TurfJsonLd turf={turf} />

      {/* Breadcrumb — Airbnb uses subtle breadcrumbs */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-1.5 text-sm text-gray-500 overflow-x-auto scrollbar-hide">
        <Link href="/" className="hover:text-gray-900 transition-colors whitespace-nowrap">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-300" />
        <Link href="/turfs" className="hover:text-gray-900 transition-colors whitespace-nowrap">
          Turfs
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-300" />
        <span className="text-gray-900 font-medium truncate">{turf.name}</span>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Title section — Airbnb-style */}
        <div className="mb-6">
          <h1 className="text-[26px] md:text-[32px] font-semibold text-gray-900 leading-tight">
            {turf.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-gray-900 text-gray-900" />
              <span className="font-semibold">{Number(turf.rating).toFixed(1)}</span>
            </div>
            {turf.total_reviews > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-gray-600 underline underline-offset-2">
                  {turf.total_reviews} review{turf.total_reviews !== 1 ? "s" : ""}
                </span>
              </>
            )}
            <span className="text-gray-300">·</span>
            <span className="text-gray-600 underline underline-offset-2 flex items-center gap-1">
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
                  className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full transition-colors"
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
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          {/* Left content */}
          <div>
            {/* Hosted by section — Airbnb-style */}
            {turf.owner_name && (
              <div className="flex items-center gap-4 pb-6 border-b border-gray-200">
                <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Managed by {turf.owner_name}
                  </h2>
                  {turf.sports.length > 0 && (
                    <p className="text-sm text-gray-500">
                      {turf.sports.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {turf.description && (
              <div className="section-divider">
                <p className="text-base text-gray-600 leading-relaxed whitespace-pre-line">
                  {turf.description}
                </p>
              </div>
            )}

            <TurfAmenities turf={turf} />
            <TurfDetails turf={turf} />
            <TurfPricing turf={turf} />

            {/* Google Maps */}
            {turf.gmap_embed_link && (
              <div className="section-divider">
                <h2 className="text-[22px] font-semibold text-gray-900 mb-5">
                  Where you&apos;ll play
                </h2>
                <TurfMap embedLink={turf.gmap_embed_link} />
              </div>
            )}

            {/* Google Reviews link */}
            {turf.external_review_url && (
              <div className="section-divider">
                <a
                  href={turf.external_review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-base text-gray-900 font-semibold underline underline-offset-2 hover:text-gray-600 transition-colors"
                >
                  <Star className="w-4 h-4" />
                  Read reviews on Google
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>

          {/* Right sidebar - CTA (desktop) — Airbnb-style sticky card */}
          <div className="hidden lg:block">
            <div className="sticky top-24 border border-gray-200 rounded-2xl p-6 shadow-elevated">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="text-[22px] font-semibold">₹{minPrice}</span>
                  <span className="text-base text-gray-500 font-normal"> /hr onwards</span>
                </div>
              </div>

              <div className="flex items-center gap-1 mb-6 text-sm">
                <Star className="w-3.5 h-3.5 fill-gray-900 text-gray-900" />
                <span className="font-semibold">{Number(turf.rating).toFixed(1)}</span>
                {turf.total_reviews > 0 && (
                  <span className="text-gray-500 ml-0.5">
                    ({turf.total_reviews} review{turf.total_reviews !== 1 ? "s" : ""})
                  </span>
                )}
              </div>

              {phone ? (
                <CTAButtons
                  phone={phone}
                  turfName={turf.name}
                  address={turf.address}
                />
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Contact information not available
                </p>
              )}

              <p className="text-xs text-center text-gray-400 mt-4">
                You won&apos;t be charged. Contact turf directly to book.
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

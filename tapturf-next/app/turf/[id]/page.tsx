import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Flame, KeyRound, MapPin, Star, User } from "lucide-react";
import { getAllTurfIds, getTurfById } from "@/lib/queries/turfs";
import { summarisePrice } from "@/lib/utils/prices";
import { getPhone, getWhatsAppPhone } from "@/lib/utils/seo";
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
import { CreateGameHereButton } from "@/components/turf/CreateGameHereButton";
import { TurfGames } from "@/components/turf/TurfGames";
import { getTrendingPick } from "@/lib/queries/trending";
import { courtType, sportPageForLabel } from "@/lib/sports";
import { TurfSuggestions, NoContactNotice } from "@/components/turf/TurfSuggestions";

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
  //
  // The type follows the MAIN sport (sports[0]): a cricket-first turf
  // that also hosts football is a "Cricket Turf", not a "Football
  // Turf". A second turf sport is added when the title still fits.
  const { turfType, turfTypeShort } = describeTurfType(turf.sports);
  const displayName = cleanTurfName(turf.name);
  const usp = (() => {
    if (priceSummary.kind === "real" && priceSummary.min != null) {
      return `₹${priceSummary.min}/hr`;
    }
    if (turf.is_covered && turfType) return `Covered ${turfType}`;
    if (turf.is_covered && primarySport) return `Covered ${primarySport}`;
    if (turfType) return turfType;
    if (turf.ground_format && primarySport) return `${turf.ground_format} ${primarySport}`;
    if (primarySport) return `${primarySport} Timings & Photos`;
    return "Timings & Photos";
  })();

  // Layout's title.template adds " | TapTurf" for us — never bake it
  // into the raw title or it appears twice. Target ≤55 chars here so
  // the SERP-visible "title | TapTurf" stays under Google's ~65-char
  // truncation ceiling.
  // Layout adds " | TapTurf" (10 chars); Google shows about 60, so the
  // raw title must fit in 50. Try the richest form first, then drop
  // the area, then the second sport, then the USP; finally shorten
  // the name itself at a word boundary.
  const MAX = 50;
  const candidates = [
    `${displayName} ${cityAndArea} – ${usp}`,
    `${displayName} ${cityLabel} – ${usp}`,
    turfTypeShort && turfTypeShort !== usp ? `${displayName} ${cityLabel} – ${turfTypeShort}` : null,
    `${displayName} ${cityAndArea}`,
    `${displayName}, ${cityLabel}`,
  ];
  const title =
    candidates.find((t): t is string => !!t && t.length <= MAX) ??
    `${truncateWords(displayName, MAX - cityLabel.length - 2)}, ${cityLabel}`;

  const photoCount = turf.images?.length ?? 0;
  const photoClause = photoCount > 0 ? ` ${photoCount} photo${photoCount === 1 ? "" : "s"}.` : "";
  const locationClause = area
    ? ` in ${area}, ${cityLabel}`
    : cityLabel
      ? ` in ${cityLabel}`
      : "";

  return {
    title,
    description:
      `${turfType ?? (sports || "Sports turf")}${locationClause}.` +
      (turfType && sports ? ` Sports: ${sports}.` : "") +
      `${priceClause}${ratingClause}${photoClause} Call or WhatsApp to book.`,
    keywords: [
      turf.name,
      area ? `turf in ${area.toLowerCase()}` : null,
      `turf in ${cityLabel.toLowerCase()}`,
      `${cityLabel.toLowerCase()} turf booking`,
      ...turf.sports.map((s) => `${s.toLowerCase()} ${sportPageForLabel(s)?.venue ?? "turf"} ${cityLabel.toLowerCase()}`),
      cityHash,
    ].filter(Boolean).join(", "),
    openGraph: {
      title: `${turf.name}, ${cityAndArea}`,
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
  const whatsappPhone = getWhatsAppPhone(turf);
  const sidebarPrice = summarisePrice(turf);
  // Members-only clubs (NIWEC): no "Call to Book", show how to get in.
  const membersOnly = turf.membership_required === true;
  // Is this turf its city's Most Trending Turf this week?
  const trending =
    turf.city && isCity(turf.city) ? await getTrendingPick(turf.city) : null;
  const isTrending = trending?.turfId === turf.id;

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
          {isTrending && trending && (
            <div className="mb-4 rounded-2xl spotlight-ring px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full spotlight-badge flex items-center justify-center shrink-0">
                <Flame className="w-4.5 h-4.5 fill-[#e0a92e] text-[#b9851f]" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold spotlight-text leading-tight">
                  Most trending turf in {labelFor(trending.city)} this week
                </p>
                {trending.tagline && (
                  <p className="text-[13px] text-primary-500 leading-snug mt-0.5">{trending.tagline}</p>
                )}
              </div>
            </div>
          )}
          <h1 className="text-[28px] md:text-[36px] font-bold text-primary-800 leading-tight font-serif">
            {turf.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            {turf.rating > 0 ? (
              <>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-accent-500 text-accent-500" />
                  <span className="font-semibold text-primary-700">{Number(turf.rating).toFixed(1)}</span>
                  <span className="text-primary-400">on Google</span>
                </div>
                {turf.total_reviews > 0 && (
                  <>
                    <span className="text-cream-400">·</span>
                    <span className="text-primary-500 underline underline-offset-2">
                      {turf.total_reviews} review{turf.total_reviews !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
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

          {/* Members-only clubs: say so up front, with the access rules. */}
          {(membersOnly || turf.access_notes) && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200/70 px-4 py-3">
              <KeyRound className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {membersOnly && (
                  <p className="text-[14px] font-semibold text-amber-900">Members&apos; club</p>
                )}
                {turf.access_notes && (
                  <p className="text-[14px] text-amber-900/85 leading-snug">{turf.access_notes}</p>
                )}
              </div>
            </div>
          )}

          {/* Sport tags */}
          {turf.sports.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {turf.sports.map((sport) => {
                // Only link sports that have a page ("Box Cricket" ->
                // /sport/box-cricket); others render as plain tags.
                const page = sportPageForLabel(sport);
                const cls = "text-xs font-semibold bg-primary-50 border border-primary-100 text-primary-600 px-3 py-1.5 rounded-full";
                return page ? (
                  <Link key={sport} href={`/sport/${page.slug}`} className={`${cls} hover:bg-primary-100 transition-colors`}>
                    {sport}
                  </Link>
                ) : (
                  <span key={sport} className={cls}>{sport}</span>
                );
              })}
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

            {/* Upcoming games here, with "Host a game here" right below. */}
            <TurfGames turfId={turf.id} turfName={turf.name} turfAddress={turf.address} />

            {/* Player-suggested info (contact, prices, hours, facilities).
                Fetched client-side so a fresh suggestion shows at once. */}
            <TurfSuggestions turfId={turf.id} turfName={turf.name} hasPhone={!!phone} />

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
                    <span className="text-base text-primary-400 font-normal"> {sidebarPrice.unit}</span>
                  </div>
                ) : sidebarPrice.kind === "reported" ? (
                  <div>
                    <span className="text-[22px] font-bold text-primary-800 font-serif">
                      ~₹{sidebarPrice.min}
                      {sidebarPrice.min !== sidebarPrice.max ? `–₹${sidebarPrice.max}` : ""}
                    </span>
                    <span className="text-sm text-primary-400 font-normal"> {sidebarPrice.unit}</span>
                    <p className="text-[11px] text-primary-400 mt-1">
                      Reported by players · unverified
                    </p>
                  </div>
                ) : sidebarPrice.kind === "reported_text" ? (
                  <div>
                    <span className="text-[22px] font-bold text-primary-800 font-serif">
                      Reported prices
                    </span>
                    <p className="text-[13px] text-primary-500 mt-1">
                      See Pricing below. Unverified, confirm with the turf.
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
                {turf.rating > 0 ? (
                  <>
                    <Star className="w-3.5 h-3.5 fill-accent-500 text-accent-500" />
                    <span className="font-semibold text-primary-700">{Number(turf.rating).toFixed(1)}</span>
                    <span className="text-primary-400 ml-0.5">
                      {turf.total_reviews > 0
                        ? `(${turf.total_reviews} review${turf.total_reviews !== 1 ? "s" : ""})`
                        : "on Google"}
                    </span>
                  </>
                ) : (
                  <span className="text-primary-400">No ratings yet</span>
                )}
              </div>

              {membersOnly && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200/70 px-3.5 py-2.5">
                  <p className="text-[13px] font-semibold text-amber-900">Members&apos; club</p>
                  <p className="text-[13px] text-amber-900/80 leading-snug mt-0.5">
                    {turf.access_notes || "Booking is for members. Call to ask about guest access."}
                  </p>
                </div>
              )}
              {phone ? (
                <CTAButtons
                  turfId={turf.id}
                  phone={phone}
                  whatsappPhone={whatsappPhone}
                  turfName={turf.name}
                  address={turf.address}
                  callLabel={membersOnly ? "Call to ask" : "Call to Book"}
                />
              ) : (
                <NoContactNotice />
              )}

              {/* Host their own game at this turf — jumps into the
                  create-game wizard with this turf pre-selected. */}
              <CreateGameHereButton turfId={turf.id} turfName={turf.name} />

              {!membersOnly && (
                <p className="text-xs text-center text-primary-300 mt-4">
                  No booking fee. Contact turf directly to reserve your slot.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:hidden mb-24" />
      </div>

      {/* Mobile fixed CTA: Call / WhatsApp, or the "we don't have
          the number yet" bar that opens the suggest form. */}
      {phone ? (
        <CTAButtons
          turfId={turf.id}
          phone={phone}
          whatsappPhone={whatsappPhone}
          turfName={turf.name}
          address={turf.address}
          variant="fixed-bottom"
        />
      ) : (
        <NoContactNotice variant="fixed-bottom" />
      )}
    </div>
  );
}

// ── title helpers ──

/**
 * "Football Turf", "Cricket & Football Turf", "Badminton Court" from the
 * sports list, main sport first. `turfTypeShort` is the one-sport form
 * used when the full one makes the title too long.
 */
function describeTurfType(sports: string[]): { turfType: string | null; turfTypeShort: string | null } {
  const norm = sports.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const label = (s: string): string | null =>
    s === "box cricket" ? "Box Cricket" : s === "cricket" || s === "cricket nets" ? "Cricket" : s === "football" ? "Football" : null;
  const main = norm[0] ? label(norm[0]) : null;
  if (!main) {
    const court = courtType(sports);
    return { turfType: court, turfTypeShort: court };
  }
  const second = norm.slice(1).map(label).find((l): l is string => !!l && l !== main);
  return {
    turfType: second ? `${main} & ${second} Turf` : `${main} Turf`,
    turfTypeShort: `${main} Turf`,
  };
}

/**
 * Display form of a stored name: drop bracketed asides, anything after
 * "/" or "|", and "Best Turf in …" style padding. The DB keeps the
 * original; the data team cleans names separately.
 */
function cleanTurfName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, "")
    .split(/\s*[|/]\s*/)[0]
    .replace(/\s*(?:-|–|,)?\s*best turf.*$/i, "")
    // "… Turf Cricket, Football Etc": a bare sport list tacked on the end
    .replace(/(\bturf)\s+(?:box cricket|cricket|football)(?:[,\s]+(?:box cricket|cricket|football|etc\.?))*$/i, "$1")
    .replace(/\s{2,}/g, " ")
    .trim() || name;
}

/** Cut at a word boundary to at most `max` chars, without a trailing ellipsis. */
function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : s.slice(0, max))
    .replace(/(?:\s+(?:and|&|the|of|in|at))?[\s,–-]*$/i, "");
}

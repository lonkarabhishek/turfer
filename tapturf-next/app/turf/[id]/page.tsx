import type { Metadata } from "next";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { AskAboutButton } from "@/components/ask/AskAboutButton";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, ChevronRight, Flame, KeyRound, MapPin, Star, User } from "lucide-react";
import { getTopTurfKeys } from "@/lib/queries/turfs";
import { loadTurfPage } from "@/lib/queries/turfPage";
import { turfPath, turfUrl } from "@/lib/utils/turfPath";
import { playerPriceRange, priceRangeText, priceUnitSuffix, showsPriceBands, summarisePagePrice } from "@/lib/utils/prices";
import { getPhone, getWhatsAppPhone } from "@/lib/utils/seo";
import { turfPhotos } from "@/lib/utils/images";
import { stripBookingClaims } from "@/lib/utils/bookingClaims";
import { areaFor } from "@/lib/utils/area";
import { dailyHoursSummary } from "@/lib/utils/hours";
import { guessCityFromAddress, labelFor, isCity } from "@/lib/city";
import { TurfImageGallery } from "@/components/turf/TurfImageGallery";
import { TurfPricing, slotRatesHint } from "@/components/turf/TurfPricing";
import { TurfDetails } from "@/components/turf/TurfDetails";
import { TurfAmenities } from "@/components/turf/TurfAmenities";
import { TurfMap } from "@/components/turf/TurfMap";
import { TurfJsonLd } from "@/components/turf/TurfJsonLd";
import { TurfReviews } from "@/components/turf/TurfReviews";
import { CTAButtons } from "@/components/ui/CTAButtons";
import { CreateGameHereButton } from "@/components/turf/CreateGameHereButton";
import { TurfGames } from "@/components/turf/TurfGames";
import { courtType, sportPageForLabel } from "@/lib/sports";
import { TurfSuggestions, NoContactNotice } from "@/components/turf/TurfSuggestions";
import { NoteInterest } from "@/components/analytics/VisitTracker";

// A day: since the 20 Oct outage the cache queue purges a turf's page
// when the turf, its reviews or their votes, suggestions, games, claim or
// trending pick change, so the timer is only a backstop. A refresh is one
// turf_page call. Nothing the page renders may be cached for less than a
// day, or the page refreshes that often (the footer has its own day-long
// city list for this reason, see getFooterCities).
export const revalidate = 86400;

// The [id] segment is the turf's slug (/turf/turf-up-hinjewadi). Old
// links by id still resolve and 308 to the slug URL. Only the 300 most
// reviewed turfs are built at deploy; the rest render on first visit
// and are cached (all of them are in the sitemap either way). Previews
// and local builds build none, so they never render against the
// production database.
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const keys = await getTopTurfKeys(300);
  return keys.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const turf = (await loadTurfPage(decodeURIComponent(id)))?.turf;
  if (!turf) return { title: "Turf not found", robots: { index: false } };

  // Same numbers as the page's Pricing table (bands when it lists them).
  const priceSummary = summarisePagePrice(turf);
  const sports = turf.sports.join(", ");
  const primarySport = turf.sports[0]?.trim();
  // Share preview: our own copy before a Google link, which can expire.
  // Images are already normalised by transformTurf.
  const firstImage = turfPhotos(turf)[0] ?? null;

  // City-aware metadata: the turf's own city, then its address. A turf
  // with neither is described by name and area only, never placed in a
  // guessed city or state.
  const cityId = isCity(turf.city) ? turf.city : guessCityFromAddress(turf.address);
  const cityLabel = cityId ? labelFor(cityId) : null;
  const cityHash = cityId ? `#${cityId}turf` : "";
  const area = areaFor(turf);
  const cityAndArea = [area, cityLabel].filter(Boolean).join(", ");

  const hasRatings = turf.total_reviews > 0 && turf.rating > 0;
  const ratingClause = hasRatings
    ? ` Rated ${Number(turf.rating).toFixed(1)} (${turf.total_reviews} Google reviews).`
    : "";
  const hours = dailyHoursSummary(turf.opening_hours, {
    start_time: turf.start_time,
    end_time: turf.end_time,
    is_24x7: turf.is_24x7,
  });
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
      // Listed bands are always per hour; the slot columns follow price_unit.
      return `₹${priceSummary.min}${showsPriceBands(turf) ? priceSummary.unit : priceUnitSuffix(turf, { short: true })}`;
    }
    // No price: a well reviewed Google rating is the next thing a
    // searcher checks before clicking.
    if (hasRatings && turf.total_reviews >= 10 && Number(turf.rating) >= 3.5 && turfTypeShort)
      return `${turfTypeShort}, ${Number(turf.rating).toFixed(1)}★`;
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
  const place = cityLabel ?? area ?? "";
  const candidates = [
    cityAndArea ? `${displayName} ${cityAndArea} – ${usp}` : `${displayName} – ${usp}`,
    place ? `${displayName} ${place} – ${usp}` : null,
    turfTypeShort && turfTypeShort !== usp ? `${displayName}${place ? ` ${place}` : ""} – ${turfTypeShort}` : null,
    cityAndArea ? `${displayName} ${cityAndArea}` : null,
    place ? `${displayName}, ${place}` : displayName,
  ];
  const title =
    candidates.find((t): t is string => !!t && t.length <= MAX) ??
    (place ? `${truncateWords(displayName, MAX - place.length - 2)}, ${place}` : truncateWords(displayName, MAX));

  const photoCount = turf.images?.length ?? 0;
  const photoClause = photoCount > 0 ? ` ${photoCount} photo${photoCount === 1 ? "" : "s"}.` : "";
  const locationClause = cityAndArea ? ` in ${cityAndArea}` : "";
  // Promise prices only when the page has some (1,608 turfs had none on 26 Oct).
  const seeClause = priceSummary.kind === "unknown" ? "See timings, photos and location" : "See prices, timings, photos and location";
  // Only the channels the page offers: a landline-only turf gets Call
  // alone ("Landline, so no WhatsApp"), 5 active turfs on 26 Oct.
  const canCall = !!getPhone(turf);
  const canWhatsApp = !!getWhatsAppPhone(turf);
  const contactClause =
    canCall && canWhatsApp ? ", then call or WhatsApp to book" : canCall ? ", then call to book" : canWhatsApp ? ", then WhatsApp to book" : "";

  // Lead with the venue's name and place: most searches for these pages
  // are the venue's name, and Google bolds the words that match.
  return {
    title,
    description:
      `${displayName}${cityAndArea ? `, ${cityAndArea}` : ""}: ${(turfType ?? (sports || "sports turf")).toLowerCase()}.` +
      (turfType && sports ? ` Sports: ${sports}.` : "") +
      `${priceClause}${hours ? ` ${hours}.` : ""}${ratingClause}${photoClause}` +
      ` ${seeClause}${contactClause}.`,
    keywords: [
      turf.name,
      area ? `turf in ${area.toLowerCase()}` : null,
      cityLabel ? `turf in ${cityLabel.toLowerCase()}` : null,
      cityLabel ? `${cityLabel.toLowerCase()} turf booking` : null,
      ...turf.sports.map((s) => `${s.toLowerCase()} ${sportPageForLabel(s)?.venue ?? "turf"}${cityLabel ? ` ${cityLabel.toLowerCase()}` : ""}`),
      cityHash,
    ].filter(Boolean).join(", "),
    openGraph: {
      title: cityAndArea ? `${turf.name}, ${cityAndArea}` : turf.name,
      description: `${sports || "Multi-sport"}${locationClause}.${priceClause}${ratingClause}`,
      url: turfUrl(turf),
      // No width/height: stored photos are 4:3 (1600x1200 and the like),
      // and the old 1200x630 told crawlers the wrong shape.
      ...(firstImage && {
        images: [{ url: firstImage }],
      }),
      type: "website",
      locale: "en_IN",
      siteName: "TapTurf",
    },
    alternates: { canonical: turfUrl(turf) },
  };
}

export default async function TurfDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const key = decodeURIComponent(id);
  // One call for the turf, claim, trending pick, reviews, suggestions and
  // games (shared with generateMetadata above).
  const page = await loadTurfPage(key);
  if (!page) notFound();
  const { turf, claimed } = page;
  if (turf.slug && key !== turf.slug) permanentRedirect(turfPath(turf));

  const phone = getPhone(turf);
  const whatsappPhone = getWhatsAppPhone(turf);
  // A WhatsApp number alone is a way to reach the turf too (an owner who
  // saved only "WhatsApp number for bookings").
  const hasContact = !!(phone || whatsappPhone);
  const contact = { call: !!phone, whatsapp: !!whatsappPhone };
  const sidebarPrice = summarisePagePrice(turf);
  // Rates players shared (From players): the Pricing section points to
  // them when the turf lists none.
  const playerPrice = sidebarPrice.kind === "unknown" ? playerPriceRange(page.suggestions) : null;
  // The research pass wrote "It is publicly bookable on Playo." into
  // 1,509 descriptions; the page links to no booking app.
  const description = stripBookingClaims(turf.description);
  const hoursLine = dailyHoursSummary(turf.opening_hours, {
    start_time: turf.start_time,
    end_time: turf.end_time,
    is_24x7: turf.is_24x7,
  });
  // Members-only clubs (NIWEC): no "Call to Book", show how to get in.
  const membersOnly = turf.membership_required === true;
  // Is this turf its city's Most Trending Turf this week?
  const trending = turf.city && isCity(turf.city) ? page.trending : null;
  const isTrending = !!trending;

  return (
    <div className="has-bottom-cta">
      <TurfJsonLd turf={turf} />
      <NoteInterest city={turf.city} sports={turf.sports} turfId={turf.id} />

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
          {claimed && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 h-6 text-[12px] font-semibold text-accent-700">
              <BadgeCheck className="w-3.5 h-3.5" /> Managed by the owner
            </p>
          )}
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

          {/* Price and hours up front: on a phone the booking card is at
              the bottom of the page, and these are what a searcher came for. */}
          <p className="mt-2 text-[14px] text-primary-600 lg:hidden">
            <span className="font-semibold text-primary-800">
              {sidebarPrice.kind === "real" || sidebarPrice.kind === "reported"
                ? sidebarPrice.label
                : sidebarPrice.kind === "reported_text"
                  ? "Reported prices below"
                  : "Prices not listed yet"}
            </span>
            {hoursLine && <> · {hoursLine}</>}
          </p>

          <div className="mt-3 md:hidden">
            <AskAboutButton />
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
            {description && (
              <div className="section-divider">
                <p className="text-base text-primary-600 leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
                  {description}
                </p>
              </div>
            )}

            <TurfAmenities turf={turf} />
            <TurfDetails turf={turf} />
            <TurfPricing turf={turf} claimed={claimed} contact={contact} playerPrice={playerPrice} />

            {/* Upcoming games here, with "Host a game here" right below. */}
            <TurfGames
              turfId={turf.id}
              turfName={turf.name}
              initialGames={page.games}
              renderedAt={page.renderedAt}
            />

            {/* Player-suggested info (contact, prices, hours, facilities).
                In the HTML; the browser reloads it only after the
                visitor's own suggestion, so theirs shows at once. */}
            <TurfSuggestions
              turfId={turf.id}
              turfName={turf.name}
              hasPhone={hasContact}
              turfUrl={turfUrl(turf)}
              initial={page.suggestions}
            />
            {claimed ? (
              <p className="mt-3 text-[13px] text-primary-500">
                Also manage this turf?{" "}
                <Link href={`/my?claim=${turf.id}`} className="font-semibold text-accent-700 hover:text-accent-800" prefetch={false}>
                  Request access
                </Link>
              </p>
            ) : (
              <div className="mt-6 rounded-2xl border border-primary-200 bg-white p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary-900">Is this your turf?</p>
                  <p className="mt-0.5 text-[14px] text-primary-600 leading-snug">
                    Claim this listing to see how many players view and call you, and keep your prices and hours right. Free.
                    Have the phone with the number on this page? A code to it gets you in at once.
                  </p>
                </div>
                <Link
                  href={`/my?claim=${turf.id}`}
                  prefetch={false}
                  className="press-tight shrink-0 inline-flex items-center justify-center h-11 px-5 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[14px] font-semibold transition-colors"
                >
                  Claim this listing
                </Link>
              </div>
            )}

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
              initialReviews={page.reviews}
              initialSummary={page.reviewStats}
              googleRating={turf.rating}
              googleReviewCount={turf.total_reviews}
              googleReviewUrl={turf.external_review_url}
              playersSay={turf.review_summary ?? null}
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
                      Prices not listed yet
                    </span>
                    <p className="text-[13px] text-primary-500 mt-1">
                      {playerPrice
                        ? `${playerPrice.count === 1 ? "A player reports" : "Players report"} ${priceRangeText(playerPrice.min, playerPrice.max)} an hour, see From players`
                        : (slotRatesHint(contact) ?? "Contact details not listed yet")}
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
              {hasContact ? (
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
              <p className="text-xs text-center text-primary-300 mt-2">
                Own this turf or spotted a mistake?{" "}
                <a href={CONTACT_MAILTO} className="underline underline-offset-2 hover:text-primary-500">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="lg:hidden mb-24" />
      </div>

      <AskPageContext turf={{ id: turf.id, name: turf.name }} city={isCity(turf.city) ? turf.city : null} />

      {/* Mobile fixed CTA: Call / WhatsApp, or the "we don't have
          the number yet" bar that opens the suggest form. */}
      {hasContact ? (
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
  return unShout(name)
    .replace(/\s*\([^)]*\)/g, "")
    .split(/\s*[|/]\s*/)[0]
    .replace(/\s*(?:-|–|,)?\s*best turf.*$/i, "")
    // "… Turf Cricket, Football Etc": a bare sport list tacked on the end
    .replace(/(\bturf)\s+(?:box cricket|cricket|football)(?:[,\s]+(?:box cricket|cricket|football|etc\.?))*$/i, "$1")
    .replace(/\s{2,}/g, " ")
    .trim() || name;
}

/**
 * "PLAYMAKERS SOCCER FIELD" reads as shouting in a search result. A name
 * that is all capitals is shown in title case; short words that look like
 * initials (FC, BCFC, KSR) stay as they are.
 */
function unShout(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8 || letters !== letters.toUpperCase()) return name;
  return name.replace(/[A-Za-z]+/g, (w) => (w.length <= 4 ? w : w[0] + w.slice(1).toLowerCase()));
}

/** Cut at a word boundary to at most `max` chars, without a trailing ellipsis. */
function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : s.slice(0, max))
    .replace(/(?:\s+(?:and|&|the|of|in|at))?[\s,–-]*$/i, "");
}

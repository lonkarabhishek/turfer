import type { Metadata } from "next";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { AskAboutButton } from "@/components/ask/AskAboutButton";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ChevronRight, Flame, KeyRound, MapPin, Star } from "lucide-react";
import { getTopTurfKeys } from "@/lib/queries/turfs";
import { loadTurfPage } from "@/lib/queries/turfPage";
import { getTurfManagers } from "@/lib/queries/turfManagers";
import { NO_MANAGERS } from "@/lib/turfPage/managers";
import { ownerPriceNote, ownerPriceText } from "@/lib/turfPage/owner";
import { turfPath, turfUrl } from "@/lib/utils/turfPath";
import { playerPriceRange, positivePrice, priceRangeText, summarisePagePrice } from "@/lib/utils/prices";
import { getPhone, getWhatsAppPhone, turfContact } from "@/lib/utils/seo";
import { normPlace, turfMeta } from "@/lib/seo/turfMeta";
import { sharedNameKey } from "@/lib/seo/turfFacts";
import { getTurfFacts, sharedNameSet } from "@/lib/queries/turfFacts";
import { OG_BASE, ROBOTS_NOINDEX_FOLLOW, TWITTER_CARD } from "@/lib/seo/defaults";
import { googleMapsUrl, scrubBookingApps } from "@/lib/utils/bookingApps";
import { playersSayOf } from "@/lib/reviews/playersSay";
import { areaFor } from "@/lib/utils/area";
import { dailyHoursSummary } from "@/lib/utils/hours";
import { labelFor, isCity } from "@/lib/city";
import { TurfImageGallery } from "@/components/turf/TurfImageGallery";
import { TurfPricing, slotRatesHint } from "@/components/turf/TurfPricing";
import { TurfDetails } from "@/components/turf/TurfDetails";
import { TurfAmenities } from "@/components/turf/TurfAmenities";
import { TurfMap } from "@/components/turf/TurfMap";
import { TurfJsonLd } from "@/components/turf/TurfJsonLd";
import { TurfReviews } from "@/components/turf/TurfReviews";
import { OwnerBadge } from "@/components/turf/OwnerBadge";
import { OwnerInvite, OwnerPanel } from "@/components/turf/OwnerPanel";
import { OwnerMark } from "@/components/turf/OwnerMark";
import { ClaimHint, ClaimInvite } from "@/components/turf/ClaimInvite";
import { CTAButtons } from "@/components/ui/CTAButtons";
import { CreateGameHereButton } from "@/components/turf/CreateGameHereButton";
import { TurfGames } from "@/components/turf/TurfGames";
import { sportPageForLabel } from "@/lib/sports";
import { TurfSuggestions, NoContactNotice } from "@/components/turf/TurfSuggestions";
import { NoteInterest } from "@/components/analytics/VisitTracker";

// A day: since the 20 Oct outage the cache queue purges a turf's page
// when the turf, its reviews or their votes, suggestions, games, claim or
// trending pick change, so the timer is only a backstop. A refresh is one
// turf_page call, plus one turf_managers call on a claimed turf (the
// "Managed by @name" line; the queue also purges the page when one of its
// managers changes their username or tagging switch, see
// 20261028_turf_managers.sql). Nothing the page renders may be cached for
// less than a day, or the page refreshes that often (the footer has its
// own day-long city list for this reason, see getFooterCities).
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
  const page = await loadTurfPage(decodeURIComponent(id));
  const turf = page?.turf;
  if (!page || !turf) return { title: "Turf not found", robots: ROBOTS_NOINDEX_FOLLOW };

  // Title, description and share card from the turf's own facts
  // (lib/seo/turfMeta.ts): the listed prices, hours, photos, Google
  // rating and TapTurf player reports, and only the contact channels
  // the page shows. A name another turf in the city shares keeps its
  // area in the title (a day-long copy of the names, lib/queries/turfFacts.ts).
  const nameShared = sharedNameSet(await getTurfFacts()).has(sharedNameKey(turf.name, isCity(turf.city) ? turf.city : null));
  const meta = turfMeta({ turf, contact: turfContact(turf), reports: page.reviewStats, nameShared });
  const cityLabel = meta.cityLabel;
  const area = areaFor(turf);

  return {
    title: { absolute: meta.title },
    description: meta.description,
    keywords: [
      turf.name,
      area ? `turf in ${area.toLowerCase()}` : null,
      cityLabel ? `turf in ${cityLabel.toLowerCase()}` : null,
      ...turf.sports.map((s) => `${s.toLowerCase()} ${sportPageForLabel(s)?.venue ?? "turf"}${cityLabel ? ` ${cityLabel.toLowerCase()}` : ""}`),
    ].filter(Boolean).join(", "),
    openGraph: {
      ...OG_BASE,
      title: meta.title,
      description: meta.description,
      url: turfUrl(turf),
      // No width/height on a turf photo: stored photos are 4:3
      // (1600x1200 and the like). The site card when there is none, so
      // a turf without photos still has a share image.
      images: [meta.ogImage],
    },
    twitter: TWITTER_CARD,
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
  // Who runs a claimed turf, by username, for "by @name" under the name
  // and the Claimed turf panel. Read only for claimed turfs; never fails
  // the page (no names; a read that failed for now keeps this copy a
  // minute, not a day).
  const managers = claimed ? await getTurfManagers(turf.id) : NO_MANAGERS;
  // The owner's own prices on a claimed turf, dated in India by when they
  // last set them (null otherwise). Dated against this render: the page
  // lives a day at most, so "last set" may turn a day late, never early.
  const priceNote = ownerPriceNote(turf, claimed, page.renderedAt);

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
  // The rates a game report offers first ("What did you pay for an hour?"): the
  // listed ones, when they are per hour; else the sheet offers players' own range.
  const reportPrices =
    sidebarPrice.kind === "real" && (!turf.price_unit || turf.price_unit === "per_hour")
      ? { morning: positivePrice(turf.morning_price), afternoon: positivePrice(turf.afternoon_price), evening: positivePrice(turf.evening_price), min: sidebarPrice.min }
      : null;
  // The research pass wrote "It is publicly bookable on Playo." into
  // 1,509 descriptions; the page names, links and shows no booking app
  // (lib/utils/bookingApps.ts), whatever the row says.
  const description = scrubBookingApps(turf.description);
  const accessNotes = scrubBookingApps(turf.access_notes);
  // "Read them on Google" goes to Google Maps only.
  const googleReviewUrl = googleMapsUrl(turf.external_review_url);
  // "What players say" is made from reviews, which can name an app (Ask reads it the same way),
  // and is shown only while the live reports back it: a removed report's words never stay.
  const playersSay = playersSayOf(turf.review_summary, page.reviews);
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
  // The H1 is the name people search (seoName): Google reuses it when it
  // rewrites a title. The listed name stays on the address line.
  const meta = turfMeta({ turf, contact, reports: page.reviewStats });
  const listedName = turf.name.trim();
  const cityId = isCity(turf.city) ? turf.city : null;

  return (
    <div className="has-bottom-cta">
      <TurfJsonLd turf={turf} reviewStats={page.reviewStats} reviews={page.reviews} managerIds={page.managerIds} />
      <NoteInterest city={turf.city} sports={turf.sports} turfId={turf.id} />

      {/* Breadcrumb */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-1.5 text-sm text-primary-400 overflow-x-auto scrollbar-hide">
        <Link href="/" className="hover:text-primary-600 transition-colors whitespace-nowrap">
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        {/* Home › City › name, as the BreadcrumbList JSON-LD says. */}
        <Link href={cityId ? `/${cityId}` : "/turfs"} className="hover:text-primary-600 transition-colors whitespace-nowrap">
          {cityId ? labelFor(cityId) : "Turfs"}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-cream-400" />
        <span className="text-primary-700 font-medium truncate">{meta.name}</span>
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
            {meta.name}
          </h1>
          {/* Claimed, and by whom; it jumps to the panel that says what it means. */}
          {claimed && <OwnerBadge managers={managers} />}
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
              {/* The listed name only when the H1 dropped or changed words, not just their case. */}
              {normPlace(meta.name) !== normPlace(listedName) ? `${listedName}, ${turf.address}` : turf.address}
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
            {sidebarPrice.kind === "real" && priceNote && (
              <span className="text-primary-500">
                , from the owner
                {/* Dated when old, as the sidebar and Pricing say it (the date kept whole). */}
                {priceNote.stale && priceNote.date && (
                  <>
                    {" "}
                    (last set <span className="whitespace-nowrap">{priceNote.date}</span>)
                  </>
                )}
              </span>
            )}
            {/* No line break inside a time range ("5:00 AM – 12:00 AM"); the line may break between ranges. */}
            {hoursLine && <> · {hoursLine.replace(/\d{1,2}:\d{2} [AP]M – \d{1,2}:\d{2} [AP]M/g, (r) => r.replace(/ /g, "\u00a0"))}</>}
          </p>

          <div className="mt-3 md:hidden">
            <AskAboutButton />
          </div>

          {/* Members-only clubs: say so up front, with the access rules. */}
          {(membersOnly || accessNotes) && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200/70 px-4 py-3">
              <KeyRound className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {membersOnly && (
                  <p className="text-[14px] font-semibold text-amber-900">Members&apos; club</p>
                )}
                {accessNotes && (
                  <p className="text-[14px] text-amber-900/85 leading-snug">{accessNotes}</p>
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

          {/* An unclaimed turf: one quiet line for its owner, down to the invite. */}
          {!claimed && <ClaimHint />}
        </div>

        {/* Image gallery */}
        <TurfImageGallery images={turf.images} />

        {/* Main content + sidebar */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          {/* Left content */}
          <div>
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
            <TurfPricing turf={turf} claimed={claimed} contact={contact} playerPrice={playerPrice} priceNote={priceNote} />

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
              turfName={turf.name}
              slug={turf.slug || turf.id}
              sports={turf.sports ?? []}
              claimed={claimed}
              initialReviews={page.reviews}
              initialSummary={page.reviewStats}
              reviewAspects={page.reviewAspects}
              playAgain={page.playAgain}
              listedPrices={reportPrices}
              playerPrice={playerPriceRange(page.suggestions)}
              googleRating={turf.rating}
              googleReviewCount={turf.total_reviews}
              googleReviewUrl={googleReviewUrl}
              playersSay={playersSay}
            />

            {/* The owner's lines come last, after the map and the reviews
                players came for. An unclaimed turf: the invite for its owner
                (ClaimHint under the sport chips jumps here). A claimed turf:
                what Claimed means and who runs it (the badge under the
                name jumps here; last, as the owner asked on 29 Oct), then one
                line for the owner of another turf, and no "request access"
                link (its owner adds people). */}
            {!claimed && <ClaimInvite turfId={turf.id} turfName={meta.name} />}
            {claimed && (
              <>
                <OwnerPanel managers={managers} priceNote={priceNote} className="mt-10" />
                <OwnerInvite />
              </>
            )}
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
                    {priceNote && (
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-accent-800">
                        <OwnerMark size={14} />
                        {ownerPriceText(priceNote, "short")}
                      </p>
                    )}
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
                    {accessNotes || "Booking is for members. Call to ask about guest access."}
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
                  pageUrl={turfUrl(turf)}
                />
              ) : (
                <NoContactNotice />
              )}

              {/* Host their own game at this turf — jumps into the
                  create-game wizard with this turf pre-selected. */}
              <CreateGameHereButton turfId={turf.id} turfName={turf.name} />

              {!membersOnly && (
                <p className="text-xs text-center text-primary-500 mt-4">
                  No booking fee. Contact turf directly to reserve your slot.
                </p>
              )}
              <p className="text-xs text-center text-primary-500 mt-2 leading-relaxed">
                {!claimed && (
                  <>
                    Own this turf?{" "}
                    <a href="#claim" className="font-semibold text-accent-800 hover:underline underline-offset-2">
                      Claim it free
                    </a>
                    {" · "}
                  </>
                )}
                Spotted a mistake?{" "}
                <a href={CONTACT_MAILTO} className="underline underline-offset-2 hover:text-primary-800">
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
          pageUrl={turfUrl(turf)}
        />
      ) : (
        <NoContactNotice variant="fixed-bottom" />
      )}
    </div>
  );
}

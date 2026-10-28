import type { Turf } from "../../types/turf";
import type { ReviewSummary, ReviewWithUser } from "../../types/review";
import { summarisePagePrice } from "./prices";
import { isOwnPhoto, normalizeImageUrl, orderPhotos } from "./images";
import { googleMapsUrl, publicLink, scrubBookingApps } from "./bookingApps";
import { guessCityFromAddress, isCity, labelFor, stateFor } from "../city";
import { normalizeIndianMobile, normalizeIndianPhone } from "./phone";
import { openingHoursJsonLd } from "./hours";
import { turfUrl } from "./turfPath";
import { areaFor } from "./area";
import { displayArea, turfMeta } from "../seo/turfMeta";
import { AGGREGATE_RATING_MIN_REPORTS } from "../seo/defaults";

// Relative imports only, so node --test runs this (lib/utils/seo.test.ts).

/** What turf_page knows besides the row: TapTurf players' reports. */
export interface TurfJsonLdExtra {
  /** turf_page review_stats: live TapTurf reports only (source null, status live). */
  reviewStats?: ReviewSummary | null;
  /** turf_page reviews: the latest 20 live ones, TapTurf's and Google's. */
  reviews?: readonly ReviewWithUser[] | null;
  /** Accounts that manage the turf (turfs.owner_id): their reports never reach the markup. */
  managerIds?: readonly string[] | null;
}

/** The page's Call and WhatsApp buttons, for templates that name the channel. */
export function turfContact(turf: Turf): { call: boolean; whatsapp: boolean } {
  return { call: !!getPhone(turf), whatsapp: !!getWhatsAppPhone(turf) };
}

export function generateTurfJsonLd(turf: Turf, extra: TurfJsonLdExtra = {}) {
  const contact = turfContact(turf);
  const meta = turfMeta({ turf, contact, reports: extra.reviewStats });
  // The rate the page's own Pricing table shows (listed bands or slot
  // columns), so priceRange never states a rate missing from the page.
  const pagePrice = summarisePagePrice(turf);
  const minPrice = pagePrice.kind === "real" ? pagePrice.min : null;
  const maxPrice = pagePrice.kind === "real" ? pagePrice.max : null;
  const phone = getPhone(turf);
  // Our own copies first; when we have any, the Google links (which
  // expire, see orderPhotos) are left out. No photos, no image field.
  // orderPhotos leaves out booking apps' photos.
  const photos = orderPhotos(turf.images ?? []);
  const own = photos.filter(isOwnPhoto);
  const image = (own.length ? own : photos).slice(0, 5).map((img) => normalizeImageUrl(img));
  // Locality follows the turf's own city, then its address; with
  // neither on record the address carries no locality rather than a
  // guessed one (a wrong locality is worse for rich results than none).
  const cityId = isCity(turf.city) ? turf.city : guessCityFromAddress(turf.address);
  const locality = cityId ? labelFor(cityId) : null;
  // Stars in search come only from TapTurf's own players: Google's
  // review-snippet rules want ratings the site collected itself, so the
  // Google Maps rating (turf.rating, total_reviews) is never marked up.
  // From AGGREGATE_RATING_MIN_REPORTS live reports on, the same count and
  // average the page's TapTurf score shows (no turf had 5 on 28 Oct).
  //
  // review_save refuses a report from an account that manages the turf,
  // but one written before the claim stays live, and turf_page counts it
  // in review_stats. While such a report is among the reviews, the count
  // and average include the owner's own stars: no rating markup at all
  // (the source fix is turf_page leaving managers' reports out).
  const stats = extra.reviewStats;
  const managers = new Set((extra.managerIds ?? []).filter(Boolean));
  const managerReported = (extra.reviews ?? []).some((r) => !r.source && managers.has(r.user_id));
  const firstParty =
    !managerReported && stats && stats.count >= AGGREGATE_RATING_MIN_REPORTS && stats.average >= 1 && stats.average <= 5 ? stats : null;
  const ownReviews = firstParty
    ? (extra.reviews ?? [])
        .filter((r) => !r.source && !managers.has(r.user_id) && typeof r.comment === "string" && !!r.comment.trim() && r.rating >= 1 && r.rating <= 5)
        .slice(0, 5)
    : [];
  // Where it is, for the fallback description: area and city as the page shows them.
  const where = [...new Set([displayArea(areaFor(turf)), locality].filter((x): x is string => !!x))].join(", ");
  const reach = contact.call && contact.whatsapp ? " Call or WhatsApp the turf." : contact.call ? " Call the turf." : contact.whatsapp ? " WhatsApp the turf." : "";
  const normalizedPhone = normalizeIndianPhone(phone);
  // Real prices only — reviewer-reported price_mentions must never
  // land in JSON-LD priceRange (Google treats it as our price).
  const hasRealPriceRange = minPrice != null && maxPrice != null;

  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": turfUrl(turf),
    name: meta.name,
    ...(meta.name !== turf.name.trim() && { alternateName: turf.name.trim() }),
    description: scrubBookingApps(turf.description) || `${meta.type}${where ? ` in ${where}` : ""}.${reach}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: turf.address,
      ...(locality && { addressLocality: locality }),
      addressRegion: stateFor(cityId),
      addressCountry: "IN",
    },
    ...(turf.lat != null && turf.lng != null && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: turf.lat,
        longitude: turf.lng,
      },
    }),
    ...(firstParty && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: firstParty.average,
        ratingCount: firstParty.count,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    ...(ownReviews.length > 0 && {
      review: ownReviews.map((r) => ({
        "@type": "Review",
        author: { "@type": "Person", name: r.user_name?.trim() || "TapTurf player" },
        ...(r.created_at && { datePublished: r.created_at.slice(0, 10) }),
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        reviewBody: (r.comment ?? "").trim(),
      })),
    }),
    ...(hasRealPriceRange && {
      priceRange: minPrice === maxPrice ? `₹${minPrice}` : `₹${minPrice}–₹${maxPrice}`,
    }),
    ...(image.length > 0 && { image }),
    ...(normalizedPhone && { telephone: normalizedPhone.e164 }),
    ...(() => {
      // A WhatsApp link or group invite stored as the website is not the
      // venue's own page, and neither is a booking app's page for it
      // (playspots.in, link.district.in): sameAs is the venue elsewhere,
      // and TapTurf links to no booking app. The review link is Google
      // Maps only.
      const sameAs = [googleMapsUrl(turf.external_review_url), publicLink(turf.website_url), publicLink(turf.instagram_url)].filter(
        (u): u is string => u != null && !/^https?:\/\/(?:[\w-]+\.)?(?:wa\.me|whatsapp\.com)\b/i.test(u),
      );
      return sameAs.length ? { sameAs } : {};
    })(),
    url: turfUrl(turf),
    // Prefer per-day opening_hours (jsonb) so Sunday-closed turfs and
    // split shifts get their own spec entries; fall back to the old
    // single-window start_time / end_time. Day keys in any case.
    ...(() => {
      const spec = openingHoursJsonLd(turf.opening_hours, {
        start_time: turf.start_time,
        end_time: turf.end_time,
        is_24x7: turf.is_24x7,
      });
      return spec ? { openingHoursSpecification: spec } : {};
    })(),
  };
}

/** Home › {City} › {name}: the city page is the turf's parent (Home › Turfs when the row has no city). */
export function generateBreadcrumbJsonLd(turf: Turf) {
  const name = turfMeta({ turf, contact: turfContact(turf) }).name;
  const city = isCity(turf.city) ? turf.city : null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tapturf.in" },
      city
        ? { "@type": "ListItem", position: 2, name: labelFor(city), item: `https://www.tapturf.in/${city}` }
        : { "@type": "ListItem", position: 2, name: "Turfs", item: "https://www.tapturf.in/turfs" },
      { "@type": "ListItem", position: 3, name, item: turfUrl(turf) },
    ],
  };
}

/**
 * The first phone number on the turf that is actually dialable
 * (mobile or STD landline). A column holding junk counts as no phone,
 * so the page shows "Suggest contact" instead of an empty button bar.
 */
export function getPhone(turf: Turf): string | null {
  return (
    [turf.owner_phone, turf.contact_info?.phone, turf.landline_phone].find((p) => normalizeIndianPhone(p)) ??
    null
  );
}

/** Number for the WhatsApp button: whatsapp_phone if set, else the call number when it is a mobile. */
export function getWhatsAppPhone(turf: Turf): string | null {
  return (
    [turf.whatsapp_phone, turf.owner_phone, turf.contact_info?.phone].find((p) => normalizeIndianMobile(p)) ?? null
  );
}

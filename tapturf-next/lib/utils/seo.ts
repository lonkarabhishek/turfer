import type { Turf } from "@/types/turf";
import { summarisePagePrice } from "./prices";
import { isOwnPhoto, normalizeImageUrl, orderPhotos } from "./images";
import { stripBookingClaims } from "./bookingClaims";
import { guessCityFromAddress, isCity, labelFor, stateFor } from "@/lib/city";
import { normalizeIndianMobile, normalizeIndianPhone } from "./phone";
import { openingHoursJsonLd } from "./hours";
import { turfUrl } from "./turfPath";

export function generateTurfJsonLd(turf: Turf) {
  // The rate the page's own Pricing table shows (listed bands or slot
  // columns), so priceRange never states a rate missing from the page.
  const pagePrice = summarisePagePrice(turf);
  const minPrice = pagePrice.kind === "real" ? pagePrice.min : null;
  const maxPrice = pagePrice.kind === "real" ? pagePrice.max : null;
  const phone = getPhone(turf);
  // Our own copies first; when we have any, the Google links (which
  // expire, see orderPhotos) are left out. No photos, no image field.
  const photos = orderPhotos(turf.images ?? []);
  const own = photos.filter(isOwnPhoto);
  const image = (own.length ? own : photos).slice(0, 5).map((img) => normalizeImageUrl(img));
  // Locality follows the turf's own city, then its address; with
  // neither on record the address carries no locality rather than a
  // guessed one (a wrong locality is worse for rich results than none).
  const cityId = isCity(turf.city) ? turf.city : guessCityFromAddress(turf.address);
  const locality = cityId ? labelFor(cityId) : null;
  // Only emit aggregateRating when we actually have ratings — a null
  // rating masquerading as 0.0 hurts SERP trust.
  const hasRatings =
    typeof turf.rating === "number" &&
    turf.rating > 0 &&
    typeof turf.total_reviews === "number" &&
    turf.total_reviews > 0;
  const normalizedPhone = normalizeIndianPhone(phone);
  // Real prices only — reviewer-reported price_mentions must never
  // land in JSON-LD priceRange (Google treats it as our price).
  const hasRealPriceRange = minPrice != null && maxPrice != null;

  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": turfUrl(turf),
    name: turf.name,
    description:
      stripBookingClaims(turf.description) || `Book ${turf.name} for sports${locality ? ` in ${locality}` : ""}.`,
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
    ...(hasRatings && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: turf.rating,
        reviewCount: turf.total_reviews,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    ...(hasRealPriceRange && {
      priceRange: minPrice === maxPrice ? `₹${minPrice}` : `₹${minPrice}–₹${maxPrice}`,
    }),
    ...(image.length > 0 && { image }),
    ...(normalizedPhone && { telephone: normalizedPhone.e164 }),
    ...(() => {
      // A WhatsApp link or group invite stored as the website is not the
      // venue's own page.
      const sameAs = [turf.external_review_url, turf.website_url, turf.instagram_url].filter(
        (u): u is string =>
          typeof u === "string" && /^https?:\/\//.test(u) && !/^https?:\/\/(?:[\w-]+\.)?(?:wa\.me|whatsapp\.com)\b/i.test(u),
      );
      return sameAs.length ? { sameAs } : {};
    })(),
    url: turfUrl(turf),
    // Prefer per-day opening_hours (jsonb) so Sunday-closed turfs and
    // split shifts get their own spec entries; fall back to the old
    // single-window start_time / end_time.
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

export function generateBreadcrumbJsonLd(turf: Turf) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.tapturf.in",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Turfs",
        item: "https://www.tapturf.in/turfs",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: turf.name,
        item: turfUrl(turf),
      },
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

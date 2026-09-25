import type { Turf } from "@/types/turf";
import { getMinimumPrice, getMaximumPrice } from "./prices";
import { normalizeImageUrl } from "./images";
import { isCity, labelFor } from "@/lib/city";
import { normalizeIndianPhone } from "./phone";
import { openingHoursJsonLd } from "./hours";

export function generateTurfJsonLd(turf: Turf) {
  const minPrice = getMinimumPrice(turf);
  const maxPrice = getMaximumPrice(turf);
  const phone = getPhone(turf);
  // City-aware locality — was hard-coded "Nashik", so Pune turfs were
  // being served with the wrong locality in structured data.
  const locality = isCity(turf.city) ? labelFor(turf.city) : "Nashik";
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
    "@id": `https://www.tapturf.in/turf/${turf.id}`,
    name: turf.name,
    description:
      turf.description || `Book ${turf.name} for sports in ${locality}.`,
    address: {
      "@type": "PostalAddress",
      streetAddress: turf.address,
      addressLocality: locality,
      addressRegion: "Maharashtra",
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
    image: turf.images
      ?.slice(0, 5)
      .map((img) => normalizeImageUrl(img)),
    ...(normalizedPhone && { telephone: normalizedPhone.e164 }),
    ...(turf.external_review_url && { sameAs: [turf.external_review_url] }),
    url: `https://www.tapturf.in/turf/${turf.id}`,
    // Prefer per-day opening_hours (jsonb) so Sunday-closed turfs and
    // split shifts get their own spec entries; fall back to the old
    // single-window start_time / end_time.
    ...(() => {
      const spec = openingHoursJsonLd(turf.opening_hours, {
        start_time: turf.start_time,
        end_time: turf.end_time,
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
        item: `https://www.tapturf.in/turf/${turf.id}`,
      },
    ],
  };
}

/**
 * Extracts the best available phone number from a turf
 */
export function getPhone(turf: Turf): string | null {
  if (turf.owner_phone) return turf.owner_phone;
  if (turf.contact_info?.phone) return turf.contact_info.phone;
  return null;
}

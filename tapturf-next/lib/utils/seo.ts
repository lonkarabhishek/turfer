import type { Turf } from "@/types/turf";
import { getMinimumPrice, getMaximumPrice } from "./prices";
import { convertGoogleDriveUrl } from "./images";

export function generateTurfJsonLd(turf: Turf) {
  const minPrice = getMinimumPrice(turf);
  const maxPrice = getMaximumPrice(turf);
  const phone = getPhone(turf);

  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: turf.name,
    description:
      turf.description || `Book ${turf.name} for sports in Nashik.`,
    address: {
      "@type": "PostalAddress",
      streetAddress: turf.address,
      addressLocality: "Nashik",
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    },
    ...(turf.total_reviews > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: turf.rating,
        reviewCount: turf.total_reviews,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    priceRange: `₹${minPrice} - ₹${maxPrice}`,
    image: turf.images
      ?.slice(0, 5)
      .map((img) => convertGoogleDriveUrl(img)),
    ...(phone && { telephone: phone }),
    url: `https://www.tapturf.in/turf/${turf.id}`,
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: turf.start_time || "06:00",
      closes: turf.end_time || "23:00",
    },
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

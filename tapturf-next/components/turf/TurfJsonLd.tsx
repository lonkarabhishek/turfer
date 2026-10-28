import type { Turf } from "@/types/turf";
import type { ReviewSummary, ReviewWithUser } from "@/types/review";
import { generateTurfJsonLd, generateBreadcrumbJsonLd } from "@/lib/utils/seo";
import { jsonLdHtml } from "@/lib/seo/jsonLd";

export function TurfJsonLd({
  turf,
  reviewStats,
  reviews,
}: {
  turf: Turf;
  /** TapTurf players' live reports: an AggregateRating from 5 of them. */
  reviewStats?: ReviewSummary | null;
  reviews?: readonly ReviewWithUser[] | null;
}) {
  const turfSchema = generateTurfJsonLd(turf, { reviewStats, reviews });
  const breadcrumbSchema = generateBreadcrumbJsonLd(turf);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(turfSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbSchema) }}
      />
    </>
  );
}

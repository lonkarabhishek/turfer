import type { Turf } from "@/types/turf";
import type { ReviewSummary, ReviewWithUser } from "@/types/review";
import { generateTurfJsonLd, generateBreadcrumbJsonLd } from "@/lib/utils/seo";
import { jsonLdHtml } from "@/lib/seo/jsonLd";

export function TurfJsonLd({
  turf,
  reviewStats,
  reviews,
  managerIds,
}: {
  turf: Turf;
  /** TapTurf players' live reports: an AggregateRating from 5 of them. */
  reviewStats?: ReviewSummary | null;
  reviews?: readonly ReviewWithUser[] | null;
  /** Accounts that manage the turf: their reports never reach the markup. */
  managerIds?: readonly string[] | null;
}) {
  const turfSchema = generateTurfJsonLd(turf, { reviewStats, reviews, managerIds });
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

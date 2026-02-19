import type { Turf } from "@/types/turf";
import { generateTurfJsonLd, generateBreadcrumbJsonLd } from "@/lib/utils/seo";

export function TurfJsonLd({ turf }: { turf: Turf }) {
  const turfSchema = generateTurfJsonLd(turf);
  const breadcrumbSchema = generateBreadcrumbJsonLd(turf);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(turfSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}

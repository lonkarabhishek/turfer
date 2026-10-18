import { CITY_PREPAINT_JS } from "@/lib/cityPrePaint";

/** First child of <head>: sets data-city-* on <html> before the first paint. */
export function CityPrePaint() {
  return <script dangerouslySetInnerHTML={{ __html: CITY_PREPAINT_JS }} />;
}

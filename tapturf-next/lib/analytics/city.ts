/**
 * GA4 events for city personalisation. Same gtag the rest of the site
 * uses; no new provider. GA loads only in production, so these are
 * no-ops locally.
 *   city_detected {city, method:"ip"}   once per cookie value (CitySync)
 *   city_ask_shown {page, detected}     once per page load of the pick screen (CityPick)
 *   city_chosen {city, source, previous} from setCityPref (lib/city.ts)
 */
export type CityEvent = "city_detected" | "city_ask_shown" | "city_chosen";

export function trackCity(event: CityEvent, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
}

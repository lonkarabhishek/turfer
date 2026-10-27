import { gaEvent } from "./ga";

/**
 * GA4 events for city personalisation. Same gtag the rest of the site
 * uses; no new provider. GA loads only in production and only after
 * Accept on the cookie banner (lib/analytics/ga.ts), so these are no-ops
 * locally and without consent.
 *   city_detected {city, method:"ip"}   once per cookie value (CitySync)
 *   city_ask_shown {page, detected}     once per page load of the pick screen (CityPick)
 *   city_chosen {city, source, previous} from setCityPref (lib/city.ts)
 */
export type CityEvent = "city_detected" | "city_ask_shown" | "city_chosen";

export function trackCity(event: CityEvent, params: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  gaEvent(event, params);
}

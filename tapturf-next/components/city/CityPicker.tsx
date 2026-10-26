import { getFooterCities } from "@/lib/queries/cities";
import { CityPickerSheet } from "./CityPickerSheet";

/**
 * The global city picker, handed the rows it opens with: every city with
 * active turfs, uncurated ones too, so the first open never shows only
 * the curated list while /api/cities loads. The list is the footer's
 * copy (getFooterCities: the root layout reads it on every page already,
 * one cached entry plus an in-memory memo), so no extra database read
 * and no change to any page's revalidate. That copy is cached for a day,
 * so the sheet takes rows from it but never numbers: the total and the
 * counts wait for the hourly /api/cities (liveCityList.ts). Ids and
 * counts (the counts only order the Popular row until then; about 2 KB);
 * labels come from lib/city.ts on the client. A failed read hands over
 * nothing and the sheet waits for /api/cities.
 */
export async function CityPicker() {
  const live = await getFooterCities().catch(() => null);
  return <CityPickerSheet initial={live ? live.map((c) => ({ id: c.id, n: c.n })) : null} />;
}

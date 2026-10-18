/**
 * Pure formatting helpers shared by the home's server loader and its
 * client components. Kept apart from data.ts so client bundles never
 * pull in the server-only cache and database imports.
 */

/** "1 turf" / "2 turfs", with Indian digit grouping. */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

/** "19:00:00" to "7:00 PM". */
export function formatTime12(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const [h, m = "00"] = timeStr.split(":");
  const h24 = parseInt(h, 10);
  if (Number.isNaN(h24)) return "";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m.slice(0, 2)} ${h24 < 12 ? "AM" : "PM"}`;
}

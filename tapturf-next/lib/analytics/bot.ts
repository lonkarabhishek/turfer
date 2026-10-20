/**
 * Crawlers, headless renderers and automation that run our JS. Turf view
 * counts skip them: before the 20 Oct outage one headless scraper and
 * Googlebot's renderer made most log_turf_view writes, since a fresh
 * headless session defeats the once-per-session dedupe.
 * "cubot" is a phone brand (CUBOT_X30), not a bot.
 */
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview/i;

export function isLikelyBot(userAgent: string | null | undefined, webdriver?: boolean | null): boolean {
  if (webdriver) return true;
  const ua = (userAgent ?? "").replace(/cubot/gi, "");
  return !ua || BOT_UA.test(ua);
}

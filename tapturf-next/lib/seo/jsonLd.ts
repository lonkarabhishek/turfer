/**
 * The text of an inline <script type="application/ld+json">. JSON.stringify
 * leaves "<" as it is, so a player's review or a game host's name holding
 * "</script>" would close the tag and the rest would run as HTML. "<", ">"
 * and "&" (and U+2028/U+2029) are written as \u escapes, which JSON.parse
 * reads back as the same characters: the markup Google reads is unchanged.
 *
 * Use it for every ld+json script (the city, city+sport and turf-near-me
 * pages still use JSON.stringify for turf-row data only, while their
 * listing work is on another branch). Pure, so node --test runs it
 * (lib/utils/seo.test.ts, npm run test:seo).
 */
export function jsonLdHtml(data: unknown): string {
  return (JSON.stringify(data) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

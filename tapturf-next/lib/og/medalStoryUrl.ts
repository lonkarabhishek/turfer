/**
 * Where a player's medals story picture is, and the file name it is saved
 * and shared under (lib/og/medalStory.ts says what the picture is). On
 * their own, with no import, so the sheet in the browser
 * (components/profile/FlauntSheet.tsx) carries nothing of the drawing.
 */

/** /api/og/medals/<username>?v=<v>; without a version, the address that redirects to the current one. */
export function medalStoryPath(username: string, version?: string): string {
  return `/api/og/medals/${encodeURIComponent(username.toLowerCase())}${version ? `?v=${version}` : ""}`;
}

/** "tapturf-medals-asha.png". */
export function medalStoryFile(username: string): string {
  return `tapturf-medals-${username.toLowerCase()}.png`;
}

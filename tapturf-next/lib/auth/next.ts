/**
 * Where to go after signing in: only a path on this site. Anything else
 * (another site, //evil.com, /\evil.com, a scheme) goes home, and the
 * sign-in pages never send you back to themselves. Relative imports only
 * (npm run test:account).
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // Browsers read "/\" like "//": another site.
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  if (next === "/login" || next.startsWith("/login/") || next.startsWith("/login?") || next.startsWith("/api/auth/")) return "/";
  return next;
}

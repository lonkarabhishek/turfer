import { getReport } from "@/lib/report/server";

// The owner's lead report, opened from the link the team sends on WhatsApp (lib/report/token.ts signs it; the admin's
// Owner outreach section makes it): one turf's counts for the last 30 days and how to claim its page. No sign-in.
// A small page of its own with no script (lib/report/report.ts), like /email/off: not for search engines (noindex,
// nofollow; robots.txt; not in the sitemap), never cached (private, no-store). A link we didn't sign answers 404.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return getReport((await params).token);
}

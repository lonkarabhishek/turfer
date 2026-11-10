import { freeResponse } from "@/lib/availability/route";
import { getFreeSlots } from "@/lib/queries/freeSlots";

// Free hours nearby, public: the turfs in a city (or "india") whose owners'
// free hours players see now, with the next free start times
// (lib/availability/route.ts freeResponse has the rules). The CDN keeps an
// answer a minute and serves it stale a minute more; a query string or any
// other spelling is refused before any read. One cached read of all of
// India serves every city (lib/queries/freeSlots.ts). No cookies, no
// sign-in, nothing personal. Under /api, so the proxy never runs for it.

export async function GET(req: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const url = new URL(req.url);
  const r = await freeResponse({ scope, pathname: url.pathname, search: url.search }, () => getFreeSlots(null), Date.now());
  if (r.failed) console.error("availability/free: read failed", scope, r.failed);
  return new Response(r.body, { status: r.status, headers: r.headers });
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createReadOnlyClient } from "@/lib/supabase/server";

/**
 * On-demand cache invalidation for turf writes.
 *
 * Wired to a Supabase Database Webhook on public.turfs (INSERT /
 * UPDATE / DELETE) so a data-ops row change reflects on prod within
 * ~10s instead of after the 10-min revalidate window naturally ticks.
 *
 * Auth: shared secret in the x-revalidate-secret header. If
 * REVALIDATE_SECRET is set in Vercel it's matched directly; otherwise
 * the header is checked by Supabase (check_revalidate_secret), which
 * holds the same secret the notify_turf_change() trigger sends. Until
 * this fallback existed, a missing env var meant every webhook 500'd
 * and data changes waited for the time-based cache instead.
 * Anything else 401s.
 */
async function isAuthorized(header: string | null): Promise<boolean> {
  if (!header) return false;
  const secret = process.env.REVALIDATE_SECRET;
  if (secret) return header === secret;
  try {
    const { data, error } = await createReadOnlyClient().rpc("check_revalidate_secret", {
      p_secret: header,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req.headers.get("x-revalidate-secret")))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  // Supabase DB webhook payload shape: { type, table, record, old_record, schema }
  const b = body as {
    table?: string;
    record?: { id?: string; city?: string; is_active?: boolean; turf_id?: string };
    old_record?: { id?: string; city?: string; turf_id?: string };
  };
  const row = b.record ?? b.old_record;
  // trending_turfs rows point at a turf via turf_id, not their own id.
  const isTrending = b.table === "trending_turfs";

  const paths = new Set<string>();
  // Always kick the landing surfaces + sitemap so counts stay honest
  // and the sitemap reflects the new updated_at.
  paths.add("/");
  paths.add("/turfs");
  paths.add("/sitemap.xml");

  if (isTrending) {
    if (b.record?.turf_id) paths.add(`/turf/${b.record.turf_id}`);
    if (b.old_record?.turf_id) paths.add(`/turf/${b.old_record.turf_id}`);
  } else if (row?.id) {
    paths.add(`/turf/${row.id}`);
  }
  if (row?.city) {
    paths.add(`/${row.city}`);
    // Old marketing URLs still 301 to /<city>, but Next needs the
    // redirect entry to be regenerated on the sitemap too.
    paths.add(`/turf-in-${row.city}`);
  }
  // If the old_record was in a different city (rare — a city move),
  // bust that city too so the old listing drops.
  if (b.old_record?.city && b.old_record.city !== row?.city) {
    paths.add(`/${b.old_record.city}`);
  }

  // Sport listing pages show turf cards too; refresh all of them.
  try {
    revalidatePath("/sport/[sport]", "page");
  } catch (e) {
    console.warn("revalidatePath(/sport/[sport]) failed", e);
  }

  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch (e) {
      // Don't fail the whole webhook over one bad path; Supabase will
      // retry the delivery which would just amplify a real problem.
      console.warn(`revalidatePath(${p}) failed`, e);
    }
  }

  return NextResponse.json({ ok: true, revalidated: Array.from(paths) });
}

// The webhook also fires GET as a health check from Supabase's UI.
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST with x-revalidate-secret header",
  });
}

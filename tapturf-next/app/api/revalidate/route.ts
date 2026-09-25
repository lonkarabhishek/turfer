import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * On-demand cache invalidation for turf writes.
 *
 * Wired to a Supabase Database Webhook on public.turfs (INSERT /
 * UPDATE / DELETE) so a data-ops row change reflects on prod within
 * ~10s instead of after the 10-min revalidate window naturally ticks.
 *
 * Auth: shared secret in the x-revalidate-secret header, matched
 * against process.env.REVALIDATE_SECRET (Vercel env var, never in
 * client code). Anything else 401s.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "REVALIDATE_SECRET not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("x-revalidate-secret") !== secret) {
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
    record?: { id?: string; city?: string; is_active?: boolean };
    old_record?: { id?: string; city?: string };
  };
  const row = b.record ?? b.old_record;

  const paths = new Set<string>();
  // Always kick the landing surfaces + sitemap so counts stay honest
  // and the sitemap reflects the new updated_at.
  paths.add("/");
  paths.add("/turfs");
  paths.add("/sitemap.xml");

  if (row?.id) paths.add(`/turf/${row.id}`);
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

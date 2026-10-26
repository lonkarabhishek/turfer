import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { revalidateSecretOk } from "@/lib/cache/secret";
import { MAX_KEYS, keysForRow, planPurge } from "@/lib/cache/keys";

/**
 * On-demand cache invalidation for turf writes.
 *
 * The database notes what changed as keys in private.cache_dirty and a
 * pg_cron job posts them here in one batch, at most once a minute:
 * { keys: ["list:pune", "turf:turf-up-hinjewadi", ...] } (see
 * lib/cache/keys.ts and supabase/migrations/20261020_cache_queue.sql).
 * The old per-row webhook payload ({ type, table, record, old_record })
 * is still accepted, but only purges the turf page it names: never the
 * lists. On the 26 Oct import day that webhook was still live next to the
 * queue (its removal was never applied) and sent 141 of the 165 list
 * purges, up to 44 at once; each one marked every list page stale. The
 * queue already sends the same list keys in its batch, so per-row posts
 * can no longer mark the lists stale, whether or not the webhook is on
 * (20261026_cache_legacy_webhook_off.sql turns it into a no-op).
 *
 * Until 20 Oct each changed row expired every turf cache and about 990
 * pages at once. An expired page rebuilds with the data cache bypassed,
 * so every rebuild read the whole turf table again; with imports and
 * admin batches that load took the database down. Now:
 * - any list:* key in a batch marks the "turf-data" tag stale ('max'),
 *   not expired. Every list page carries that tag (unstable_cache copies
 *   it from the list version, see lib/queries/turfs.ts), so they all keep
 *   serving their copy while they rebuild in the background. The batch
 *   comes from private.flush_lists(), at most once per gap (15 minutes by
 *   default), right after it rebuilt the list snapshot, so the rebuilds
 *   read the new version. No per-city path purges: those were hard
 *   expiries.
 * - turf:<key> purges that one turf page, /turf/<key>. revalidatePath
 *   with no profile is a hard expiry, not 'max': the next visitor waits
 *   for one render (a single turf_page call) and that render skips the
 *   data cache. That is one page, and on a warm instance the footer's
 *   in-memory city list (getFooterCities) keeps it from re-running
 *   city_turf_counts. To serve these stale as well, the candidate is
 *   revalidateTag(`_N_T_/turf/${key}`, 'max') (the page's implicit tag);
 *   check it on a preview first.
 * - games is accepted and ignored: game pages run on a timer.
 *
 * Auth: shared secret in the x-revalidate-secret header. If
 * REVALIDATE_SECRET is set in Vercel it's matched directly; otherwise
 * the header is checked by Supabase (check_revalidate_secret), which
 * holds the same secret the database sends. With the batched queue that
 * check runs at most about once a minute. Anything else 401s.
 */
const isAuthorized = revalidateSecretOk;

type Body = {
  keys?: unknown;
  type?: string;
  table?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
  if (!(await isAuthorized(req.headers.get("x-revalidate-secret")))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });
  }

  let keys: unknown[];
  const legacy = !Array.isArray(body.keys);
  if (Array.isArray(body.keys)) {
    // The flush never sends more; a bigger batch is a bug, not a retry.
    if (body.keys.length > MAX_KEYS) {
      return NextResponse.json({ ok: false, error: `At most ${MAX_KEYS} keys` }, { status: 400 });
    }
    keys = body.keys;
  } else {
    // Legacy per-row payload from notify_turf_change(), same rules as the
    // queue's triggers (a trending row purges /turf/<turf_id>).
    keys = keysForRow(body.table, body.type, body.record ?? null, body.old_record ?? null);
  }

  const plan = planPurge(keys);
  if (plan.rejected.length) console.warn("revalidate: skipped keys", plan.rejected.slice(0, 10));

  // Legacy per-row posts never purge the lists (see above): the queue's batch does.
  const listPurge = plan.cities.length > 0 && !legacy;
  if (listPurge) {
    try {
      revalidateTag("turf-data", "max");
    } catch (e) {
      console.warn("revalidateTag(turf-data) failed", e);
    }
  }
  for (const key of plan.turfs) {
    try {
      revalidatePath(`/turf/${key}`);
    } catch (e) {
      // Don't fail the batch over one bad path: the flush would resend
      // all of it.
      console.warn(`revalidatePath(/turf/${key}) failed`, e);
    }
  }

  console.info("revalidate", { lists: plan.cities.length, turfs: plan.turfs.length, games: plan.games, legacy, listPurge });
  return NextResponse.json({ ok: true, lists: plan.cities, turfs: plan.turfs.length });
}

// The webhook also fires GET as a health check from Supabase's UI.
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST with x-revalidate-secret header",
  });
}

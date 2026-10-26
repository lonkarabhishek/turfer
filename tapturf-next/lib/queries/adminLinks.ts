import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import type { RefusalRow, SignInLinkRow, UnfinishedRow } from "@/lib/admin/links";

/**
 * The admin reads of the second ways in (20261026_account_links.sql),
 * each answering only the site owner (the same check as admin_people),
 * with the visitor's own session and Firebase token. [] when not allowed,
 * failing, or on a database from before that migration (the function is
 * not there yet: nothing to show). One read per render each.
 */
const PAGE = 1000;

async function ownerRows<T>(fn: string): Promise<T[]> {
  try {
    const supabase = await createServerClient();
    const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.rpc(fn, { p_firebase_token: token }).range(from, from + PAGE - 1);
      if (error) {
        // PGRST202: no such function yet (the migration isn't applied). Quiet: it's expected then.
        if (error.code !== "PGRST202") console.warn(`${fn} failed`, error.code, error.message);
        return [];
      }
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  } catch (e) {
    console.warn(`${fn} threw`, e);
    return [];
  }
}

/** Accounts that added a Google account or a number from their profile. */
export const signInLinkRows = cache(() => ownerRows<SignInLinkRow>("admin_sign_in_links"));
/** Google sign-ins that open no TapTurf account, with why. */
export const googleUnfinishedRows = cache(() => ownerRows<UnfinishedRow>("admin_google_unfinished"));
/** What couldn't be added (and Google accounts added over their own empty account), last 90 days. */
export const linkRefusalRows = cache(() => ownerRows<RefusalRow>("admin_link_refusals"));

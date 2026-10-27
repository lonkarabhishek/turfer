import { cache } from "react";
import type { RefusalRow, SignInLinkRow, UnfinishedRow } from "@/lib/admin/links";
import { ownerRead } from "@/lib/admin/db";
import { readAllPages, type Section } from "@/lib/admin/section";

/**
 * The admin reads of the second ways in (20261026_account_links.sql),
 * each answering only the site owner (the same check as admin_people),
 * with the visitor's own session and Firebase token. One read per render
 * each, settled. On a database from before that migration the function is
 * not there yet (PGRST202): nothing to show, and nothing is logged.
 */
function ownerRows<T>(fn: string): Promise<Section<T[]>> {
  return ownerRead(fn, ({ supabase, token }, signal) =>
    readAllPages<T>((from, to) => supabase.rpc(fn, { p_firebase_token: token }).range(from, to).abortSignal(signal), fn),
  );
}

/** The rows, [] when they couldn't be read (the people list shows less, and says nothing wrong). */
const orNone = async <T>(s: Promise<Section<T[]>>): Promise<T[]> => {
  const r = await s;
  return r.ok ? r.data : [];
};

/** Google sign-ins that open no TapTurf account, with why; or why they couldn't be read (the counts need them). */
export const googleUnfinished = cache(() => ownerRows<UnfinishedRow>("admin_google_unfinished"));

/** Accounts that added a Google account or a number from their profile. */
export const signInLinkRows = cache(() => orNone(ownerRows<SignInLinkRow>("admin_sign_in_links")));
/** Google sign-ins that open no TapTurf account, with why ([] when they couldn't be read). */
export const googleUnfinishedRows = cache(() => orNone(googleUnfinished()));
/** What couldn't be added (and Google accounts added over their own empty account), last 90 days. */
export const linkRefusals = cache(() => ownerRows<RefusalRow>("admin_link_refusals"));

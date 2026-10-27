import { cache } from "react";
import { confirmedById, toPeople, type Confirmed, type ContactEmailRow, type DetailsRow, type Person, type TickRow, type VerifiedRow } from "@/lib/admin/people";
import { googleOnlyPeople } from "@/lib/admin/links";
import { googleUnfinishedRows, signInLinkRows } from "@/lib/queries/adminLinks";
import { ownerRead } from "@/lib/admin/db";
import { readAllPages, rowsOf, type Section } from "@/lib/admin/section";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string | null;
};

/**
 * Users with email and phone, for the admin pages. Through
 * admin_users(), which answers only the site owner (the same check as
 * get_recent_logins), so it runs with the visitor's own session and
 * Firebase token, never the anon client. Newest first. One read per
 * render for each set of ids, settled (lib/admin/db.ts).
 */
const load = cache(
  (key: string): Promise<Section<AdminUserRow[]>> =>
    ownerRead(key === "*" ? "admin_users" : "admin_users (ids)", async ({ supabase, token }, signal) => {
      const ids = key === "*" ? null : key.split(",");
      if (ids) return rowsOf<AdminUserRow>(await supabase.rpc("admin_users", { p_firebase_token: token, p_ids: ids }).abortSignal(signal), "admin_users");
      // Paged past PostgREST's 1,000 rows. admin_users orders by sign-up time only, so a row whose
      // time ties across a page edge could come twice: once each.
      const all = await readAllPages<AdminUserRow>((from, to) => supabase.rpc("admin_users", { p_firebase_token: token, p_ids: null }).range(from, to).abortSignal(signal), "admin_users");
      const seen = new Set<string>();
      return all.filter((u) => !seen.has(u.id) && !!seen.add(u.id));
    }),
);

/** The users (all, or these ids), or why they couldn't be read: for counts and lists, which must not read a failure as none. */
export function adminUsers(ids?: string[]): Promise<Section<AdminUserRow[]>> {
  if (ids && ids.length === 0) return Promise.resolve({ ok: true, data: [] });
  return load(ids ? [...new Set(ids)].sort().join(",") : "*");
}

/** The same rows, [] when they couldn't be read: for names next to records, where a missing name reads "-". */
export async function adminUserRows(ids?: string[]): Promise<AdminUserRow[]> {
  const s = await adminUsers(ids);
  return s.ok ? s.data : [];
}

/**
 * What each account's sign-ins confirmed (Google's email, a checked phone
 * code), through admin_verified() with the same owner check. One read per
 * render; null when not allowed or failing, so callers can fall back to
 * the old app's is_verified flag.
 */
export const adminVerifiedRows = cache(async (): Promise<VerifiedRow[] | null> => {
  const s = await ownerRead("admin_verified", ({ supabase, token }, signal) =>
    readAllPages<VerifiedRow>((from, to) => supabase.rpc("admin_verified", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_verified"),
  );
  return s.ok ? s.data : null;
});

/**
 * The verified tick players see and its two halves, for every account,
 * through admin_ticks() with the same owner check. One read per render;
 * null when not allowed or failing (or before 20261027_verified_tick.sql),
 * so the list says it couldn't read it.
 */
export const adminTickRows = cache(async (): Promise<TickRow[] | null> => {
  const s = await ownerRead("admin_ticks", ({ supabase, token }, signal) =>
    readAllPages<TickRow>((from, to) => supabase.rpc("admin_ticks", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_ticks"),
  );
  return s.ok ? s.data : null;
});

/** adminVerifiedRows by account; null when that read failed. */
export async function adminConfirmed(): Promise<Map<string, Confirmed> | null> {
  return confirmedById(await adminVerifiedRows());
}

/**
 * Everyone, with everything the admin sign-ups chart and list show
 * (sign-up time, contact, username, sign-ins, activity, sign-up context),
 * through admin_people() with the same owner check. Newest first.
 * people is null when not allowed or failing, so the section can say so;
 * never throws. Paged: PostgREST caps a function's rows too (1,000 on
 * Supabase), and the chart and the list are both built from this read;
 * the function's order (sign-up time, then id) keeps pages from
 * overlapping. readAt is the chart's "now": taken after the read and
 * never before the newest sign-up, so every bar and the total agree.
 */
export const signupPeople = cache(async (): Promise<{ people: Person[] | null; readAt: number }> => {
  // The typed emails come separately (admin_people's columns can't grow); without them the list still loads.
  // So do the ways in added from the profile, and the Google sign-ins that made no account.
  const [rows, contacts, verified, links, unfinished, ticks] = await Promise.all([
    ownerRead("admin_people", ({ supabase, token }, signal) =>
      readAllPages<DetailsRow>((from, to) => supabase.rpc("admin_people", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_people"),
    ),
    ownerRead("admin_contact_emails", ({ supabase, token }, signal) =>
      readAllPages<ContactEmailRow>((from, to) => supabase.rpc("admin_contact_emails", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_contact_emails"),
    ),
    // What sign-ins confirmed; without it the list shows the old flag.
    adminVerifiedRows(),
    signInLinkRows(),
    googleUnfinishedRows(),
    // The tick and its halves; without it the list says it couldn't read them.
    adminTickRows(),
  ]);
  if (!rows.ok) return { people: null, readAt: Date.now() };
  try {
    // A Google sign-in that never came back used to get an empty account from the auth trigger;
    // now it gets none, so it is counted here instead and the sign-ups series keeps its meaning.
    const people = [...toPeople(rows.data, contacts.ok ? contacts.data : [], verified, links, ticks), ...googleOnlyPeople(unfinished)].sort(
      (a, b) => b.joinedAt - a.joinedAt || (a.id < b.id ? -1 : 1),
    );
    return { people, readAt: Math.max(Date.now(), people[0]?.joinedAt ?? 0) };
  } catch (e) {
    console.warn("admin_people: couldn't build the list", e);
    return { people: null, readAt: Date.now() };
  }
});

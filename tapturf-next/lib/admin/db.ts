import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createReadOnlyClient, requestServerClient } from "@/lib/supabase/server";
import { perKey } from "@/lib/supabase/oneClient";
import { ADMIN_TOKEN_COOKIE } from "@/lib/admin/auth";
import { createReadContext, failedSection, reasonOf, settle, type ReadContext, type Section, type SettleOptions } from "@/lib/admin/section";

/**
 * Where every admin read goes through (server only): the request's one
 * Supabase client with the owner's Firebase token for the owner functions
 * (they check the site owner themselves), the anon read-only client for
 * public tables, and per request one read context: at most
 * READS_AT_ONCE reads in flight and one time budget for all of them
 * (lib/admin/section.ts). Each read is settled into a Section; none throws.
 */

export type OwnerDb = { supabase: SupabaseClient; token: string | null };

const contextOf = perKey<object, ReadContext>(() => createReadContext());
const anonOf = perKey<object, SupabaseClient>(() => createReadOnlyClient());

/** The request's client and the owner's Firebase token (phone sign-ins), for the owner functions. */
export async function ownerDb(): Promise<OwnerDb> {
  const jar = await cookies();
  return { supabase: await requestServerClient(), token: jar.get(ADMIN_TOKEN_COOKIE)?.value ?? null };
}

/** One read through an owner function, settled (pass `signal` on with .abortSignal()). */
export async function ownerRead<T>(name: string, read: (db: OwnerDb, signal: AbortSignal) => Promise<T>, opts: Omit<SettleOptions, "ctx"> = {}): Promise<Section<T>> {
  let db: OwnerDb, ctx: ReadContext;
  try {
    ctx = contextOf(await cookies());
    db = await ownerDb();
  } catch (e) {
    console.warn(`admin read ${name}: no client`, e);
    return failedSection(reasonOf(e));
  }
  return settle(name, (signal) => read(db, signal), { ...opts, ctx });
}

/** One read of public tables with the anon read-only client (its breaker and 5 s abort apply), settled. */
export async function anonRead<T>(name: string, read: (s: SupabaseClient, signal: AbortSignal) => Promise<T>, opts: Omit<SettleOptions, "ctx"> = {}): Promise<Section<T>> {
  let s: SupabaseClient, ctx: ReadContext;
  try {
    const jar = await cookies();
    ctx = contextOf(jar);
    s = anonOf(jar);
  } catch (e) {
    console.warn(`admin read ${name}: no client`, e);
    return failedSection(reasonOf(e));
  }
  return settle(name, (signal) => read(s, signal), { ...opts, ctx });
}

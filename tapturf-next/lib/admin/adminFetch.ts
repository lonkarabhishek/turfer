"use client";

import { createClient } from "@/lib/supabase/client";
import { createGate } from "./fetchGate";

/** Admin API calls in flight at once from one admin page, after the first. */
const AT_ONCE = 2;

// The browser's session check first: it refreshes an expiring session once and stores the new cookie.
const gate = createGate(AT_ONCE, () => createClient().auth.getSession());

/**
 * fetch() for the reads the admin page's client parts make on their own
 * (claims, owner photos, the progress bars), through the page's one gate
 * (lib/admin/fetchGate.ts). What the owner clicks (approve, run a batch)
 * uses fetch() as is: those come later, one at a time, with a fresh cookie.
 */
export function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  return gate(() => fetch(input, init));
}

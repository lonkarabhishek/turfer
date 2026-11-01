import { cache } from "react";
import { ownerRead } from "@/lib/admin/db";
import { readAllPages, type Section } from "@/lib/admin/section";
import { toAdminTournament, type AdminTournament } from "@/lib/admin/tournaments";

export type { AdminTournament };

/**
 * Every live tournament, newest first, with its counts, live matches,
 * views and organiser's account (admin_tournaments, owner only, with the
 * visitor's own session and Firebase token). Before
 * 20261102_live_tournaments.sql is applied it says not set up. Once per
 * render: the home line and its section share it. Never throws.
 */
export const getAdminTournaments = cache(
  async (): Promise<Section<AdminTournament[]>> => {
    const s = await ownerRead("admin_tournaments", ({ supabase, token }, signal) =>
      readAllPages<Record<string, unknown>>((from, to) => supabase.rpc("admin_tournaments", { p_firebase_token: token }).range(from, to).abortSignal(signal), "admin_tournaments"),
    );
    return s.ok ? { ok: true, data: s.data.map(toAdminTournament) } : s;
  },
);

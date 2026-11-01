import { accountError, caller } from "../account/route";
import { createAccountLimiter, resolveAccount } from "../account/server";
import { readExtras, readHistory, readPeople, readRosters, whatsappSwitch } from "./server";
import type { ProfileDeps } from "./routes";

// The real deps of the passport routes: the caller verified as the account
// routes do it (lib/account/route.ts caller: a Firebase ID token for a
// phone sign-in, the Supabase session for Google), then its account
// (account_resolve, never made here), then lib/profile/server.ts.

const limits = {
  read: createAccountLimiter(30),
  // The badges' read: at most once per tab session per person (lib/profile/playedStore.ts keeps it).
  badge: createAccountLimiter(60),
  write: createAccountLimiter(12),
};

export const profileDeps: ProfileDeps = {
  who: async (req, kind) => {
    const c = await caller(req, limits[kind]);
    if ("reply" in c) return c;
    const r = await resolveAccount(c.id);
    if ("unavailable" in r) return { reply: accountError("unavailable") };
    if ("r" in r) return { reply: accountError(r.r === "name" ? "new" : r.r) };
    return { userId: r.ok.id, since: r.ok.created_at || null };
  },
  history: readHistory,
  rosters: readRosters,
  people: readPeople,
  extras: readExtras,
  whatsapp: whatsappSwitch,
  now: Date.now,
};

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMine } from "@/lib/reviews/client";
import type { MineResponse, RateHint } from "@/lib/reviews/types";
import type { Mine } from "./ReportSheet";

export type MyReport = {
  /** The answer is in (or there is no sign-in to ask for). */
  loaded: boolean;
  mine: Mine | null;
  voted: Set<string>;
  blocked: boolean;
  hint: RateHint | null;
  myPrice: number | null;
};

const EMPTY: MyReport = { loaded: false, mine: null, voted: new Set(), blocked: false, hint: null, myPrice: null };

/**
 * What only this signed-in viewer sees of a turf's reports, which the
 * cached page can't hold: one GET /api/reviews after hydration. Signed-out
 * visitors make no call.
 */
export function useMyReport(turfId: string) {
  const { user, getToken } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<MyReport>(EMPTY);

  const load = useCallback(async () => {
    const t = await getToken();
    if (!("token" in t)) {
      setState({ ...EMPTY, loaded: true });
      return;
    }
    const a = await getMine(t.token, turfId);
    const b = a.body as MineResponse;
    if (!("mine" in b)) {
      setState((s) => ({ ...s, loaded: true }));
      return;
    }
    setState({ loaded: true, mine: b.mine, voted: new Set(b.voted), blocked: b.blocked === "own_turf", hint: b.hint, myPrice: b.my_price });
  }, [getToken, turfId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (userId) void load();
      else setState({ ...EMPTY, loaded: true });
    }, 0);
    return () => clearTimeout(t);
  }, [userId, load]);

  return { ...state, reload: load, setState };
}

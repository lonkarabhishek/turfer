"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMine } from "@/lib/reviews/client";
import type { MineResponse, RateHint } from "@/lib/reviews/types";
import type { Mine } from "./ReportSheet";

export type MyReportState = {
  /** The answer is in for the viewer signed in now (or there is no sign-in to ask for). */
  loaded: boolean;
  /** The account the answer is for. */
  for: string | null;
  /** Signed in, but the answer couldn't be had: whether they already rated here is unknown. */
  failed: boolean;
  mine: Mine | null;
  voted: Set<string>;
  blocked: boolean;
  hint: RateHint | null;
  myPrice: number | null;
};

const EMPTY: MyReportState = { loaded: false, for: null, failed: false, mine: null, voted: new Set(), blocked: false, hint: null, myPrice: null };

/**
 * What only this signed-in viewer sees of a turf's reports, which the
 * cached page can't hold: one GET /api/reviews after hydration. Signed-out
 * visitors make no call.
 */
export function useMyReport(turfId: string) {
  const { user, getToken } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<MyReportState>(EMPTY);

  const load = useCallback(async () => {
    setState((s) => (s.failed ? { ...s, loaded: false, failed: false } : s));
    const t = await getToken();
    if (!("token" in t)) {
      // No sign-in after all: nothing to ask. Any other answer: we don't know.
      setState({ ...EMPTY, loaded: true, for: userId, failed: !("none" in t) });
      return;
    }
    const a = await getMine(t.token, turfId);
    const b = a.body as MineResponse;
    if (!("mine" in b)) {
      setState((s) => ({ ...s, loaded: true, for: userId, failed: true }));
      return;
    }
    setState({ loaded: true, for: userId, failed: false, mine: b.mine, voted: new Set(b.voted), blocked: b.blocked === "own_turf", hint: b.hint, myPrice: b.my_price });
  }, [getToken, turfId, userId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (userId) void load();
      else setState({ ...EMPTY, loaded: true });
    }, 0);
    return () => clearTimeout(t);
  }, [userId, load]);

  // An answer for someone else (signed out a moment ago, or another account) is no answer.
  const current = state.for === userId;
  return { ...(current ? state : EMPTY), loaded: state.loaded && current, reload: load, setState };
}

"use client";

import { useEffect, useState } from "react";
import { checkUsername, errorOf, type TokenCheck } from "@/lib/account/client";
import { usernameProblem } from "@/lib/account/usernames";

export type Availability = "idle" | "checking" | "ok" | "taken" | "reserved" | "bad" | "unknown";

export const AVAILABILITY_TEXT: Record<Availability, string> = {
  idle: "",
  checking: "Checking…",
  ok: "Available",
  taken: "Someone already has this username.",
  reserved: "This username is not allowed.",
  bad: "3 to 20 letters, digits or _, starting with a letter.",
  unknown: "",
};

/**
 * Whether a typed username is free: the rules at once, the server a
 * moment after typing stops. 'idle' for empty or the current one;
 * 'unknown' when the server could not say (saving will).
 */
export function useUsernameCheck(typed: string, current: string | null | undefined, getToken: () => Promise<TokenCheck>): Availability {
  const u = typed.trim();
  const [checked, setChecked] = useState<{ u: string; r: Availability } | null>(null);
  const problem = u ? usernameProblem(u) : null;
  const availability: Availability = !u || u === (current ?? "") ? "idle" : problem ? problem : checked?.u === u ? checked.r : "checking";

  useEffect(() => {
    if (availability !== "checking") return;
    let live = true;
    const t = setTimeout(async () => {
      const tok = await getToken();
      if (!live) return;
      if (!("token" in tok)) {
        setChecked({ u, r: "unknown" });
        return;
      }
      const a = await checkUsername(tok.token, u);
      if (!live) return;
      const e = errorOf(a);
      setChecked({ u, r: e === "taken" || e === "reserved" || e === "bad" ? e : e ? "unknown" : "ok" });
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [availability, u, getToken]);

  return availability;
}

export const usernameSavable = (a: Availability) => a === "ok" || a === "unknown";

import type { AccountError } from "../account/types";
import type { PassportResponse, WhatsAppResponse, WhatsAppState } from "./types";

/**
 * Browser side of the Me tab's passport routes (lib/profile/types.ts):
 * the passport read and the WhatsApp switch, each with the caller's
 * token. The played read every page shares is lib/profile/playedStore.ts.
 */

/** A refusal of the WhatsApp switch carries the switch's state (not_allowed: the number isn't proved). */
export type Answer<T> = { ok: T } | { error: AccountError | "network"; whatsapp?: WhatsAppState | null };

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<Answer<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = (typeof body.error === "string" ? body.error : "unavailable") as AccountError;
      return "whatsapp" in body ? { error, whatsapp: body.whatsapp as WhatsAppState | null } : { error };
    }
    return { ok: body as T };
  } catch {
    return { error: "network" };
  }
}

export const getPassport = (token: string) => call<PassportResponse>(token, "/api/me/passport");

export function setWhatsapp(token: string, on: boolean): Promise<Answer<WhatsAppResponse>> {
  return call<WhatsAppResponse>(token, "/api/me/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
}

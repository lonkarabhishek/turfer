import { step } from "./visitor";
import { gaEvent } from "./ga";
import { rememberContactTap } from "../outcome/device";

/**
 * Record a Call / WhatsApp tap on a turf.
 *
 * Plain fetch with keepalive instead of supabase-js: the tap usually
 * hands off to the dialer or WhatsApp right away, and keepalive lets
 * the request finish even as the page is backgrounded. It also skips
 * the supabase-js auth lock, so logging can never stall the tap.
 * Fire-and-forget: failures are swallowed.
 *
 * The count is anonymous and stores nothing on the device, so it runs for
 * everyone. The GA4 event and the visit note's funnel step need Accept on
 * the cookie banner (lib/consent.ts; gaEvent and step check it).
 *
 * A tap that opens the dialer or WhatsApp (`opens`; by default a signed-in
 * one, since a signed-out tap opens the sign-in instead) is also noted in
 * this tab's sessionStorage with the turf's name, so the "Did you get a
 * slot?" card can ask about it once when the player is back
 * (lib/outcome/). That note changes nothing about what is counted.
 */
export type ContactKind = "call" | "whatsapp";

export function logContactClick(opts: {
  turfId: string;
  kind: ContactKind;
  /** Where the tap happened, e.g. "turf_sidebar", "turf_bar", "suggested_number". */
  source: string;
  signedIn: boolean;
  userId?: string | null;
  /** The turf's name, for the "Did you get a slot?" card; without it the tap is never asked about. */
  turfName?: string;
  /** Whether this tap opens the dialer or WhatsApp. Default: signedIn. */
  opens?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (opts.turfName && (opts.opens ?? opts.signedIn)) {
    rememberContactTap({ turfId: opts.turfId, turfName: opts.turfName, kind: opts.kind, source: opts.source, signedIn: opts.signedIn });
  }
  step("contact_click");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      void fetch(`${url}/rest/v1/rpc/log_turf_contact_click`, {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_turf_id: opts.turfId,
          p_kind: opts.kind,
          p_source: opts.source,
          p_signed_in: opts.signedIn,
          p_user_id: opts.userId ?? null,
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  gaEvent(opts.kind === "call" ? "turf_call_click" : "turf_whatsapp_click", {
    turf_id: opts.turfId,
    source: opts.source,
    signed_in: opts.signedIn,
  });
}

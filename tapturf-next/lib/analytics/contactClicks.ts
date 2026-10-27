import { step } from "./visitor";
import { gaEvent } from "./ga";

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
 */
export type ContactKind = "call" | "whatsapp";

export function logContactClick(opts: {
  turfId: string;
  kind: ContactKind;
  /** Where the tap happened, e.g. "turf_sidebar", "turf_bar", "suggested_number". */
  source: string;
  signedIn: boolean;
  userId?: string | null;
}) {
  if (typeof window === "undefined") return;
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

/**
 * Public URL of a turf page, used in the WhatsApp enquiry text. On the
 * turf's own page that is the slug URL in the address bar; elsewhere
 * the id URL, which redirects to it.
 */
export function turfPageUrl(turfId: string): string {
  if (typeof window !== "undefined" && /^\/turf\/[^/]+$/.test(window.location.pathname)) {
    return `https://www.tapturf.in${window.location.pathname}`;
  }
  return `https://www.tapturf.in/turf/${turfId}`;
}

/**
 * Record a Call / WhatsApp tap on a turf.
 *
 * Plain fetch with keepalive instead of supabase-js: the tap usually
 * hands off to the dialer or WhatsApp right away, and keepalive lets
 * the request finish even as the page is backgrounded. It also skips
 * the supabase-js auth lock, so logging can never stall the tap.
 * Fire-and-forget: failures are swallowed.
 *
 * Also sends a GA4 event so the numbers show up in Google Analytics.
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
  try {
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", opts.kind === "call" ? "turf_call_click" : "turf_whatsapp_click", {
      turf_id: opts.turfId,
      source: opts.source,
      signed_in: opts.signedIn,
    });
  } catch {
    /* ignore */
  }
}

/** Public URL of a turf page, used in the WhatsApp enquiry text. */
export function turfPageUrl(turfId: string): string {
  return `https://www.tapturf.in/turf/${turfId}`;
}

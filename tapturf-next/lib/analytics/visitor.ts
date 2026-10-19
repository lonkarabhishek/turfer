/**
 * Quiet first-party context for new sign-ups, gathered from how someone
 * uses the site. Nothing is asked and nothing leaves the device until
 * they create an account; then one short summary is saved against the
 * new user (save_signup_context) so we can see where sign-ups come from
 * and what they came for. Disclosed in the privacy policy.
 *
 * Never stored: IP addresses, the raw user agent, full referrer URLs
 * with their query strings, or anything typed into a form.
 * Everything here is best effort: storage errors are swallowed.
 */

const FIRST = "tt_first_v1";
const VISITS = "tt_visits_v1";
const INTEREST = "tt_interest_v1";
const FUNNEL = "tt_funnel_v1";
const SESSION_GAP_MS = 30 * 60 * 1000;

type First = { at: string; ref: string | null; landing: string; utm: Record<string, string>; ad_click: boolean };
type Visits = { sessions: number; days: string[]; first_at: string; last_ms: number };
type Interest = { city: Record<string, number>; sport: Record<string, number>; turfs: number };
type Funnel = Partial<Record<"first_visit" | "turf_open" | "contact_click" | "signup", string>>;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage */
  }
}

function gtag(...args: unknown[]) {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.(...args);
  } catch {
    /* ignore */
  }
}

/** India date, so "days between visits" follows the visitor's calendar. */
const istDay = (ms: number) => new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10);

/** Once per page load: first-touch source on the very first visit, then session and day counts. */
export function trackVisit() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!read<First>(FIRST)) {
    const url = new URL(window.location.href);
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = url.searchParams.get(k);
      if (v) utm[k.slice(4)] = v.slice(0, 80);
    }
    let ref: string | null = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      // Host and path only; another site's query string can hold personal data.
      if (r && r.host !== window.location.host) ref = `${r.host}${r.pathname}`.slice(0, 120);
    } catch {
      /* bad referrer */
    }
    write(FIRST, {
      at: new Date(now).toISOString(),
      ref,
      landing: url.pathname.slice(0, 120),
      utm,
      ad_click: url.searchParams.has("gclid") || url.searchParams.has("fbclid"),
    } satisfies First);
    step("first_visit");
  }
  const v = read<Visits>(VISITS) ?? { sessions: 0, days: [], first_at: new Date(now).toISOString(), last_ms: 0 };
  if (now - v.last_ms > SESSION_GAP_MS) v.sessions += 1;
  const day = istDay(now);
  if (!v.days.includes(day)) v.days = [...v.days, day].slice(-60);
  v.last_ms = now;
  write(VISITS, v);
}

/** A city, sport or turf the visitor looked at or picked. */
export function noteInterest(i: { city?: string | null; sports?: string[] | null; turf?: boolean }) {
  if (typeof window === "undefined") return;
  const cur = read<Interest>(INTEREST) ?? { city: {}, sport: {}, turfs: 0 };
  if (i.city && /^[a-z][a-z-]{1,30}$/.test(i.city)) cur.city[i.city] = (cur.city[i.city] ?? 0) + 1;
  for (const s of i.sports ?? []) {
    const k = s.trim().toLowerCase().slice(0, 30);
    if (k) cur.sport[k] = (cur.sport[k] ?? 0) + 1;
  }
  if (i.turf) cur.turfs += 1;
  write(INTEREST, cur);
}

/** Count a turf page view for the owner's myTapturf numbers, once per turf per session. */
export function logTurfView(turfId: string) {
  if (typeof window === "undefined") return;
  try {
    const k = `tt_viewed_${turfId}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch {
    /* no sessionStorage: count it anyway */
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  void fetch(`${url}/rest/v1/rpc/log_turf_view`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_turf_id: turfId }),
  }).catch(() => {});
}

/** First time each funnel step happened. */
export function step(name: keyof Funnel) {
  if (typeof window === "undefined") return;
  const f = read<Funnel>(FUNNEL) ?? {};
  if (!f[name]) {
    f[name] = new Date().toISOString();
    write(FUNNEL, f);
  }
}

const top = (m: Record<string, number>, n: number) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

function device() {
  const ua = navigator.userAgent;
  const w = window.screen?.width ?? window.innerWidth;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return {
    type: coarse ? (Math.min(w, window.screen?.height ?? w) >= 600 ? "tablet" : "mobile") : "desktop",
    os: /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "other",
    browser: /SamsungBrowser/.test(ua) ? "Samsung" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "other",
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  };
}

/** The summary saved against a new account. */
export function signupContext(method: "phone" | "google") {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  const v = read<Visits>(VISITS);
  const i = read<Interest>(INTEREST);
  return {
    v: 1,
    method,
    first: read<First>(FIRST),
    visits: v ? { sessions: v.sessions, days: v.days.length, first_at: v.first_at } : null,
    interest: i ? { cities: top(i.city, 3), sports: top(i.sport, 3), turfs_opened: i.turfs } : null,
    funnel: { ...(read<Funnel>(FUNNEL) ?? {}), signup: now.toISOString() },
    device: device(),
    at: { ist_hour: ist.getUTCHours(), ist_weekday: ist.getUTCDay(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, lang: navigator.language ?? null },
  };
}

/**
 * Save the summary for a just-created account, once, in the background.
 * keepalive survives the redirect after sign-in; signup never waits on it.
 */
export function saveSignupContext(userId: string, method: "phone" | "google") {
  if (typeof window === "undefined" || !userId) return;
  step("signup");
  const ctx = signupContext(method);
  gtag("event", "sign_up", { method, first_source: ctx.first?.utm.source ?? ctx.first?.ref?.split("/")[0] ?? "direct" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    void fetch(`${url}/rest/v1/rpc/save_signup_context`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_ctx: ctx }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

import { useSyncExternalStore } from "react";

/**
 * The visitor's cookie choice (components/consent/CookieBanner.tsx).
 *
 * Nothing that tracks or stores a visit runs until the visitor taps
 * Accept: Google Analytics (lib/analytics/ga.ts), the on-device visit note
 * sent at sign-up (lib/analytics/visitor.ts), the free tools' random guest
 * tag (lib/analytics/tools.ts) and Google Maps embeds. TapTurf's own
 * anonymous counts (turf page views, Call/WhatsApp taps, tool use counts)
 * run for everyone: they store nothing on the device and name no one.
 *
 * The choice is a first-party cookie, tt_consent=accepted.v1 or
 * rejected.v1, for about six months. Pages are static, so the server never
 * reads it: the browser does, after hydration (useConsent says "unknown"
 * until then, which every gate treats as no). A browser that sends Global
 * Privacy Control (navigator.globalPrivacyControl) is treated as Reject
 * until the visitor accepts in Cookie settings. A Reject, now or later,
 * stops Google Analytics on the page and deletes its cookies and the
 * on-device notes (forgetTracking). Changes apply at once, no reload.
 *
 * No imports but React's hook, so the pure parts run under node --test.
 */

export const CONSENT_COOKIE = "tt_consent";
/** Bump when what Accept covers changes: an older Accept asks again, an older Reject still holds. */
export const CONSENT_VERSION = 1;
/** About six months. */
export const CONSENT_MAX_AGE_S = 182 * 24 * 60 * 60;
export const GA_ID = "G-KRDVP16TSM";

export type ConsentChoice = "accepted" | "rejected";
/** unknown: not read yet (the server render, before hydration). unset: no choice, the banner shows. */
export type Consent = "unknown" | "unset" | "granted" | "denied";

/**
 * Every key in this browser's storage that exists only with consent:
 * lib/analytics/visitor.ts VISITOR_KEYS, lib/analytics/tools.ts
 * TOOL_DEVICE_KEY, and CitySync's "already sent city_detected" mark
 * (consent.test.ts checks the lists agree). Removed on Reject.
 */
export const CONSENTED_LOCAL_KEYS = [
  "tt_first_v1",
  "tt_visits_v1",
  "tt_interest_v1",
  "tt_funnel_v1",
  "tapturf_signup_ga_v1",
  "tapturf_signup_sent_v1",
  "tt_tools_device",
  "tapturf_city_detect_logged",
] as const;
/** logTurfView's once-per-session marks, kept only with consent. */
export const CONSENTED_SESSION_PREFIX = "tt_viewed_";

// ---------------------------------------------------------------------------
// Pure: the cookie, Global Privacy Control, Google Analytics' cookies

/** The choice in a Cookie header (or document.cookie); null when there is none to go by. */
export function parseConsentCookie(cookieHeader: string | null | undefined): ConsentChoice | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== CONSENT_COOKIE) continue;
    const m = /^(accepted|rejected)\.v(\d{1,4})$/.exec(part.slice(eq + 1).trim());
    if (!m) continue;
    const choice = m[1] as ConsentChoice;
    if (Number(m[2]) === CONSENT_VERSION) return choice;
    // An Accept given for an older version covers less than now: ask again. A Reject holds.
    if (choice === "rejected") return choice;
  }
  return null;
}

/** The Set-Cookie text for a choice. */
export function consentCookie(choice: ConsentChoice, secure: boolean): string {
  return `${CONSENT_COOKIE}=${choice}.v${CONSENT_VERSION}; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** What the site may do: a stored choice wins, else Global Privacy Control is a Reject, else ask. */
export function consentOf(choice: ConsentChoice | null, gpc: boolean): Exclude<Consent, "unknown"> {
  if (choice === "accepted") return "granted";
  if (choice === "rejected" || gpc) return "denied";
  return "unset";
}

/** Google Analytics' cookies in a Cookie header: _ga, _ga_<id>, _gid, _gat*, _gac_*, _gcl_*. */
export function gaCookieNames(cookieHeader: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const name = part.split("=")[0].trim();
    if (/^_(ga|gid|gat|gac|gcl)(_|$)/.test(name)) out.add(name);
  }
  return [...out];
}

/**
 * The Domain values a cookie for this host can have been set with: none
 * (host-only), then the host and each parent domain with and without the
 * leading dot. GA sets _ga on the widest one it can (.tapturf.in).
 */
export function cookieDomains(hostname: string): (string | null)[] {
  const out: (string | null)[] = [null];
  const host = hostname.toLowerCase();
  if (!host || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return out;
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    out.push(d, `.${d}`);
  }
  return out;
}

/** The cookie text that deletes name on path / for one Domain value. */
export function expiredCookie(name: string, domain: string | null): string {
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${domain ? `; Domain=${domain}` : ""}`;
}

// ---------------------------------------------------------------------------
// The browser's store

type GaWindow = Window & { gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

const inBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

let current: Exclude<Consent, "unknown"> | null = null;
let settingsOpen = false;
let watching = false;
const listeners = new Set<() => void>();

function readCookie(): string {
  try {
    return document.cookie;
  } catch {
    return "";
  }
}

/** Whether this browser sends Global Privacy Control. */
export function gpcOn(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** The choice stored in this browser, if any (GPC is not a stored choice). */
export function storedChoice(): ConsentChoice | null {
  return inBrowser() ? parseConsentCookie(readCookie()) : null;
}

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* a listener's problem stays its own */
    }
  }
}

/** Another tab may have changed the choice: read it again when this one comes back. */
function refresh() {
  if (current === null) return;
  const next = consentOf(storedChoice(), gpcOn());
  if (next === current) return;
  const was = current;
  current = next;
  if (was === "granted" && next !== "granted") forgetTracking();
  emit();
}

function watch() {
  if (watching || !inBrowser()) return;
  watching = true;
  try {
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
    window.addEventListener("pageshow", refresh);
  } catch {
    /* ignore */
  }
}

/** The consent now. "unknown" on the server. */
export function getConsent(): Consent {
  if (!inBrowser()) return "unknown";
  if (current === null) {
    current = consentOf(storedChoice(), gpcOn());
    watch();
  }
  return current;
}

/** Whether Google Analytics, the visit note, the tool tag and map embeds may run. */
export function analyticsAllowed(): boolean {
  return getConsent() === "granted";
}

/** Store the visitor's choice and apply it at once. Reject also forgets what was kept. */
export function setConsent(choice: ConsentChoice): void {
  if (!inBrowser()) return;
  try {
    document.cookie = consentCookie(choice, window.location.protocol === "https:");
  } catch {
    /* cookies blocked: the choice still holds for this page */
  }
  current = choice === "accepted" ? "granted" : "denied";
  watch();
  if (current === "denied") forgetTracking();
  settingsOpen = false;
  emit();
}

/**
 * Stop Google Analytics on this page and delete what needs consent:
 * GA's cookies on every domain they may sit on, the on-device visit note,
 * the tools' guest tag and the turf view marks. GA's own flag
 * (ga-disable-<id>) stops any hit still queued; removing window.gtag makes
 * every caller's gtag?.() a no-op. lib/analytics/ga.ts brings both back
 * only after a new Accept.
 */
export function forgetTracking(): void {
  if (!inBrowser()) return;
  const w = window as unknown as GaWindow;
  try {
    w[`ga-disable-${GA_ID}`] = true;
    w.gtag?.("consent", "update", { analytics_storage: "denied" });
  } catch {
    /* ignore */
  }
  try {
    delete w.gtag;
  } catch {
    w.gtag = undefined;
  }
  try {
    const domains = cookieDomains(window.location.hostname);
    for (const name of gaCookieNames(readCookie())) {
      for (const d of domains) document.cookie = expiredCookie(name, d);
    }
  } catch {
    /* ignore */
  }
  for (const k of CONSENTED_LOCAL_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage blocked: nothing was kept */
    }
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CONSENTED_SESSION_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Called when the consent or the settings banner changes; returns the unsubscribe. */
export function subscribeConsent(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Cookie settings (the footer, the menu, the privacy page): show the banner again. */
export function openCookieSettings(): void {
  settingsOpen = true;
  emit();
}

export function closeCookieSettings(): void {
  if (!settingsOpen) return;
  settingsOpen = false;
  emit();
}

export const cookieSettingsOpen = (): boolean => settingsOpen;

/** Whether the banner shows: no choice yet, or Cookie settings opened it. Never before hydration. */
export function bannerShown(): boolean {
  return inBrowser() && (settingsOpen || getConsent() === "unset");
}

const unknownConsent = (): Consent => "unknown";
const noBanner = () => false;

/** The consent, live. "unknown" in the server render and the hydration pass. */
export function useConsent(): Consent {
  return useSyncExternalStore(subscribeConsent, getConsent, unknownConsent);
}

/** Whether the cookie banner is on screen, live. */
export function useCookieBanner(): boolean {
  return useSyncExternalStore(subscribeConsent, bannerShown, noBanner);
}

/** Cookie settings opened the banner (it then says what the choice is now, and closes). */
export function useCookieSettingsOpen(): boolean {
  return useSyncExternalStore(subscribeConsent, cookieSettingsOpen, noBanner);
}

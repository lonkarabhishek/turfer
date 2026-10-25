/**
 * Apps that open links in their own browser (Instagram, Facebook and so
 * on). Google refuses sign-ins there, so /login says so and offers Chrome
 * or the phone number instead. Relative imports only (npm run test:account).
 */

const APPS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/, "Facebook"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/\bLine\//, "LINE"],
  [/musical_ly|TikTok|BytedanceWebview/i, "TikTok"],
  [/Twitter/i, "X"],
];

export type InApp = { app: string | null; os: "android" | "ios" };

/** The in-app browser this user agent is, or null for a real browser. */
export function inAppBrowser(ua: string | null | undefined): InApp | null {
  if (!ua) return null;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  if (!ios && !android) return null;
  const os = ios ? "ios" : "android";
  for (const [re, app] of APPS) if (re.test(ua)) return { app, os };
  // Android WebView: "; wv)". Google's own app is a real browser for this.
  if (android && /; wv\)/.test(ua) && !/\bGSA\//.test(ua)) return { app: null, os };
  // iOS WKWebView: no "Safari/", and not Chrome, Firefox, Edge or the Google app.
  if (ios && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua)) return { app: null, os };
  return null;
}

/** Opens this page of www.tapturf.in in Chrome on Android (falls back to the same address). */
export function chromeIntent(path: string): string {
  const p = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const url = `https://www.tapturf.in${p}`;
  return `intent://www.tapturf.in${p}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

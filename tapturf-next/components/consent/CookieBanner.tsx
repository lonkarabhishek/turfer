"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  closeCookieSettings,
  forgetTracking,
  getConsent,
  setConsent,
  storedChoice,
  useConsent,
  useCookieBanner,
  useCookieSettingsOpen,
} from "@/lib/consent";

/** Both choices look and weigh the same: no nudge either way. */
const CHOICE =
  "h-11 rounded-full bg-primary-900 text-white text-[15px] font-semibold hover:bg-primary-700 active:bg-primary-950 transition-colors focus-neon";

/**
 * The cookie banner (lib/consent.ts). Shown only in the browser, once
 * the page has hydrated and only when no choice is stored, so a visitor
 * who chose never sees it flash. A fixed card above the phone's bottom
 * nav and a turf page's Call/WhatsApp bar (z-50), below sheets and
 * modals (z-60); bottom left on desktop. Not a dialog: nothing is blocked and
 * focus is never trapped. First in the page, so the keyboard reaches it
 * first. Cookie settings (the menu, the footer, the privacy page) opens
 * it again, moves focus to it and says what the choice is now; Esc or ×
 * closes it then. PolicyNotice waits while it is on screen.
 */
export function CookieBanner() {
  const shown = useCookieBanner();
  const reopened = useCookieSettingsOpen();
  const consent = useConsent();
  const box = useRef<HTMLElement>(null);

  // A Reject that is already in place (stored, or Global Privacy Control) also
  // clears what a visit before the banner existed may have left behind.
  useEffect(() => {
    if (getConsent() === "denied") forgetTracking();
  }, []);

  useEffect(() => {
    if (!reopened) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCookieSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [reopened]);

  if (!shown) return null;

  const now = !reopened
    ? null
    : consent === "granted"
      ? "Now: accepted. Google Analytics and Google maps are on."
      : consent === "denied"
        ? storedChoice() === "rejected"
          ? "Now: rejected. They stay off."
          : "Now: off, because your browser sends Global Privacy Control."
        : null;

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-labelledby="tt-cookie-title"
      aria-describedby="tt-cookie-text"
      data-cookie-banner=""
      className="fixed z-[55] left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] md:left-6 md:right-auto md:bottom-6 md:w-[26rem] outline-none print:hidden animate-slide-up"
    >
      <div className="rounded-2xl bg-white border border-primary-200 shadow-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="tt-cookie-title" className="text-[15px] font-semibold text-primary-900">
            {reopened ? "Cookie settings" : "Cookies on TapTurf"}
          </h2>
          {reopened && (
            <button
              type="button"
              onClick={closeCookieSettings}
              aria-label="Close cookie settings"
              className="shrink-0 -mt-1.5 -mr-1.5 w-9 h-9 rounded-full inline-flex items-center justify-center text-primary-500 hover:bg-primary-100 focus-neon"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p id="tt-cookie-text" className="mt-1 text-[13.5px] leading-snug text-primary-700">
          We&rsquo;d like to use Google Analytics and similar tools to see how TapTurf is used, and to show maps from
          Google. They load only if you accept. TapTurf&rsquo;s own anonymous counts run either way and keep nothing
          on your device.{" "}
          <Link href="/privacy#cookies" className="font-semibold text-primary-900 underline underline-offset-2">
            Privacy
          </Link>
        </p>
        {now && <p className="mt-2 text-[13px] font-medium text-primary-600">{now}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConsent("accepted")} className={CHOICE}>
            Accept
          </button>
          <button type="button" onClick={() => setConsent("rejected")} className={CHOICE}>
            Reject
          </button>
        </div>
      </div>
    </section>
  );
}

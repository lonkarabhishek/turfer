"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Info, X } from "lucide-react";
import { getPermission, requestPermission, type PermissionState } from "@/lib/notifications/browser";

const DISMISS_KEY = "notif_prompt_dismissed_v1";

/**
 * Inline card for browser notifications.
 * Renders a useful message for EVERY state so the user isn't left
 * wondering where the "Turn on" button went:
 *  - default     → "Turn on" call-to-action
 *  - granted     → "You're all set" chip (auto-dismissible)
 *  - denied      → "Notifications are blocked" + how to re-enable
 *  - unsupported → iOS/PWA install hint (only on iOS Safari) or hidden
 */
export function NotificationsPrompt() {
  const [state, setState] = useState<PermissionState>("unsupported");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setState(getPermission());
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch { /* SSR */ }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const handleEnable = async () => {
    const next = await requestPermission();
    setState(next);
  };

  // ── granted: subtle "on" chip (auto-hide after 4s) ──
  if (state === "granted") {
    return (
      <div className="flex items-center gap-2 bg-accent-50 border border-accent-500/30 rounded-full pl-2 pr-3 py-1.5 mb-4 text-[12px] font-semibold text-accent-700 self-start w-fit">
        <span className="w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </span>
        Alerts are on
        <button onClick={handleDismiss} className="ml-1 text-accent-600 hover:text-accent-800" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ── denied: user has actively blocked ──
  if (state === "denied") {
    return (
      <div className="flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-2xl p-3.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary-800 flex items-center justify-center shrink-0">
          <BellOff className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-primary-800 leading-tight">
            Notifications are blocked
          </p>
          <p className="text-[12px] text-primary-600 mt-0.5 leading-snug">
            To turn them back on, tap the lock/aA icon in the URL bar → Site settings → Notifications → Allow.
          </p>
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
          <X className="w-4 h-4 text-primary-500" />
        </button>
      </div>
    );
  }

  // ── unsupported: iOS Safari before install, older browsers ──
  if (state === "unsupported") {
    const isIOS = typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return null; // On other browsers, just hide silently.
    return (
      <div className="flex items-start gap-3 bg-accent-50 border border-accent-500/30 rounded-2xl p-3.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center shrink-0 shadow-neon">
          <Info className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-primary-800 leading-tight">
            Install TapTurf to get alerts
          </p>
          <p className="text-[12px] text-primary-600 mt-0.5 leading-snug">
            iPhone Safari: tap <b>Share</b> → <b>Add to Home Screen</b>. Open TapTurf from the home-screen icon to enable notifications.
          </p>
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
          <X className="w-4 h-4 text-primary-500" />
        </button>
      </div>
    );
  }

  // ── default: the main call-to-action ──
  return (
    <div className="flex items-start gap-3 bg-accent-50 border border-accent-500/30 rounded-2xl p-3.5 mb-4">
      <div className="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center shrink-0 shadow-neon">
        <Bell className="w-5 h-5 text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-primary-800 leading-tight">
          Never miss a game
        </p>
        <p className="text-[12px] text-primary-600 mt-0.5 mb-2.5 leading-snug">
          Get pinged the second someone joins your game or accepts your request.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnable}
            className="text-[12px] font-bold uppercase tracking-wide bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-full transition-colors focus-neon"
          >
            Turn on
          </button>
          <button
            onClick={handleDismiss}
            className="text-[12px] font-semibold text-primary-500 hover:text-primary-700 px-2 py-1.5"
          >
            Not now
          </button>
        </div>
      </div>
      <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
        <X className="w-4 h-4 text-primary-500" />
      </button>
    </div>
  );
}

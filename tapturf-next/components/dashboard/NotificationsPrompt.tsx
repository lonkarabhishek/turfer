"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, X, Share, MoreVertical, ChevronRight } from "lucide-react";
import { getPermission, requestPermission, type PermissionState } from "@/lib/notifications/browser";
import { InstallGuide, type BeforeInstallPromptEvent } from "@/components/install/InstallGuide";

const DISMISS_KEY = "notif_prompt_dismissed_v1";
const INSTALL_DISMISS_KEY = "install_prompt_dismissed_v1";

type Device = "ios" | "android" | "desktop" | "unknown";

function detectDevice(): Device {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = "standalone" in window.navigator &&
    (window.navigator as unknown as { standalone: boolean }).standalone === true;
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || displayModeStandalone;
}

export function NotificationsPrompt() {
  const [state, setState] = useState<PermissionState>("unsupported");
  const [dismissed, setDismissed] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [device, setDevice] = useState<Device>("unknown");
  const [standalone, setStandalone] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setState(getPermission());
    setDevice(detectDevice());
    setStandalone(isStandalone());
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
      if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") setInstallDismissed(true);
    } catch { /* SSR */ }

    // Capture Chrome's install prompt so we can offer one-tap install
    // in the guide. Fires once; keep the event around for later use.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const handleInstallDismiss = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const handleEnable = async () => {
    const next = await requestPermission();
    setState(next);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    // If we used deferredPrompt inside the guide, event is spent.
    setDeferredPrompt(null);
  };

  // The full guided-tour modal
  const guideModal = guideOpen && (device === "ios" || device === "android") ? (
    <InstallGuide device={device} onClose={closeGuide} deferredPrompt={deferredPrompt} />
  ) : null;

  // ── granted ──
  if (state === "granted" && !dismissed) {
    return (
      <>
        <div className="flex items-center gap-2 bg-accent-50 border border-accent-500/30 rounded-full pl-2 pr-3 py-1.5 mb-4 text-[12px] font-semibold text-accent-700 self-start w-fit">
          <span className="w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </span>
          Alerts are on
          <button onClick={handleDismiss} className="ml-1 text-accent-600 hover:text-accent-800" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {guideModal}
      </>
    );
  }

  // ── denied ──
  if (state === "denied" && !dismissed) {
    const settingsHint =
      device === "ios"
        ? "Tap the aA icon in Safari's URL bar → Website Settings → Notifications → Allow."
        : device === "android"
        ? "Tap the ⋮ menu in Chrome → Site settings → Notifications → Allow."
        : "Click the lock/info icon left of the URL → Site settings → Notifications → Allow.";
    return (
      <>
        <div className="flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-2xl p-3.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary-800 flex items-center justify-center shrink-0">
            <BellOff className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-primary-800 leading-tight">
              Notifications are blocked
            </p>
            <p className="text-[12px] text-primary-600 mt-0.5 leading-snug">{settingsHint}</p>
          </div>
          <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>
        {guideModal}
      </>
    );
  }

  // ── mobile browser, not installed → offer guided tour ──
  if (!standalone && (device === "ios" || device === "android") && !installDismissed) {
    return (
      <>
        <div className="flex items-start gap-3 bg-accent-50 border border-accent-500/30 rounded-2xl p-3.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center shrink-0 shadow-neon">
            {device === "ios" ? (
              <Share className="w-5 h-5 text-white" strokeWidth={2.5} />
            ) : (
              <MoreVertical className="w-5 h-5 text-white" strokeWidth={2.5} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-primary-800 leading-tight">
              Install TapTurf for alerts
            </p>
            <p className="text-[12px] text-primary-600 mt-0.5 mb-2.5 leading-snug">
              {device === "ios"
                ? "Add TapTurf to your home screen. Takes 3 taps."
                : "Add TapTurf to your home screen. One tap if Chrome asks; otherwise 3 taps."}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-full transition-colors focus-neon"
              >
                Show me how
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.75} />
              </button>
              {/* On Android we can still offer plain Turn-on without install */}
              {device === "android" && state === "default" && (
                <button
                  onClick={handleEnable}
                  className="text-[12px] font-semibold text-primary-500 hover:text-primary-700 px-2 py-1.5"
                >
                  Just turn on for now
                </button>
              )}
            </div>
          </div>
          <button onClick={handleInstallDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>
        {guideModal}
      </>
    );
  }

  // ── desktop unsupported → hide ──
  if (state === "unsupported") return null;

  // ── default (standalone or Android Chrome): plain "Turn on" ──
  if (state === "default" && !dismissed) {
    return (
      <>
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
        {guideModal}
      </>
    );
  }

  return null;
}

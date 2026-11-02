"use client";

import { useState } from "react";
import { Bell, BellOff, Check, X, Share, ChevronRight, Loader2 } from "lucide-react";
import { InstallGuide } from "@/components/install/InstallGuide";
import { usePush } from "@/components/push/usePush";
import { blockedHint, PushNoteLine } from "@/components/push/PushSwitch";

// v2: phone notifications (Web Push) are new, so anyone who put away the
// old in-tab prompt hears about them once.
const DISMISS_KEY = "notif_prompt_dismissed_v2";
const INSTALL_DISMISS_KEY = "install_prompt_dismissed_v2";

/**
 * The nudge above the Me tab's sections, for "Notifications on this
 * phone" (the switch in Alerts, components/push/PushSwitch.tsx; the same
 * state, so both say the same): Turn on where this browser can get them,
 * the Home Screen steps on an iPhone in Safari, how to allow them again
 * when they were refused, a small "on" note once they are on. Each can be
 * put away. Nothing until the server can send them.
 */
/** A prompt put away on this device (false on the server: nothing shows there until the push state is read anyway). */
function putAway(key: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function NotificationsPrompt() {
  const push = usePush();
  const [dismissed, setDismissed] = useState(() => putAway(DISMISS_KEY));
  const [installDismissed, setInstallDismissed] = useState(() => putAway(INSTALL_DISMISS_KEY));
  const [guideOpen, setGuideOpen] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const handleInstallDismiss = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const guideModal = guideOpen ? <InstallGuide device="ios" onClose={() => setGuideOpen(false)} /> : null;

  // ── on ──
  if (push.view === "on" && !dismissed) {
    return (
      <div className="flex items-center gap-2 bg-accent-50 border border-accent-500/30 rounded-full pl-2 pr-3 py-1.5 mb-4 text-[12px] font-semibold text-accent-700 self-start w-fit">
        <span className="w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </span>
        Notifications are on for this phone
        <button onClick={handleDismiss} className="ml-1 text-accent-600 hover:text-accent-800" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ── blocked ──
  if (push.view === "blocked" && !dismissed) {
    return (
      <div className="flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-2xl p-3.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary-800 flex items-center justify-center shrink-0">
          <BellOff className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-primary-800 leading-tight">
            Notifications are blocked
          </p>
          <p className="text-[12px] text-primary-600 mt-0.5 leading-snug">{blockedHint()}</p>
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
          <X className="w-4 h-4 text-primary-500" />
        </button>
      </div>
    );
  }

  // ── iPhone in Safari: Home Screen first ──
  if (push.view === "ios-install" && !installDismissed) {
    return (
      <>
        <div className="flex items-start gap-3 bg-accent-50 border border-accent-500/30 rounded-2xl p-3.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center shrink-0 shadow-neon">
            <Share className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-primary-800 leading-tight">
              Get game alerts on your iPhone
            </p>
            <p className="text-[12px] text-primary-600 mt-0.5 mb-2.5 leading-snug">
              Add TapTurf to your Home Screen, open it from there, then turn on notifications in Alerts.
            </p>
            <button
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1 text-[12px] font-bold bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-full transition-colors focus-neon"
            >
              Show me how
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.75} />
            </button>
          </div>
          <button onClick={handleInstallDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>
        {guideModal}
      </>
    );
  }

  // ── off: one tap turns them on ──
  if (push.view === "off" && !dismissed) {
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
            Get a buzz on this phone when someone asks to join your game or accepts your request, even with TapTurf closed.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={push.turnOn}
              disabled={!!push.busy}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold bg-accent-500 hover:bg-accent-600 disabled:opacity-70 text-white px-3 py-1.5 rounded-full transition-colors focus-neon"
            >
              {push.busy === "on" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
              Turn on
            </button>
            <button
              onClick={handleDismiss}
              className="text-[12px] font-semibold text-primary-500 hover:text-primary-700 px-2 py-1.5"
            >
              Not now
            </button>
          </div>
          <PushNoteLine note={push.note} />
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/50 shrink-0">
          <X className="w-4 h-4 text-primary-500" />
        </button>
      </div>
    );
  }

  return null;
}

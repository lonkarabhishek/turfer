"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Share, MoreVertical, Plus, Check, ChevronRight, Zap } from "lucide-react";

type Device = "ios" | "android" | "desktop";

interface Step {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}

const IOS_STEPS: Step[] = [
  {
    icon: <Share className="w-6 h-6" strokeWidth={2.25} />,
    title: "Tap the Share button",
    body: (
      <>
        Look for the <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 font-semibold text-[12px]"><Share className="w-3 h-3" strokeWidth={2.5} /> Share</span> icon
        {" "}— a square with an arrow going up. It&apos;s at the bottom of Safari.
      </>
    ),
  },
  {
    icon: <Plus className="w-6 h-6" strokeWidth={2.5} />,
    title: "Add to Home Screen",
    body: (
      <>
        Scroll the share menu until you see <b>Add to Home Screen</b>. Tap it.
      </>
    ),
  },
  {
    icon: <Check className="w-6 h-6" strokeWidth={2.75} />,
    title: "Tap Add",
    body: (
      <>
        Top-right corner. That&apos;s it — a TapTurf icon lands on your home screen.
        Open it from there to get game alerts.
      </>
    ),
  },
];

const ANDROID_MANUAL_STEPS: Step[] = [
  {
    icon: <MoreVertical className="w-6 h-6" strokeWidth={2.5} />,
    title: "Open the menu",
    body: (
      <>
        Tap the <b>⋮</b> three-dots menu at the top right of Chrome.
      </>
    ),
  },
  {
    icon: <Plus className="w-6 h-6" strokeWidth={2.5} />,
    title: "Install app",
    body: (
      <>
        Tap <b>Install app</b> (some phones say <b>Add to Home screen</b> — same thing).
      </>
    ),
  },
  {
    icon: <Check className="w-6 h-6" strokeWidth={2.75} />,
    title: "Tap Install",
    body: (
      <>
        Chrome will confirm. TapTurf gets pinned to your home screen with proper notification support.
      </>
    ),
  },
];

/**
 * Full guided-install sheet.
 * Auto-picks the platform's steps. On Android Chrome, if we've
 * captured beforeinstallprompt, offers a one-tap "Install now"
 * button that fires the native prompt.
 */
export function InstallGuide({
  device,
  onClose,
  deferredPrompt,
}: {
  device: Device;
  onClose: () => void;
  deferredPrompt?: BeforeInstallPromptEvent | null;
}) {
  const steps = useMemo(() => (device === "ios" ? IOS_STEPS : ANDROID_MANUAL_STEPS), [device]);
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;
  const canOneTap = device === "android" && !!deferredPrompt;

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = steps[step];

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      // The event can only be used once; caller is responsible for clearing.
      onClose();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary-800/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated animate-slide-up">
        {/* Grabber (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors"
        >
          <X className="w-4 h-4 text-primary-500" />
        </button>

        <div className="px-6 pt-6 sm:pt-8 pb-6">
          {/* Header row */}
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center shadow-neon shrink-0">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.75} />
            </span>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-accent-600">
              Install TapTurf · {device === "ios" ? "iPhone" : device === "android" ? "Android" : "Web"}
            </p>
          </div>
          <h2 className="font-display uppercase text-3xl text-primary-800 leading-none tracking-tight mb-4">
            Get it on your<br />home screen
          </h2>

          {/* One-tap install (Android with native prompt available) */}
          {canOneTap && (
            <div className="mb-5">
              <button
                onClick={handleNativeInstall}
                className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-bold uppercase tracking-wide px-4 py-3.5 min-h-[52px] rounded-full transition-colors shadow-neon focus-neon"
              >
                <Plus className="w-5 h-5" strokeWidth={2.75} />
                Install now — one tap
              </button>
              <p className="text-[12px] text-primary-500 text-center mt-2.5">
                Or follow the manual steps below.
              </p>
            </div>
          )}

          {/* ── Step card ── */}
          <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white border border-primary-200 flex items-center justify-center text-accent-600 shrink-0 shadow-soft animate-step-in" key={step}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary-500 mb-1">
                  Step {step + 1} of {steps.length}
                </p>
                <p className="font-display uppercase text-xl text-primary-800 leading-tight tracking-wide">
                  {s.title}
                </p>
                <p className="text-[13px] text-primary-700 leading-snug mt-2">
                  {s.body}
                </p>
              </div>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 my-4">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-accent-500" : "w-1.5 bg-primary-300"
                }`}
                aria-hidden
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="text-[13px] font-semibold text-primary-500 hover:text-primary-800 px-4 py-2.5"
              >
                Back
              </button>
            ) : (
              <div className="flex-1" />
            )}
            <div className="flex-1" />
            {isLast ? (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 bg-primary-800 hover:bg-primary-900 text-white font-bold uppercase tracking-wide text-[13px] px-5 py-2.5 rounded-full transition-colors shadow-soft focus-neon"
              >
                Got it
                <Check className="w-4 h-4" strokeWidth={2.75} />
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 bg-accent-500 hover:bg-accent-600 text-white font-bold uppercase tracking-wide text-[13px] px-5 py-2.5 rounded-full transition-colors shadow-neon focus-neon"
              >
                Next
                <ChevronRight className="w-4 h-4" strokeWidth={2.75} />
              </button>
            )}
          </div>
        </div>

        {/* iOS safe area */}
        <div className="sm:hidden h-[env(safe-area-inset-bottom)] bg-white" />
      </div>

      <style jsx>{`
        @keyframes step-in {
          0%   { opacity: 0; transform: scale(0.85) rotate(-8deg); }
          60%  { opacity: 1; transform: scale(1.06) rotate(3deg); }
          100% { opacity: 1; transform: scale(1)    rotate(0);   }
        }
        :global(.animate-step-in) {
          animation: step-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}

// Minimal BeforeInstallPromptEvent type since it isn't in lib.dom.
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

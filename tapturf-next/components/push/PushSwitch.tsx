"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Loader2, Send, Share, SquarePlus, Smartphone } from "lucide-react";
import { InstallGuide } from "@/components/install/InstallGuide";
import { useInApp } from "@/lib/auth/useInApp";
import { isStandalone } from "@/lib/push/client";
import { usePush, type PushNote } from "./usePush";

/** How to allow notifications again after they were refused, on this kind of phone. */
export function blockedHint(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "Open your iPhone's Settings, tap Notifications, then TapTurf, and turn on Allow Notifications. Then come back here.";
  }
  if (/Android/.test(ua)) {
    return isStandalone()
      ? "Press and hold the TapTurf icon, tap App info, then Notifications, and allow them. Then come back here."
      : "In Chrome, tap ⋮, then Settings, Site settings, Notifications, and allow tapturf.in. Then come back here.";
  }
  return "Click the icon at the left of the address bar, allow Notifications for tapturf.in, then reload this page.";
}

export function PushNoteLine({ note }: { note: PushNote | null }) {
  if (!note) return null;
  return (
    <p role="status" className={`mt-2 text-[12px] font-medium leading-snug ${note.tone === "ok" ? "text-accent-700" : "text-hot-600"}`}>
      {note.text}
    </p>
  );
}

/** The three steps on an iPhone in Safari: add to the Home Screen, open it from there, then turn this on. */
export function IosSteps({ onShowMe }: { onShowMe: () => void }) {
  const inApp = useInApp();
  const steps = [
    ...(inApp ? [<>Open tapturf.in in <b>Safari</b> (this is {inApp.app ? `${inApp.app}'s` : "an app's"} own browser).</>] : []),
    <>
      Tap <Share className="inline w-3.5 h-3.5 -mt-0.5" strokeWidth={2.5} aria-label="Share" /> <b>Share</b> at the bottom of Safari.
    </>,
    <>
      Tap <SquarePlus className="inline w-3.5 h-3.5 -mt-0.5" strokeWidth={2.5} aria-hidden /> <b>Add to Home Screen</b>, then <b>Add</b>.
    </>,
    <>Open <b>TapTurf from your Home Screen</b>, then turn this on.</>,
  ];
  return (
    <>
      <ol className="mt-2.5 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-primary-700 leading-snug">
            <span className="grid place-items-center w-5 h-5 shrink-0 rounded-full bg-accent-500 text-white text-[11px] font-bold tabular-nums" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onShowMe}
        className="mt-3 inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[13px] font-bold transition-colors focus-neon"
      >
        Show me how
      </button>
    </>
  );
}

/**
 * "Notifications on this phone", the switch at the top of the Me tab's
 * Alerts: on, it asks the phone and subscribes this browser (lib/push);
 * off, it stops them here. Shown only where Web Push works, and on an
 * iPhone in Safari with the steps to get there; "coming soon" until the
 * server can send.
 */
export function PushSwitch({ className = "" }: { className?: string }) {
  const push = usePush();
  const [guide, setGuide] = useState(false);
  const { view, busy } = push;
  if (view === "loading" || view === "none") return null;

  const on = view === "on";
  const canSwitch = view === "on" || view === "off";
  const others = Math.max(0, push.devices - (on ? 1 : 0));
  const detail =
    view === "soon"
      ? "A buzz when someone asks to join your game or accepts your request, even with TapTurf closed."
      : view === "ios-install"
        ? "On an iPhone, notifications work in TapTurf on your Home Screen:"
        : view === "ios-update"
          ? "Update your iPhone to iOS 16.4 or later to get notifications from TapTurf."
          : view === "blocked"
            ? blockedHint()
            : on
              ? `On for this phone.${others ? ` Also on ${others} other ${others === 1 ? "device" : "devices"}.` : ""}`
              : "Get a buzz when someone asks to join your game or accepts your request, even with TapTurf closed.";

  return (
    <section aria-label="Notifications on this phone" className={`rounded-2xl border border-primary-200 bg-white p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`grid place-items-center w-10 h-10 shrink-0 rounded-xl ${on ? "bg-accent-500 shadow-neon" : "bg-accent-50 border border-accent-500/30"}`} aria-hidden>
          {view === "blocked" ? (
            <BellOff className="w-5 h-5 text-accent-600" strokeWidth={2.25} />
          ) : view === "ios-install" || view === "ios-update" ? (
            <Smartphone className="w-5 h-5 text-accent-600" strokeWidth={2.25} />
          ) : (
            <Bell className={`w-5 h-5 ${on ? "text-white" : "text-accent-600"}`} strokeWidth={2.25} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {canSwitch ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              disabled={!!busy}
              onClick={on ? push.turnOff : push.turnOn}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left cursor-pointer disabled:cursor-wait focus-neon rounded-xl"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-primary-900">Notifications on this phone</span>
                <span className="block text-[13px] text-primary-500 mt-0.5 leading-snug">{detail}</span>
              </span>
              <span className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors ${on ? "bg-accent-500" : "bg-primary-300"}`} aria-hidden>
                <span
                  className={`absolute top-[2px] left-[2px] grid place-items-center w-[27px] h-[27px] bg-white rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${on ? "translate-x-[20px]" : ""}`}
                >
                  {(busy === "on" || busy === "off") && <Loader2 className="w-3.5 h-3.5 text-accent-600 animate-spin" />}
                </span>
              </span>
            </button>
          ) : (
            <>
              <p className="flex items-start justify-between gap-2 text-[15px] font-semibold text-primary-900">
                Notifications on this phone
                {view === "soon" && (
                  <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-bold text-primary-600">Coming soon</span>
                )}
              </p>
              <p className="text-[13px] text-primary-500 mt-0.5 leading-snug">{detail}</p>
            </>
          )}

          {view === "ios-install" && <IosSteps onShowMe={() => setGuide(true)} />}

          {canSwitch && (
            <p className="mt-1 text-[12px] text-primary-500">
              We keep this phone&apos;s push address with your account.{" "}
              <Link href="/privacy#push" className="font-semibold text-primary-700 underline underline-offset-2">
                Privacy
              </Link>
            </p>
          )}

          {on && (
            <button
              type="button"
              onClick={push.test}
              disabled={!!busy}
              className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full border border-primary-200 bg-white text-[13px] font-semibold text-primary-700 hover:border-accent-500 hover:text-accent-700 disabled:opacity-60 transition-colors focus-neon"
            >
              {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              Send me a test
            </button>
          )}
          <PushNoteLine note={push.note} />
        </div>
      </div>
      {guide && <InstallGuide device="ios" onClose={() => setGuide(false)} />}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { getPermission, requestPermission, type PermissionState } from "@/lib/notifications/browser";

/**
 * Inline prompt asking the user to allow browser notifications so
 * they get pinged the moment someone joins/accepts their game.
 * Renders only if the browser supports Notifications and permission
 * is still "default". Hides itself after grant / deny / dismiss.
 */
export function NotificationsPrompt() {
  const [state, setState] = useState<PermissionState>("unsupported");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setState(getPermission());
  }, []);

  if (dismissed) return null;
  if (state !== "default") return null;

  const handleEnable = async () => {
    const next = await requestPermission();
    setState(next);
  };

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
          Get pinged when someone joins or accepts.
          On iPhone, add TapTurf to your home screen first.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnable}
            className="text-[12px] font-bold uppercase tracking-wide bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-full transition-colors focus-neon"
          >
            Turn on
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-[12px] font-semibold text-primary-500 hover:text-primary-700 px-2 py-1.5"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="p-1 rounded-full hover:bg-white/50 transition-colors shrink-0"
      >
        <X className="w-4 h-4 text-primary-500" />
      </button>
    </div>
  );
}

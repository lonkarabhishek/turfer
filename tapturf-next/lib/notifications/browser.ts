"use client";

import { pushOnHere } from "@/lib/push/client";

/**
 * Browser Notification helpers — the light-touch layer.
 * Handles permission state + fires native OS notifications while the
 * tab is open (or backgrounded but not fully unloaded).
 *
 * Phones get notifications with TapTurf closed through Web Push
 * (lib/push, the "Notifications on this phone" switch on the Me tab).
 * Where that is on, the push itself rings, so notify() stays quiet and
 * nothing rings twice; elsewhere it still rings an open tab. An iPhone
 * never shows these: only pushes, in TapTurf added to the Home Screen.
 */

export type PermissionState = "unsupported" | "default" | "granted" | "denied";

export function getPermission(): PermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result as PermissionState;
  } catch {
    return "denied";
  }
}

export function notify(title: string, body: string, tag?: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  void pushOnHere().then((pushed) => {
    if (pushed) return;
    try {
      new Notification(title, {
        body,
        tag: tag ?? "tapturf",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        silent: false,
      });
    } catch {
      /* some browsers throw if invoked from a background tab; ignore */
    }
  });
}

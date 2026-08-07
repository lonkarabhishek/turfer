"use client";

/**
 * Browser Notification helpers — the light-touch layer.
 * Handles permission state + fires native OS notifications while the
 * tab is open (or backgrounded but not fully unloaded).
 *
 * Full-blown Web Push (via service worker + VAPID) is a bigger lift
 * requiring a server-side sender; this layer at least lets a phone
 * ring/vibrate when a request comes in while the user has TapTurf
 * open in a tab. For iOS Safari, the site must be installed to the
 * home screen first — the manifest at /manifest.webmanifest enables
 * the "Add to Home Screen" prompt.
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
}

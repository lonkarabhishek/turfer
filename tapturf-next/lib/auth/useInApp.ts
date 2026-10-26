"use client";

import { useSyncExternalStore } from "react";
import { inAppBrowser, type InApp } from "./inApp";

const noSubscribe = () => () => {};
let seen: InApp | null | undefined;

function read(): InApp | null {
  if (seen !== undefined) return seen;
  // Added to the home screen (as NotificationsPrompt checks): a real browser, not an app's.
  const standalone = (navigator as { standalone?: boolean }).standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches;
  return (seen = inAppBrowser(navigator.userAgent, standalone));
}

/** The app's own browser this page is open in (Instagram and so on), where Google sign-in fails; null in a real browser and on the server. */
export function useInApp(): InApp | null {
  return useSyncExternalStore(noSubscribe, read, () => null);
}

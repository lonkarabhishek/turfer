"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PRIVACY_NOTICE } from "@/lib/policy";

/**
 * The privacy policy promises a notice on the site when what we collect
 * changes. Shown once per device to signed-in people (the ones the change
 * is about), on browsing pages only, never over a dialog or while they
 * type, and never before the page has settled. Dismissing it, or opening
 * the policy from it, remembers it on this device.
 */

const SEEN_KEY = "tapturf_policy_seen";

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === PRIVACY_NOTICE.id;
  } catch {
    return true; // storage blocked: do not nag on every page
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, PRIVACY_NOTICE.id);
  } catch {
    /* ignore */
  }
}

/** Pages for looking around, not for filling in a form (the dashboard has profile fields and their Save button). */
function browsing(path: string): boolean {
  if (path === "/" || path === "/turfs" || path === "/games") return true;
  return path.startsWith("/c/") || path.startsWith("/turf/") || path.startsWith("/sport/");
}

function busy(): boolean {
  if (document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function PolicyNotice() {
  const { user, settled, notice, welcomeMessage } = useAuth();
  const path = usePathname() ?? "";
  const [show, setShow] = useState(false);
  const signedIn = !!user;
  const quiet = !notice && !welcomeMessage;

  useEffect(() => {
    if (!signedIn || !settled || !quiet || !browsing(path) || seen()) return;
    const t = window.setTimeout(() => {
      if (!busy() && !seen()) setShow(true);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [signedIn, settled, quiet, path]);

  if (!show || !signedIn) return null;
  const close = () => {
    markSeen();
    setShow(false);
  };
  return (
    <div role="region" aria-label="Privacy policy update" className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[45]">
      <div className="flex items-start gap-3 rounded-2xl bg-white border border-primary-200 shadow-elevated pl-4 pr-2 py-3">
        <p className="text-[14px] leading-snug text-primary-800">
          <span className="font-semibold text-primary-900">We updated our privacy policy.</span> {PRIVACY_NOTICE.text}{" "}
          <Link href={`/privacy#${PRIVACY_NOTICE.anchor}`} onClick={markSeen} className="font-semibold text-primary-900 underline underline-offset-2">
            What this means
          </Link>
        </p>
        <button type="button" onClick={close} aria-label="Dismiss" className="shrink-0 -my-1 w-9 h-9 rounded-full flex items-center justify-center text-primary-500 hover:bg-primary-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

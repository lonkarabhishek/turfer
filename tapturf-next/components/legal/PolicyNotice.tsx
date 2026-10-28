"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PRIVACY_NOTICE, privacyNoticeText } from "@/lib/policy";
import { useCookieBanner } from "@/lib/consent";

/**
 * The privacy policy promises a notice on the site when what we collect
 * changes. Shown once per device to signed-in people (the ones the change
 * is about), on browsing pages only, never over a dialog or while they
 * type, and never before the page has settled. Never at the same time as
 * the cookie banner either: that comes first, and this one waits until the
 * visitor has made their choice. Dismissing it, or opening the policy from
 * it, remembers it on this device.
 */

const SEEN_KEY = "tapturf_policy_seen";

/** The notice last dismissed on this device (null: none). */
function lastSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return PRIVACY_NOTICE.id; // storage blocked: do not nag on every page
  }
}

function seen(): boolean {
  return lastSeen() === PRIVACY_NOTICE.id;
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
  // What the notice says (null: not shown): the earlier notice too, unless this device dismissed it.
  const [text, setText] = useState<string | null>(null);
  const signedIn = !!user;
  const quiet = !notice && !welcomeMessage;
  const cookieBanner = useCookieBanner();

  useEffect(() => {
    if (!signedIn || !settled || !quiet || cookieBanner || !browsing(path) || seen()) return;
    const t = window.setTimeout(() => {
      if (!busy() && !seen()) setText(privacyNoticeText(lastSeen()));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [signedIn, settled, quiet, cookieBanner, path]);

  if (!text || !signedIn || cookieBanner) return null;
  const close = () => {
    markSeen();
    setText(null);
  };
  return (
    <div role="region" aria-label="Privacy policy update" className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-6 md:left-auto md:right-6 md:max-w-sm z-[45]">
      <div className="flex items-start gap-3 rounded-2xl bg-white border border-primary-200 shadow-elevated pl-4 pr-2 py-3">
        <p className="text-[14px] leading-snug text-primary-800">
          <span className="font-semibold text-primary-900">We updated our privacy policy.</span> {text}{" "}
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

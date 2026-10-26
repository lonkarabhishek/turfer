"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PROFILE_PATH } from "@/lib/account/display";
import { tickSteps } from "@/lib/account/verified";
import { useInApp } from "@/lib/auth/useInApp";
import type { AppUser } from "@/types/user";
import { GoogleMark, InAppGoogleNote, useGoogleLink } from "./GoogleLinkActions";

/**
 * The profile's way to the verified tick: which half is confirmed, and
 * one button for the half this sign-in can add (Google from a phone
 * sign-in, the number from a Google one). Each button opens a flow the
 * profile already has. Hidden when there is nothing to do here; no
 * dismiss (it is the profile, and it is quiet).
 */
export function VerifyCard({ user, dirty, onAddPhone }: { user: AppUser; dirty: boolean; onAddPhone: () => void }) {
  const { signedInWith } = useAuth();
  const inApp = useInApp();
  const link = useGoogleLink();
  const steps = tickSteps(user, signedInWith);
  // Without the tick when the profile opened: when it arrives, say so where the card was.
  const [startedWithout] = useState(() => user.verified === false);
  const ref = useRef<HTMLDivElement>(null);

  // /u/<name>'s "Go to your profile" comes here (#verify).
  useEffect(() => {
    if (window.location.hash === "#verify") ref.current?.scrollIntoView({ block: "center" });
  }, []);

  if (!steps) {
    if (!(startedWithout && user.verified === true)) return null;
    return (
      <p id="verify" className="mb-6 rounded-2xl bg-sky-50 px-4 py-3 text-[14px] text-sky-900 flex items-start gap-2" role="status">
        <BadgeCheck className="w-5 h-5 shrink-0 fill-sky-600 text-white" strokeWidth={2.25} aria-hidden />
        You&rsquo;ve got the verified tick. Players see it next to your name.
      </p>
    );
  }

  const row = (label: string, done: boolean, text: string) => (
    <li className="flex items-center gap-2.5">
      {done ? (
        <span className="w-5 h-5 shrink-0 rounded-full bg-sky-600 inline-flex items-center justify-center" aria-hidden>
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </span>
      ) : (
        <span className="w-5 h-5 shrink-0 rounded-full border-2 border-primary-300" aria-hidden />
      )}
      <span className="text-[14px] text-primary-800">
        <span className="font-semibold">{label}</span>
        <span className="text-primary-500"> · {text}</span>
        <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
      </span>
    </li>
  );

  const primary =
    "press-tight inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-5 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold disabled:opacity-50 cursor-pointer";

  return (
    <section id="verify" ref={ref} aria-labelledby="verify-title" className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 scroll-mt-24">
      <h2 id="verify-title" className="flex items-center gap-2 text-[16px] font-semibold text-primary-900">
        <BadgeCheck className="w-5 h-5 shrink-0 fill-sky-600 text-white" strokeWidth={2.25} aria-hidden />
        Get the verified tick
      </h2>
      <p className="mt-1 text-[13px] text-primary-600 leading-snug">
        Confirm your phone number and email, and players see a {"✓"} next to your name. We never show either one.
      </p>
      <ul className="mt-3 space-y-2">
        {row("Phone number", steps.phone === "done", steps.phone === "done" ? "Confirmed" : steps.phone === "confirm" ? "Confirm it with an OTP" : "Add it with an OTP")}
        {row("Email", steps.email === "done", steps.email === "done" ? "Confirmed with Google" : "Add it with Google")}
      </ul>

      {steps.action === "email" && (
        <div className="mt-4">
          {steps.typedEmail && <p className="mb-2 text-[13px] text-primary-600">The email you typed earlier isn&rsquo;t confirmed.</p>}
          {inApp ? (
            <InAppGoogleNote app={inApp.app} os={inApp.os} />
          ) : (
            <button type="button" onClick={() => void link.start(PROFILE_PATH, "add")} disabled={dirty || link.busy} className={primary}>
              {link.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
              {link.busy ? "Opening Google…" : "Add email with Google"}
            </button>
          )}
          {link.error && (
            <div className="mt-2" role="alert">
              <p className="text-[13px] font-medium text-hot-600">{link.error}</p>
              {link.canRetry && (
                <button type="button" onClick={() => void link.retry()} disabled={link.busy} className="mt-2 inline-flex items-center justify-center h-11 px-4 rounded-full border-2 border-primary-200 text-primary-800 text-[14px] font-semibold disabled:opacity-50 cursor-pointer">
                  Try again
                </button>
              )}
            </div>
          )}
          {link.sheet}
        </div>
      )}

      {steps.action === "phone" && (
        <div className="mt-4">
          <button type="button" onClick={onAddPhone} disabled={dirty} className={primary}>
            {steps.phone === "confirm" ? "Confirm number" : "Add phone number"}
          </button>
        </div>
      )}

      {dirty && steps.action && !(steps.action === "email" && inApp) && <p className="mt-2 text-[13px] text-primary-500">Save your changes first.</p>}
    </section>
  );
}

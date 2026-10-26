"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Phone } from "lucide-react";
import type { RecaptchaVerifier } from "firebase/auth";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { addPhone, errorOf, oauthAgeS, profileIn, removePhone } from "@/lib/account/client";
import { googleFirst } from "@/lib/account/oauthAge";
import { istDate, PROFILE_PATH, phone10, spacedPhone } from "@/lib/account/display";
import { sendPhoneAddCode, type ProofCode } from "@/lib/firebase/proof";
import type { AccountError } from "@/lib/account/types";
import { ConfirmBox } from "./GoogleLinkActions";
import { OtpBoxes } from "./OtpBoxes";
import { Sheet } from "./Sheet";

/**
 * The phone row of a Google sign-in whose own way in is Google: add a
 * number, confirm one typed into the old app, change it or remove it.
 * Each needs a Google sign-in from the last 10 minutes (the server's
 * rule; this asks for one when it is over 5 minutes old, so the SMS has
 * time to arrive), and adding needs an OTP to that number, on its own
 * throwaway Firebase instance (lib/firebase/proof.ts): the default app
 * and the Google sign-in never change.
 */

type State = "idle" | "google_first" | "number" | "sending" | "code" | "checking" | "done" | "remove_confirm";
type Intent = "add" | "confirm" | "change" | "remove";

const RESEND_S = 120;
/** A proof counts on the server for 5 minutes: a retry after a network blip needs no new SMS. */
const PROOF_KEEP_MS = 4 * 60_000;

const DONE: Record<Intent, string> = {
  add: "Number added. You can now log in with an OTP on this number too.",
  confirm: "Number confirmed. You can now log in with an OTP on this number too.",
  change: "Number changed. Your old number no longer opens this account. Logging in with it would start a new account.",
  remove: "Number removed.",
};

function phoneErrorText(e: AccountError | null, b: { until?: string; holderOpens?: boolean; holderEmpty?: boolean; holderMadeOn?: string | null }): string {
  switch (e) {
    case "taken":
      if (b.holderEmpty) {
        const made = istDate(b.holderMadeOn ?? null);
        return `This number has an empty TapTurf account${made ? `, made on ${made}` : ""}. We can't add it here or join the two. Email info@tapturf.in and we'll help.`;
      }
      if (b.holderOpens) return "This number already has its own TapTurf account. Log out and log in with an OTP on this number to use that account. We can't join two accounts.";
      return "This number is on another TapTurf account that we need to check. Email info@tapturf.in and we'll sort it out.";
    case "used":
    case "proof":
      return "That OTP has expired. Send a new one.";
    case "limit": {
      const on = istDate(b.until ?? null);
      return on ? `You've set your number 3 times in the last 30 days. You can change it again on ${on}.` : "You've set your number 3 times in the last 30 days. Try again later.";
    }
    case "not_allowed":
      return "Your phone number is how this account logs in, so it can't be changed here. If you've lost that SIM, email info@tapturf.in.";
    case "slow":
      return "Too many tries. Wait a minute and try again.";
    case "sign_in":
    case "new":
      return "Your login ended. Please log in again.";
    default:
      return "Couldn't reach TapTurf. Check your connection and try again.";
  }
}

export function PhoneAddForm({
  current,
  confirmed,
  autoOpen = false,
  disabled = false,
  googleEmail,
}: {
  current?: string;
  confirmed: boolean;
  /** Back from the Google round trip this form asked for: open it at once. */
  autoOpen?: boolean;
  /** The profile has unsaved changes. */
  disabled?: boolean;
  /** For Google's account chooser. */
  googleEmail?: string;
}) {
  const { getToken, applyProfile } = useAuth();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const captchaId = `phone-add-captcha-${uid}`;
  const [state, setState] = useState<State>("idle");
  const [intent, setIntent] = useState<Intent>("add");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [doneText, setDoneText] = useState("");
  const sender = useRef<{ code: ProofCode; verifier: RecaptchaVerifier | null } | null>(null);
  const kept = useRef<{ proof: string; at: number; to: string } | null>(null);
  const [retryable, setRetryable] = useState(false);
  const introRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const prevState = useRef<State>(state);
  // Focus follows the step: into the number form when it opens (its line is read first), and onto
  // the result when it is done, so the buttons that went away never leave focus on the page itself.
  useEffect(() => {
    const was = prevState.current;
    prevState.current = state;
    if (state === "number" && was !== "sending" && was !== "number") introRef.current?.focus();
    if (state === "done" && was !== "done") doneRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(
    () => () => {
      try {
        sender.current?.verifier?.clear();
      } catch {
        /* already cleared */
      }
    },
    [],
  );

  const intentNow = (): Intent => (!current ? "add" : !confirmed ? "confirm" : "change");

  /** The Supabase token of this Google sign-in, or null with the reason shown. */
  const googleToken = async (): Promise<string | null> => {
    const t = await getToken();
    if ("token" in t) return t.token;
    setError("unknown" in t ? "Couldn't reach TapTurf. Check your connection and try again." : "Your login ended. Please log in again.");
    return null;
  };

  /**
   * Open the form for this intent: first a Google sign-in, if the last one is over 5 minutes old by
   * this device's clock (googleFirst). returning: back from the Google round trip this form asked
   * for, so the server decides.
   */
  const open = async (i: Intent, returning = false) => {
    setError("");
    setDoneText("");
    setIntent(i);
    setBusy(true);
    try {
      const tok = await googleToken();
      if (!tok) return;
      if (googleFirst(i, oauthAgeS(tok), returning)) return setState("google_first");
      if (i === "remove") return setState("remove_confirm");
      setNumber(i === "confirm" ? phone10(current) : "");
      setCode("");
      setState("number");
    } finally {
      setBusy(false);
    }
  };

  // Back from Google: the form opens where the person left it.
  const opened = useRef(false);
  const openRef = useRef(open);
  const intentRef = useRef(intentNow);
  useEffect(() => {
    openRef.current = open;
    intentRef.current = intentNow;
  });
  useEffect(() => {
    if (!autoOpen || opened.current || disabled) return;
    const t = setTimeout(() => {
      opened.current = true;
      void openRef.current(intentRef.current(), true);
    }, 0);
    return () => clearTimeout(t);
  }, [autoOpen, disabled]);

  /** A normal Google sign-in, coming back to this form (the sign-in callback, then the profile with add=phone). */
  const viaGoogle = async () => {
    setBusy(true);
    setError("");
    const next = intent === "remove" ? PROFILE_PATH : `${PROFILE_PATH}&add=phone`;
    try {
      const { error: e } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: googleEmail ? { prompt: "select_account", login_hint: googleEmail } : { prompt: "select_account" },
        },
      });
      if (e) {
        setError("Couldn't open Google. Try again.");
        setBusy(false);
      }
      // On success the browser leaves for Google.
    } catch {
      setError("Couldn't open Google. Try again.");
      setBusy(false);
    }
  };

  const send = async () => {
    const p10 = number.replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(p10)) return setError("Enter a valid 10-digit mobile number.");
    setError("");
    setRetryable(false);
    setState("sending");
    const sent = await sendPhoneAddCode(p10, captchaId, sender.current?.verifier);
    if ("error" in sent) {
      setError(sent.error);
      setState("number");
      return;
    }
    sender.current = sent;
    kept.current = null;
    setCode("");
    setResendIn(RESEND_S);
    setState("code");
  };

  /** Send the proof; the same proof again after a lost reply is fine (the server says ok). */
  const submit = async (proof: string) => {
    setError("");
    setRetryable(false);
    setState("checking");
    const tok = await googleToken();
    if (!tok) return setState("code");
    const a = await addPhone(tok, proof);
    const p = profileIn(a);
    if (p) {
      kept.current = null;
      applyProfile(p);
      setDoneText(DONE[intent]);
      setState("done");
      return;
    }
    const e = errorOf(a);
    if (e === "reauth") {
      kept.current = null;
      return setState("google_first");
    }
    setError(phoneErrorText(e, a.body as Parameters<typeof phoneErrorText>[1]));
    if (e === "used" || e === "proof") {
      kept.current = null;
      setCode("");
      return setState("number");
    }
    // Couldn't reach TapTurf: the code still counts for a few minutes.
    setRetryable(e === "unavailable" || e === null || a.status === 0 || a.status >= 500);
    setState("code");
  };

  const check = async (c: string) => {
    const s = sender.current;
    if (!s || state === "checking") return;
    setError("");
    setState("checking");
    const r = await s.code.confirm(c);
    if ("error" in r) {
      setError(r.error);
      setCode("");
      setState("code");
      return;
    }
    kept.current = { proof: r.proof, at: Date.now(), to: number };
    await submit(r.proof);
  };

  const retry = () => {
    const k = kept.current;
    if (k && Date.now() - k.at < PROOF_KEEP_MS) void submit(k.proof);
    else {
      setRetryable(false);
      setError("That OTP has expired. Send a new one.");
      setState("number");
    }
  };

  const remove = async () => {
    setError("");
    setBusy(true);
    try {
      const tok = await googleToken();
      if (!tok) return;
      const a = await removePhone(tok);
      const p = profileIn(a);
      if (p) {
        applyProfile(p);
        setDoneText(DONE.remove);
        setState("done");
        return;
      }
      const e = errorOf(a);
      if (e === "reauth") return setState("google_first");
      setError(phoneErrorText(e, {}));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setError("");
    setRetryable(false);
    setState("idle");
  };

  const field = (value: string) => (
    <div className="relative">
      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input type="tel" value={value} disabled className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500" aria-label="Phone" />
    </div>
  );
  const quiet = "inline-flex items-center justify-center h-11 px-4 rounded-full border-2 border-primary-200 text-primary-800 text-[14px] font-semibold hover:border-primary-400 disabled:opacity-50 cursor-pointer";
  // Red text for taking the number off, never the quiet button's dark text over it.
  const danger = "inline-flex items-center justify-center h-11 px-4 rounded-full border-2 border-primary-200 text-hot-600 text-[14px] font-semibold hover:border-hot-400 disabled:opacity-50 cursor-pointer";
  const primary = "inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[14px] font-semibold disabled:opacity-50 cursor-pointer";
  const off = disabled || busy;
  const saveFirst = disabled && state === "idle" && <p className="mt-2 text-[13px] text-primary-500">Save your changes first.</p>;

  const formOpen = state === "number" || state === "sending" || state === "code" || state === "checking";

  return (
    <div>
      {current && field(spacedPhone(current))}

      {/* Always there, so a screen reader hears the result when it arrives. */}
      <p
        ref={doneRef}
        tabIndex={-1}
        className={state === "done" ? "mt-2 rounded-xl bg-accent-50 px-3 py-2 text-[13px] text-accent-800 outline-none" : "sr-only"}
        role="status"
      >
        {state === "done" ? doneText : ""}
      </p>

      {(state === "idle" || state === "done" || state === "google_first") && (
        <div className="mt-2">
          {!current ? (
            <>
              <button type="button" onClick={() => void open("add")} disabled={off} className={primary}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Add phone number
              </button>
              <p className="mt-2 text-[13px] text-primary-600 leading-snug">Add your mobile number so you can also log in with an OTP. It opens this same account.</p>
            </>
          ) : !confirmed ? (
            <>
              <p className="text-[13px] text-primary-600 leading-snug">Not confirmed yet. Confirm it with an OTP so you can log in with this number.</p>
              <button type="button" onClick={() => void open("confirm")} disabled={off} className={`mt-2 ${primary}`}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm with OTP
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-primary-500">You can log in with an OTP on this number too. Only you can see it.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void open("change")} disabled={off} className={quiet}>
                  Change number
                </button>
                <button type="button" onClick={() => void open("remove")} disabled={off} className={danger} aria-label="Remove phone number">
                  Remove
                </button>
              </div>
            </>
          )}
          {saveFirst}
        </div>
      )}

      {state === "remove_confirm" && current && (
        <div className="mt-2">
          <ConfirmBox
            text={`Remove ${spacedPhone(current)}? You won\u2019t be able to log in with it any more.`}
            yes="Remove"
            danger
            busy={busy}
            onYes={() => void remove()}
            onNo={cancel}
          />
        </div>
      )}

      {formOpen && (
        // data-modal-open: PWALifecycle never reloads the page while a number or a code is half typed.
        <div className="mt-2 rounded-2xl border border-primary-200 bg-white p-4 space-y-3" data-modal-open="true">
          {state === "number" || state === "sending" ? (
            <>
              <p ref={introRef} tabIndex={-1} className="text-[13px] text-primary-600 leading-snug outline-none">
                {intent === "change"
                  ? "Your new mobile number. We'll send it a code."
                  : intent === "confirm"
                    ? "We'll send a code to this number."
                    : "Add your mobile number so you can also log in with an OTP. It opens this same account."}
              </p>
              <label htmlFor={`${uid}-num`} className="sr-only">
                Mobile number
              </label>
              <div className="flex gap-2">
                <span className="inline-flex items-center px-3 bg-primary-100 border-2 border-primary-200 rounded-xl text-primary-700 text-sm font-mono">+91</span>
                <input
                  id={`${uid}-num`}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={number}
                  disabled={state === "sending"}
                  onChange={(e) => {
                    setNumber(e.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && number.length === 10 && void send()}
                  placeholder="10-digit number"
                  className="min-w-0 flex-1 bg-white border-2 border-primary-200 rounded-xl px-4 py-3 text-base font-medium text-primary-800 placeholder:text-primary-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void send()} disabled={state === "sending" || number.length !== 10} className={primary}>
                  {state === "sending" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {state === "sending" ? "Sending…" : "Send OTP"}
                </button>
                <button type="button" onClick={cancel} disabled={state === "sending"} className={quiet}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-[13px] text-primary-600">
                Six digits sent to <span className="font-mono font-semibold text-primary-800">{spacedPhone(number)}</span>
              </p>
              <OtpBoxes value={code} onChange={setCode} onComplete={(c) => void check(c)} disabled={state === "checking"} />
              <div className="min-h-6 text-center">
                {state === "checking" ? (
                  <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-accent-700">
                    <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                  </p>
                ) : retryable ? (
                  <button type="button" onClick={retry} className={primary}>
                    Try again
                  </button>
                ) : resendIn > 0 ? (
                  <p className="text-[12px] font-mono text-primary-400">
                    Resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, "0")}
                  </p>
                ) : (
                  <button type="button" onClick={() => void send()} className="text-[13px] font-semibold text-accent-700 underline underline-offset-2 cursor-pointer">
                    Send a new code
                  </button>
                )}
              </div>
              <div className="flex justify-center gap-3">
                <button type="button" onClick={() => setState("number")} disabled={state === "checking"} className="text-[13px] font-semibold text-primary-500 hover:text-accent-700 cursor-pointer">
                  Use another number
                </button>
                <button type="button" onClick={cancel} disabled={state === "checking"} className="text-[13px] font-semibold text-primary-500 hover:text-accent-700 cursor-pointer">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[13px] font-medium text-hot-600" role="alert">
          {error}
        </p>
      )}
      <div id={captchaId} />

      {state === "google_first" && (
        <Sheet labelledBy={`${uid}-g-title`} describedBy={`${uid}-g-body`} onClose={cancel} locked={busy}>
          <h2 id={`${uid}-g-title`} className="font-display text-2xl text-primary-900 leading-tight outline-none">
            Confirm it&rsquo;s you
          </h2>
          <p id={`${uid}-g-body`} className="mt-2 text-[14px] text-primary-600 leading-snug">
            First, confirm it&rsquo;s you with Google. You&rsquo;ll come right back here.
          </p>
          <button
            type="button"
            onClick={() => void viaGoogle()}
            disabled={busy}
            className="mt-5 w-full h-12 rounded-full bg-primary-900 hover:bg-primary-800 text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
          <button type="button" onClick={cancel} disabled={busy} className="mt-2 w-full h-11 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          {error && (
            <p className="mt-2 text-center text-[13px] font-medium text-hot-600" role="alert">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
}

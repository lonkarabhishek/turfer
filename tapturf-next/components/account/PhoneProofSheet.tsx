"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { RecaptchaVerifier } from "firebase/auth";
import { sendLinkProofCode, type ProofCode } from "@/lib/firebase/proof";
import { phone10, spacedPhone } from "@/lib/account/display";
import { OtpBoxes } from "./OtpBoxes";
import { Sheet } from "./Sheet";

const RESEND_S = 120;

/**
 * "Confirm it's you": a fresh code to the account's own number, before a
 * phone account adds, changes or removes its Google account. The code
 * runs on its own throwaway Firebase instance (lib/firebase/proof.ts), so
 * the phone sign-in on this device never changes. onProof gets the ID
 * token that code gave; the caller sends it and closes the sheet.
 */
export function PhoneProofSheet({
  phone,
  why,
  note,
  onProof,
  onClose,
}: {
  phone: string;
  why: "add" | "change" | "remove";
  /** Said at the top, e.g. why another code is needed. */
  note?: string;
  onProof: (proof: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const captchaId = `proof-captcha-${uid}`;
  const [step, setStep] = useState<"ready" | "sending" | "code" | "checking">("ready");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const sender = useRef<{ code: ProofCode; verifier: RecaptchaVerifier | null } | null>(null);
  const p10 = phone10(phone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // The reCAPTCHA of this sheet goes with it.
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

  const send = async () => {
    if (!p10) return setError("Your login ended. Please log in again.");
    setError("");
    setStep("sending");
    const sent = await sendLinkProofCode(p10, captchaId, sender.current?.verifier);
    if ("error" in sent) {
      setError(sent.error);
      setStep(sender.current ? "code" : "ready");
      return;
    }
    sender.current = sent;
    setCode("");
    setResendIn(RESEND_S);
    setStep("code");
  };

  const check = async (c: string) => {
    const s = sender.current;
    if (!s || step === "checking") return;
    setError("");
    setStep("checking");
    const r = await s.code.confirm(c);
    if ("error" in r) {
      setError(r.error);
      setCode("");
      setStep("code");
      return;
    }
    try {
      await onProof(r.proof);
    } finally {
      // Still open (the caller had more to say): another code is possible.
      setStep("code");
      setCode("");
    }
  };

  const body =
    why === "remove"
      ? `We'll send a code to ${spacedPhone(phone)}. This stops anyone else removing your Google account.`
      : `We'll send a code to ${spacedPhone(phone)}. This stops anyone else adding their Google account to yours.`;
  const busy = step === "sending" || step === "checking";

  return (
    <Sheet labelledBy={`${uid}-title`} describedBy={`${uid}-body`} onClose={onClose} locked={step === "checking"}>
      <span className="w-11 h-11 rounded-full bg-accent-50 text-accent-700 inline-flex items-center justify-center" aria-hidden>
        <ShieldCheck className="w-5 h-5" />
      </span>
      <h2 id={`${uid}-title`} className="mt-3 font-display text-2xl text-primary-900 leading-tight outline-none">
        Confirm it&rsquo;s you
      </h2>
      {note && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{note}</p>}
      <p id={`${uid}-body`} className="mt-2 text-[14px] text-primary-600 leading-snug">
        {body}
      </p>

      {step === "ready" || (step === "sending" && !sender.current) ? (
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="mt-5 w-full h-12 rounded-full bg-primary-800 hover:bg-primary-900 text-white font-bold text-[15px] disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
        >
          {step === "sending" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sending…
            </>
          ) : (
            "Send code"
          )}
        </button>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-center text-[13px] text-primary-600">
            Six digits sent to <span className="font-mono font-semibold text-primary-800">{spacedPhone(phone)}</span>
          </p>
          <OtpBoxes value={code} onChange={setCode} onComplete={(c) => void check(c)} disabled={busy} />
          <div className="min-h-6 text-center">
            {step === "checking" ? (
              <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-accent-700">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking…
              </p>
            ) : resendIn > 0 ? (
              <p className="text-[12px] font-mono text-primary-400">
                Resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, "0")}
              </p>
            ) : (
              <button type="button" onClick={() => void send()} disabled={busy} className="text-[13px] font-semibold text-accent-700 underline underline-offset-2 cursor-pointer">
                Send a new code
              </button>
            )}
          </div>
        </div>
      )}

      <p role="alert" className="mt-2 min-h-5 text-center text-[13px] font-medium text-hot-600">
        {error}
      </p>

      <button
        type="button"
        onClick={onClose}
        disabled={step === "checking"}
        className="mt-2 w-full h-11 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer disabled:opacity-50"
      >
        Cancel
      </button>
      <div id={captchaId} />
    </Sheet>
  );
}

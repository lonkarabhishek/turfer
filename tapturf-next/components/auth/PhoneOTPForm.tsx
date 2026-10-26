"use client";

import { useState, useRef, useEffect, useId } from "react";
import { Check } from "lucide-react";
import { phoneAuthHelpers } from "@/lib/firebase/client";
import { errorOf, firebaseToken, postMe, profileOf } from "@/lib/account/client";
import { storePhoneUser, useAuth } from "./AuthProvider";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { saveSignupContext } from "@/lib/analytics/visitor";

type Step = "phone" | "otp" | "name";

const SEND_LINES = [
  "Asking for your OTP…",
  "SMS gods, please deliver…",
  "It should be here any second…",
  "Ok, that's a six-digit code you'll get. Sorry, lol.",
];

const WAIT_TIPS = [
  "Peek at your SMS. The code's on its way.",
  "Fun fact: no one memorises these.",
  "You can just paste it from your messages.",
  "Long-press → paste. We won't tell anyone.",
];

const VERIFY_LINES = [
  "That was quick. Maybe you're a keeper?",
  "Warming up the pitch…",
  "Rolling out the green carpet…",
  "Taa-daa incoming…",
];

/**
 * Little client-side cycler for playful loading copy.
 * Rotates through `lines` every `interval` ms while active.
 */
function useRotatingLine(lines: string[], active: boolean, interval = 2200): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), interval);
    return () => clearInterval(t);
  }, [active, lines.length, interval]);
  return lines[i];
}

/**
 * autoFocusPhone: put the cursor in the number field at once (the popup,
 * after "Continue with phone" was tapped). Off on /login, where Google
 * comes first and an open keyboard would pull people to the phone form.
 */
export function PhoneOTPForm({ onSuccess, autoFocusPhone = true }: { onSuccess?: () => void; autoFocusPhone?: boolean }) {
  const { hydrateFromStorage } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  // The number opened another account lately (that account changed its number): said on the name step.
  const [wasUsed, setWasUsed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [timer, setTimer] = useState(0);
  const [successName, setSuccessName] = useState("");
  // The code was right but TapTurf could not be reached: retry without a new SMS.
  const [retry, setRetry] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  // Unique per form instance, so two mounted forms never share one
  // reCAPTCHA container.
  const recaptchaId = `recaptcha-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Rotating messages per phase
  const sendingLine = useRotatingLine(SEND_LINES, step === "phone" && loading, 1600);
  const waitTip = useRotatingLine(WAIT_TIPS, step === "otp" && !loading, 3200);
  const verifyLine = useRotatingLine(VERIFY_LINES, step === "otp" && loading, 1400);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setError("");
    // A new code is for a new sign-in: never retry the one verified before.
    setRetry(false);
    setLoading(true);
    try {
      recaptchaRef.current = await phoneAuthHelpers.setupRecaptcha(recaptchaId, recaptchaRef.current);
      const result = await phoneAuthHelpers.sendOTP(phone, recaptchaRef.current);
      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
        setStep("otp");
        setTimer(120);
      } else {
        setError(result.error || "Failed to send OTP");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d) && newOtp.join("").length === 6) {
      verifyOTP(newOtp.join(""));
    }
  };

  const handleOTPKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOTPPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newOtp = pasted.split("");
      setOtp(newOtp);
      verifyOTP(pasted);
    }
  };

  const finishLogin = (userName: string) => {
    setSuccessName(userName);
    // We already wrote the exact user to localStorage; ask the
    // AuthProvider to publish it synchronously — no DB round-trip.
    hydrateFromStorage(true);
    // Short taa-daa (was 900ms). Long enough to register the win,
    // fast enough that the user doesn't feel a stall.
    setTimeout(() => {
      onSuccess?.();
    }, 350);
  };

  /**
   * The account for the number Firebase just verified, from the server
   * (made when newName is given). The server logs the sign-in.
   */
  const signInWithServer = async (token: string, newName?: string) => {
    const a = await postMe(token, newName);
    const profile = profileOf(a);
    if (profile) {
      setRetry(false);
      storePhoneUser(profile, token);
      // A new account: save how they found us, in the background.
      if ((a.body as { created?: boolean }).created) saveSignupContext(profile.id, "phone");
      finishLogin(profile.name?.split(" ")[0] || "");
      return;
    }
    const e = errorOf(a);
    if (e === "name") {
      setRetry(false);
      setWasUsed((a.body as { wasUsed?: boolean }).wasUsed === true);
      setStep("name");
    } else if (e === "conflict") {
      setRetry(false);
      setError("This number is on an account that logs in with Google. Log in with Google, open Profile and tap Confirm with OTP, and this number will work too.");
    } else {
      setRetry(true);
      setError("Couldn't reach TapTurf. Check your connection and try again.");
    }
  };

  /** A fresh token from the sign-in Firebase already has: no new SMS. */
  const retryWithServer = async () => {
    setError("");
    setLoading(true);
    try {
      const t = await firebaseToken();
      if ("token" in t) await signInWithServer(t.token, step === "name" ? name.trim() : undefined);
      else if ("none" in t) {
        setRetry(false);
        setStep("phone");
        setError("Your code has expired. Send a new one.");
      } else {
        setError("Couldn't reach TapTurf. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (otpCode: string) => {
    if (!confirmationResult) return;
    setError("");
    setLoading(true);
    try {
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);
      if (!result.success || !result.user) {
        setError(result.error || "Invalid OTP");
        setOtp(["", "", "", "", "", ""]);
        return;
      }
      await signInWithServer(result.user.idToken);
    } catch (e) {
      console.error("[PhoneOTP] Verify threw:", e);
      setError(e instanceof Error ? e.message : "Verification failed. Please try again.");
      setOtp(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    await retryWithServer();
  };

  const handleResend = async () => {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    await handleSendOTP();
  };

  // Success (with a "TAA-DAA" beat before the modal closes)
  if (successName) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-accent-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-neon animate-taada">
          <Check className="w-7 h-7 text-white" strokeWidth={3} />
        </div>
        <p className="font-display text-2xl text-primary-800 leading-none">
          Taa-daa!
        </p>
        <p className="text-[13px] text-primary-500 mt-1">Welcome in, {successName}.</p>
        <style jsx>{`
          @keyframes taada {
            0%   { transform: scale(0.5) rotate(-14deg); opacity: 0; }
            50%  { transform: scale(1.15) rotate(6deg);  opacity: 1; }
            75%  { transform: scale(0.95) rotate(-3deg); }
            100% { transform: scale(1)    rotate(0);     }
          }
          :global(.animate-taada) {
            animation: taada 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
        `}</style>
      </div>
    );
  }

  const inputClass =
    "w-full bg-white border-2 border-primary-200 rounded-xl px-4 py-3.5 min-h-[52px] text-base font-medium text-primary-800 placeholder:text-primary-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all";

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <>
          <div>
            <label className="block text-[10px] font-semibold text-primary-500 mb-2">
              Phone
            </label>
            <div className="flex gap-2">
              <span className="inline-flex items-center px-3 py-3.5 bg-primary-100 border-2 border-primary-200 rounded-xl text-primary-700 text-sm font-mono">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                placeholder="10-digit number"
                className={inputClass + " flex-1"}
                // Coming back here (change number, an expired code) means phone was chosen: focus it.
                autoFocus={autoFocusPhone || confirmationResult !== null}
              />
            </div>
          </div>

          <button
            onClick={handleSendOTP}
            disabled={loading || phone.length !== 10}
            className="w-full bg-primary-800 hover:bg-primary-900 text-white py-3.5 min-h-[52px] rounded-full font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated focus-neon"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <PitchDots />
                Sending
              </span>
            ) : (
              "Send OTP"
            )}
          </button>

          {loading && (
            <p className="text-[12px] text-primary-500 text-center animate-fade-in">
              {sendingLine}
            </p>
          )}
        </>
      )}

      {step === "otp" && (
        <>
          <div className="text-center">
            <p className="text-[13px] text-primary-600">
              Six digits sent to <span className="font-mono font-semibold text-primary-800">+91 {phone}</span>
            </p>
            <button
              onClick={() => { setStep("phone"); setError(""); setRetry(false); }}
              className="text-[11px] font-semibold text-primary-500 hover:text-accent-600 transition-colors mt-1"
            >
              change number
            </button>
          </div>

          <div className="flex justify-center gap-2" onPaste={handleOTPPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOTPChange(i, e.target.value)}
                onKeyDown={(e) => handleOTPKeyDown(i, e)}
                className={`w-11 h-13 text-center font-mono text-lg font-bold bg-white border-2 rounded-lg text-primary-800 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all ${
                  digit
                    ? "border-accent-500 bg-accent-50"
                    : "border-primary-200 focus:border-accent-500"
                }`}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Playful rotating copy — verify state wins, else idle tip */}
          <div className="min-h-[32px] flex items-center justify-center">
            {loading ? (
              <p className="inline-flex items-center gap-2 text-[13px] text-accent-700 font-semibold animate-fade-in">
                <PitchDots color="accent" />
                {verifyLine}
              </p>
            ) : (
              <p className="text-[12px] text-primary-500 text-center animate-fade-in">
                {waitTip}
              </p>
            )}
          </div>

          <div className="text-center">
            {timer > 0 ? (
              <p className="text-[11px] font-mono text-primary-400">
                Resend in {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-[11px] font-semibold text-accent-600 hover:text-accent-700"
              >
                resend code
              </button>
            )}
          </div>
        </>
      )}

      {step === "name" && (
        <>
          {wasUsed && (
            <p className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-900" role="note">
              This number used to open a TapTurf account. If that was you, log in with Google instead. Or carry on to make a new account.
            </p>
          )}
          <div className="text-center">
            <p className="text-[13px] text-primary-600">Welcome! What should we call you?</p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleCreateUser()}
            placeholder="Your name"
            aria-label="Your name"
            autoComplete="name"
            className={inputClass}
            autoFocus
          />

          <button
            onClick={handleCreateUser}
            disabled={loading || !name.trim()}
            className="w-full bg-primary-800 hover:bg-primary-900 text-white py-3.5 min-h-[52px] rounded-full font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated focus-neon"
          >
            {loading ? "Creating…" : "Let's play"}
          </button>
        </>
      )}

      {error && (
        <p className="text-[13px] text-hot-600 text-center font-medium">{error}</p>
      )}

      {retry && step === "otp" && (
        <button
          onClick={retryWithServer}
          disabled={loading}
          className="w-full bg-primary-800 hover:bg-primary-900 text-white py-3.5 min-h-[52px] rounded-full font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated focus-neon"
        >
          {loading ? "Trying…" : "Try again"}
        </button>
      )}

      <div id={recaptchaId} />
    </div>
  );
}

/** Three little bouncing dots — friendlier than a spinner. */
function PitchDots({ color = "white" }: { color?: "white" | "accent" }) {
  const c = color === "accent" ? "bg-accent-600" : "bg-white";
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      <span className={`w-1.5 h-1.5 rounded-full ${c} animate-pitch-bounce`} style={{ animationDelay: "0ms" }} />
      <span className={`w-1.5 h-1.5 rounded-full ${c} animate-pitch-bounce`} style={{ animationDelay: "120ms" }} />
      <span className={`w-1.5 h-1.5 rounded-full ${c} animate-pitch-bounce`} style={{ animationDelay: "240ms" }} />
      <style jsx>{`
        @keyframes pitch-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40%           { transform: translateY(-3px); opacity: 1; }
        }
        :global(.animate-pitch-bounce) {
          animation: pitch-bounce 0.9s infinite ease-in-out;
        }
      `}</style>
    </span>
  );
}

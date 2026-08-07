"use client";

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { phoneAuthHelpers } from "@/lib/firebase/client";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";

type Step = "phone" | "otp" | "name";

const SEND_LINES = [
  "Asking for your OTP…",
  "SMS gods, please deliver…",
  "It should be here any second…",
  "Ok, that's a six-digit code you'll get. Sorry, lol.",
];

const WAIT_TIPS = [
  "Peek at your SMS — the code's on its way.",
  "Fun fact: no one memorises these.",
  "You can just paste it from your messages.",
  "Long-press → paste. We won't tell anyone.",
];

const VERIFY_LINES = [
  "That was quick — maybe you're a keeper?",
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

export function PhoneOTPForm({ onSuccess }: { onSuccess?: () => void }) {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [timer, setTimer] = useState(0);
  const [successName, setSuccessName] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

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
    setLoading(true);
    try {
      recaptchaRef.current = await phoneAuthHelpers.setupRecaptcha("recaptcha-container");
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
    setTimeout(() => {
      refreshUser();
      onSuccess?.();
    }, 900);
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

      const supabase = createClient();
      const formattedPhone = `+91${phone}`;

      const { data: existingRows, error: lookupError } = await supabase
        .from("users")
        .select("id, name, phone, email, role, profile_image_url")
        .or(`phone.eq.${formattedPhone},phone.eq.${phone}`)
        .order("created_at", { ascending: true })
        .limit(1);

      if (lookupError) {
        console.error("[PhoneOTP] Lookup error:", lookupError);
        setError("Couldn't look up your account. Try again or refresh.");
        setOtp(["", "", "", "", "", ""]);
        return;
      }

      const existingUser = existingRows?.[0];

      if (existingUser) {
        localStorage.setItem("auth_token", result.user.idToken);
        localStorage.setItem("user", JSON.stringify({
          id: existingUser.id,
          name: existingUser.name,
          phone: formattedPhone,
          email: existingUser.email,
          role: existingUser.role || "user",
          profile_image_url: existingUser.profile_image_url,
        }));
        finishLogin(existingUser.name?.split(" ")[0] || "");
      } else {
        setStep("name");
      }
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
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const formattedPhone = `+91${phone}`;
      const userId = crypto.randomUUID();
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([{
          id: userId,
          name: name.trim(),
          phone: formattedPhone,
          role: "user",
          password: "phone-auth-no-password",
        }])
        .select()
        .single();

      if (insertError || !newUser) {
        console.error("[PhoneOTP] Create user error:", insertError?.message, insertError?.details);
        setError("Could not create account. Please try again.");
        return;
      }

      const authToken = localStorage.getItem("auth_token") || `phone_${Date.now()}`;
      localStorage.setItem("auth_token", authToken);
      localStorage.setItem("user", JSON.stringify({
        id: newUser.id,
        name: newUser.name,
        phone: formattedPhone,
        role: "player",
      }));

      finishLogin(newUser.name?.split(" ")[0] || "");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
        <p className="font-display uppercase text-2xl text-primary-800 tracking-wide leading-none">
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
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-primary-500 mb-2">
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
                autoFocus
              />
            </div>
          </div>

          <button
            onClick={handleSendOTP}
            disabled={loading || phone.length !== 10}
            className="w-full bg-primary-800 hover:bg-primary-900 text-white py-3.5 min-h-[52px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated focus-neon"
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
              onClick={() => { setStep("phone"); setError(""); }}
              className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 hover:text-accent-600 transition-colors mt-1"
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
              <p className="text-[11px] font-mono uppercase tracking-widest text-primary-400">
                Resend in {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-[11px] font-semibold uppercase tracking-widest text-accent-600 hover:text-accent-700"
              >
                resend code
              </button>
            )}
          </div>
        </>
      )}

      {step === "name" && (
        <>
          <div className="text-center">
            <p className="text-[13px] text-primary-600">Welcome — what should we call you?</p>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleCreateUser()}
            placeholder="Your name"
            className={inputClass}
            autoFocus
          />

          <button
            onClick={handleCreateUser}
            disabled={loading || !name.trim()}
            className="w-full bg-primary-800 hover:bg-primary-900 text-white py-3.5 min-h-[52px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-elevated focus-neon"
          >
            {loading ? "Creating…" : "Let's play"}
          </button>
        </>
      )}

      {error && (
        <p className="text-[13px] text-hot-600 text-center font-medium">{error}</p>
      )}

      <div id="recaptcha-container" />
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

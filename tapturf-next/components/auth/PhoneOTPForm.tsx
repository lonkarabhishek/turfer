"use client";

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { phoneAuthHelpers } from "@/lib/firebase/client";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import type { ConfirmationResult } from "firebase/auth";

type Step = "phone" | "otp" | "name";

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
  const recaptchaRef = useRef<ReturnType<typeof phoneAuthHelpers.setupRecaptcha> | null>(null);

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
      recaptchaRef.current = phoneAuthHelpers.setupRecaptcha("recaptcha-container");
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
    }, 800);
  };

  const verifyOTP = async (otpCode: string) => {
    if (!confirmationResult) return;
    setError("");
    setLoading(true);
    try {
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);
      if (result.success && result.user) {
        const supabase = createClient();
        const formattedPhone = `+91${phone}`;
        const { data: existingUser } = await supabase
          .from("users")
          .select("id, name, phone, email, role, profile_image_url")
          .eq("phone", formattedPhone)
          .maybeSingle();

        if (existingUser) {
          localStorage.setItem("auth_token", result.user.idToken);
          localStorage.setItem("user", JSON.stringify({
            id: existingUser.id,
            name: existingUser.name,
            phone: formattedPhone,
            email: existingUser.email,
            role: existingUser.role || "player",
            profile_image_url: existingUser.profile_image_url,
          }));
          finishLogin(existingUser.name?.split(" ")[0] || "");
        } else {
          setStep("name");
        }
      } else {
        setError(result.error || "Invalid OTP");
        setOtp(["", "", "", "", "", ""]);
      }
    } catch {
      setError("Verification failed. Please try again.");
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
          // public.users.password is NOT NULL; phone users have no password.
          // Use a fixed sentinel so the insert satisfies the schema.
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

  // Success
  if (successName) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-accent-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-neon">
          <Check className="w-7 h-7 text-primary-950" strokeWidth={3} />
        </div>
        <p className="font-display uppercase text-2xl text-white tracking-wide">Welcome, {successName}</p>
        <p className="text-sm text-white/50 mt-1">You&apos;re on the pitch.</p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-cream-300 border border-white/10 rounded-xl px-4 py-3.5 text-base font-medium text-white placeholder:text-white/30 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 transition-all";

  return (
    <div className="space-y-5">
      {/* Phone step */}
      {step === "phone" && (
        <>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-white/50 mb-2">
              Phone
            </label>
            <div className="flex gap-2">
              <span className="inline-flex items-center px-3 py-3.5 bg-cream-300 border border-white/10 rounded-xl text-white/60 text-sm font-mono">
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
            className="w-full bg-accent-400 hover:bg-accent-300 text-primary-950 py-3.5 min-h-[52px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-neon focus-neon"
          >
            {loading ? "Sending…" : "Send OTP"}
          </button>
        </>
      )}

      {/* OTP step */}
      {step === "otp" && (
        <>
          <div className="text-center">
            <p className="text-sm text-white/60">
              Code sent to <span className="font-mono text-accent-400">+91 {phone}</span>
            </p>
            <button
              onClick={() => { setStep("phone"); setError(""); }}
              className="text-xs font-mono uppercase tracking-widest text-white/40 hover:text-accent-400 transition-colors mt-1"
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
                className="w-11 h-13 text-center font-mono text-lg font-bold bg-cream-300 border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 transition-all"
                autoFocus={i === 0}
              />
            ))}
          </div>

          <div className="text-center">
            {timer > 0 ? (
              <p className="text-xs font-mono uppercase tracking-widest text-white/40">
                Resend in {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-xs font-mono uppercase tracking-widest text-accent-400 hover:text-accent-300"
              >
                resend code
              </button>
            )}
          </div>

          {loading && (
            <div className="text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-white/40">Verifying…</p>
            </div>
          )}
        </>
      )}

      {/* Name step (new users) */}
      {step === "name" && (
        <>
          <div className="text-center">
            <p className="text-sm text-white/60">Welcome — what&apos;s your name?</p>
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
            className="w-full bg-accent-400 hover:bg-accent-300 text-primary-950 py-3.5 min-h-[52px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-neon focus-neon"
          >
            {loading ? "Creating…" : "Let's play"}
          </button>
        </>
      )}

      {error && (
        <p className="text-sm text-hot-400 text-center">{error}</p>
      )}

      {/* Hidden recaptcha */}
      <div id="recaptcha-container" />
    </div>
  );
}

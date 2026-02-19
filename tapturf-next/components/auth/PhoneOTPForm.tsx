"use client";

import { useState, useRef, useEffect } from "react";
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

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<ReturnType<typeof phoneAuthHelpers.setupRecaptcha> | null>(null);

  // Countdown timer for resend
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

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
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

  const verifyOTP = async (otpCode: string) => {
    if (!confirmationResult) return;

    setError("");
    setLoading(true);

    try {
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);

      if (result.success && result.user) {
        const supabase = createClient();
        const formattedPhone = `+91${phone}`;

        // Check if user already exists
        const { data: existingUser } = await supabase
          .from("users")
          .select("id, name")
          .eq("phone", formattedPhone)
          .maybeSingle();

        if (existingUser) {
          // Existing user — log them in
          localStorage.setItem("auth_token", result.user.idToken);
          localStorage.setItem("user", JSON.stringify({
            id: existingUser.id,
            name: existingUser.name,
            phone: formattedPhone,
          }));
          await refreshUser();
          onSuccess?.();
        } else {
          // New user — ask for name
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

      // Create user in database
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([{
          name: name.trim(),
          phone: formattedPhone,
          role: "player",
        }])
        .select()
        .single();

      if (insertError || !newUser) {
        setError("Could not create account. Please try again.");
        return;
      }

      // Store in localStorage
      const authToken = localStorage.getItem("auth_token") || `phone_${Date.now()}`;
      localStorage.setItem("auth_token", authToken);
      localStorage.setItem("user", JSON.stringify({
        id: newUser.id,
        name: newUser.name,
        phone: formattedPhone,
        role: "player",
      }));

      await refreshUser();
      onSuccess?.();
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

  return (
    <div className="space-y-5">
      {/* Phone step */}
      {step === "phone" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone number
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                placeholder="Enter 10-digit number"
                className="flex-1 rounded-r-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          <button
            onClick={handleSendOTP}
            disabled={loading || phone.length !== 10}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-base hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Continue"}
          </button>
        </>
      )}

      {/* OTP step */}
      {step === "otp" && (
        <>
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-gray-900">+91 {phone}</span>
            </p>
            <button
              onClick={() => { setStep("phone"); setError(""); }}
              className="text-sm text-gray-900 underline mt-1"
            >
              Change number
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
                className="w-11 h-13 text-center text-lg font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                autoFocus={i === 0}
              />
            ))}
          </div>

          <div className="text-center">
            {timer > 0 ? (
              <p className="text-sm text-gray-500">
                Resend code in {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-sm text-gray-900 font-medium underline"
              >
                Resend code
              </button>
            )}
          </div>

          {loading && (
            <div className="text-center">
              <p className="text-sm text-gray-500">Verifying...</p>
            </div>
          )}
        </>
      )}

      {/* Name step (new users) */}
      {step === "name" && (
        <>
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Welcome! What should we call you?
            </p>
          </div>

          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleCreateUser()}
              placeholder="Your name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              autoFocus
            />
          </div>

          <button
            onClick={handleCreateUser}
            disabled={loading || !name.trim()}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-base hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Get started"}
          </button>
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      {/* Hidden recaptcha container */}
      <div id="recaptcha-container" />
    </div>
  );
}

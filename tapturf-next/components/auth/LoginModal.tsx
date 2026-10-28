"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { X, AlertCircle, Phone } from "lucide-react";
import { safeNext } from "@/lib/auth/next";
import { createClient } from "@/lib/supabase/client";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { useAuth } from "./AuthProvider";
import { PhoneOTPForm } from "./PhoneOTPForm";
import { GoogleButton } from "./GoogleButton";
import { useSearchParams } from "next/navigation";

export function LoginModal() {
  const { showLoginModal, setShowLoginModal } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("auth_error")) {
      setGoogleError("Sign-in failed. Try again.");
      setShowLoginModal(true);
    }
  }, [searchParams, setShowLoginModal]);

  if (!showLoginModal) return null;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      const supabase = createClient();
      // Back to this page afterwards, as /login does. (No signOut first: signInWithOAuth replaces any session.)
      const next = safeNext(window.location.pathname + window.location.search);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        setGoogleError(error.message || "Sign-in failed. Try again.");
        setGoogleLoading(false);
      }
    } catch {
      setGoogleError("Something went wrong. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleClose = () => {
    setShowLoginModal(false);
    setGoogleError("");
    setShowPhone(false);
  };

  return (
    // Centred in what the phone shows (ViewportOverlay): with the keys up for the number or
    // the code, the card sits above them, scrolling inside when it is taller than what is left.
    <>
    <ViewportOverlay className="z-[60] flex items-center justify-center p-4">
      {/* Backdrop — solid tint, no backdrop-filter (cheap on low-end GPUs) */}
      <div
        className="fixed inset-0 bg-primary-800/60 animate-fade-in"
        onClick={handleClose}
      />

      {/* Centered card — same on mobile + desktop, feels like a proper welcome */}
      <div className="relative w-full max-w-[380px] max-h-full bg-white rounded-3xl animate-login-in overflow-y-auto overscroll-contain shadow-elevated">
        {/* Close — top-right, subtle */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-primary-500" />
        </button>

        <div className="px-6 pt-8 pb-6">
          {/* Title — simple, one line, not shouty */}
          <h2 className="text-[19px] font-semibold text-primary-800 text-center leading-tight">
            Sign in to TapTurf
          </h2>
          <p className="text-[13px] text-primary-500 text-center mt-1 mb-6">
            Host games, join a squad, book turfs
          </p>

          {/* Google first: one tap with the account already on the phone. Phone right under it. */}
          {!showPhone && (
            <GoogleButton onClick={handleGoogleLogin} busy={googleLoading} />
          )}

          {/* Right under the Google button it belongs to. */}
          {!showPhone && googleError && (
            <div className="flex items-start gap-2 p-2.5 mt-3 bg-hot-500/10 border border-hot-500/30 rounded-xl" role="alert">
              <AlertCircle className="w-4 h-4 text-hot-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-hot-600">{googleError}</p>
            </div>
          )}

          {/* "or" divider — only when phone entry isn't expanded */}
          {!showPhone && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-primary-200" />
              <span className="text-[11px] font-mono text-primary-400">or</span>
              <div className="flex-1 h-px bg-primary-200" />
            </div>
          )}

          {/* Phone, second */}
          {!showPhone ? (
            <button
              onClick={() => setShowPhone(true)}
              className="w-full flex items-center justify-center gap-2.5 bg-white border border-primary-300 hover:border-primary-400 hover:bg-primary-50 text-primary-800 rounded-full py-3 min-h-[48px] px-4 text-[15px] font-semibold transition-all focus-neon"
            >
              <Phone className="w-[18px] h-[18px]" strokeWidth={2.25} />
              <span>Continue with phone</span>
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-medium text-primary-700">
                  Phone number
                </p>
                <button
                  onClick={() => setShowPhone(false)}
                  className="text-[13px] text-primary-500 hover:text-accent-600 transition-colors"
                >
                  ← back
                </button>
              </div>
              <PhoneOTPForm onSuccess={handleClose} />
            </div>
          )}

          <p className="mt-4 text-center text-[12px] text-primary-400 leading-snug">
            By continuing you agree to our{" "}
            <Link href="/terms" onClick={() => setShowLoginModal(false)} className="underline underline-offset-2 hover:text-primary-600">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" onClick={() => setShowLoginModal(false)} className="underline underline-offset-2 hover:text-primary-600">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

      </div>
    </ViewportOverlay>

      {/* Entrance animation — soft bounce, feels like an iOS alert */}
      <style jsx>{`
        @keyframes login-in {
          0%   { opacity: 0; transform: scale(0.94) translateY(8px); }
          60%  { opacity: 1; transform: scale(1.01) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        :global(.animate-login-in) {
          animation: login-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </>
  );
}

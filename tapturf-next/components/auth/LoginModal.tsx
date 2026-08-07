"use client";

import { useState, useEffect } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { PhoneOTPForm } from "./PhoneOTPForm";
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

      // Clear any stale/revoked session before starting a fresh OAuth flow
      try { await supabase.auth.signOut(); } catch { /* ignore */ }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
          queryParams: {
            access_type: "offline",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary-800/50 backdrop-blur-[3px] animate-fade-in"
        onClick={handleClose}
      />

      {/* Centered card — same on mobile + desktop, feels like a proper welcome */}
      <div className="relative w-full max-w-[380px] bg-white rounded-3xl animate-login-in overflow-hidden shadow-elevated">
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

          {/* Google — soft white pill, Google's own suggested style */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-2.5 bg-white border border-primary-300 hover:border-primary-400 hover:bg-primary-50 text-primary-800 rounded-full py-3 min-h-[48px] px-4 text-[15px] font-semibold transition-all disabled:opacity-50 focus-neon"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                <span>Opening Google…</span>
              </>
            ) : (
              <>
                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {googleError && (
            <div className="flex items-start gap-2 p-2.5 mt-3 bg-hot-500/10 border border-hot-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-hot-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-hot-600">{googleError}</p>
            </div>
          )}

          {/* Phone — plain text link, super low-key */}
          {!showPhone ? (
            <button
              onClick={() => setShowPhone(true)}
              className="block mx-auto mt-4 text-[13px] text-primary-500 hover:text-accent-600 transition-colors"
            >
              Use phone number instead
            </button>
          ) : (
            <div className="mt-4 pt-4 border-t border-primary-200">
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
        </div>

      </div>

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
    </div>
  );
}

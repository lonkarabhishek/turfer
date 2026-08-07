"use client";

import { useState, useEffect } from "react";
import { X, Loader2, AlertCircle, Zap } from "lucide-react";
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
      setGoogleError("Google sign-in failed. Try again or use phone.");
      setShowLoginModal(true);
    }
  }, [searchParams, setShowLoginModal]);

  if (!showLoginModal) return null;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      const supabase = createClient();

      // Clear any stale/revoked session before starting a fresh OAuth
      // flow. Fixes users left in a bad state after a previous
      // token-reuse revocation — otherwise the callback tries to
      // exchange a code against a dead session and lands right back
      // on the home page unauthenticated.
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
        setGoogleError(error.message || "Google sign-in failed. Try again.");
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary-800/50 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-md bg-white border-t border-primary-200 md:border md:border-primary-200 rounded-t-3xl md:rounded-3xl animate-slide-up md:mx-4 overflow-hidden shadow-elevated">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-primary-100 hover:bg-primary-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-primary-700" />
        </button>

        <div className="relative px-6 pt-8 pb-8 md:pt-10">
          {/* Logo mark */}
          <div className="w-14 h-14 rounded-2xl bg-accent-500 flex items-center justify-center shadow-neon mb-6">
            <Zap className="w-7 h-7 text-white" strokeWidth={2.75} />
          </div>

          <h2 className="font-display uppercase text-4xl md:text-5xl text-primary-800 leading-[0.9] tracking-tight mb-2">
            Sign in.<br />
            <span className="text-accent-500">Squad up.</span>
          </h2>
          <p className="text-sm text-primary-500 mb-8">
            One tap. Book turfs, host games, join your crew.
          </p>

          {/* HERO CTA — Google, big and unmissable */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-primary-800 hover:bg-primary-900 text-white rounded-full py-4 min-h-[56px] px-6 font-bold text-base uppercase tracking-wide transition-all disabled:opacity-50 shadow-elevated focus-neon"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Redirecting…</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
            <div className="flex items-start gap-2 p-3 mt-4 bg-hot-500/10 border border-hot-500/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-hot-600 shrink-0 mt-0.5" />
              <p className="text-sm text-hot-600">{googleError}</p>
            </div>
          )}

          {/* Phone alternative — collapsed by default */}
          {!showPhone ? (
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowPhone(true)}
                className="text-xs font-semibold uppercase tracking-widest text-primary-500 hover:text-accent-600 transition-colors"
              >
                or use phone number →
              </button>
            </div>
          ) : (
            <div className="mt-6 pt-6 border-t border-primary-200">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
                  Phone OTP
                </p>
                <button
                  onClick={() => setShowPhone(false)}
                  className="text-xs font-semibold uppercase tracking-widest text-primary-500 hover:text-accent-600 transition-colors"
                >
                  ← back
                </button>
              </div>
              <PhoneOTPForm onSuccess={handleClose} />
            </div>
          )}

          <p className="text-[10px] font-mono uppercase tracking-widest text-primary-400 mt-6 text-center leading-relaxed">
            By continuing you agree to our fair-play rules
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, Phone, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { PhoneOTPForm } from "./PhoneOTPForm";
import { useSearchParams } from "next/navigation";

export function LoginModal() {
  const { showLoginModal, setShowLoginModal } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("auth_error")) {
      setGoogleError("Google sign-in failed. Please try again or use your phone number.");
      setShowLoginModal(true);
    }
  }, [searchParams, setShowLoginModal]);

  if (!showLoginModal) return null;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      const supabase = createClient();
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
      // On success the browser redirects — no need to reset loading
    } catch {
      setGoogleError("Something went wrong. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleClose = () => {
    setShowLoginModal(false);
    setGoogleError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-primary-950/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-md bg-cream-100 rounded-t-3xl md:rounded-3xl animate-slide-up md:mx-4 overflow-hidden shadow-elevated">
        {/* Gold top bar */}
        <div className="h-1 bg-gradient-to-r from-accent-600 via-accent-400 to-accent-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-300">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-cream-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-primary-500" />
          </button>
          <h2 className="text-base font-bold text-primary-800 font-serif">Log in or sign up</h2>
          <div className="w-7" />
        </div>

        {/* Body */}
        <div className="px-6 pt-6 pb-8 bg-white">
          <h3 className="text-2xl font-bold text-primary-800 mb-1 font-serif">
            Welcome to <span className="text-accent-500">TapTurf</span>
          </h3>
          <p className="text-sm text-primary-400 mb-6">Find games, book turfs, play together</p>

          {/* Google button — prominent, at top */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 border-2 border-cream-300 rounded-xl py-3.5 min-h-[48px] px-4 hover:bg-cream-50 hover:border-primary-200 transition-all disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 mb-4"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                <span className="text-sm font-semibold text-primary-700">Redirecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="text-sm font-semibold text-primary-700">Continue with Google</span>
              </>
            )}
          </button>

          {googleError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{googleError}</p>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-cream-200" />
            <span className="text-xs text-primary-300 font-medium flex items-center gap-1.5">
              <Phone className="w-3 h-3" />
              or use your phone
            </span>
            <div className="flex-1 h-px bg-cream-200" />
          </div>

          {/* Phone OTP */}
          <PhoneOTPForm onSuccess={handleClose} />
        </div>

        <div className="h-4 md:hidden bg-white" />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";
import { PhoneOTPForm } from "./PhoneOTPForm";

type Tab = "phone" | "google";

export function LoginModal() {
  const { showLoginModal, setShowLoginModal } = useAuth();
  const [tab, setTab] = useState<Tab>("phone");
  const [googleLoading, setGoogleLoading] = useState(false);

  if (!showLoginModal) return null;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });
    } catch {
      setGoogleLoading(false);
    }
  };

  const handleClose = () => {
    setShowLoginModal(false);
    setTab("phone");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl animate-slide-up md:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-gray-900">
            Log in or sign up
          </h2>
          <div className="w-7" /> {/* Spacer for centering */}
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Welcome to TapTurf
          </h3>

          {/* Tab selector */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab("phone")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                tab === "phone"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Phone
            </button>
            <button
              onClick={() => setTab("google")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                tab === "google"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              Google
            </button>
          </div>

          {/* Phone OTP */}
          {tab === "phone" && (
            <PhoneOTPForm onSuccess={handleClose} />
          )}

          {/* Google */}
          {tab === "google" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Sign in with your Google account to continue
              </p>

              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl py-3 px-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-700">
                  {googleLoading ? "Redirecting..." : "Continue with Google"}
                </span>
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-500">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Switch tab hint */}
          <p className="text-center text-sm text-gray-500">
            {tab === "phone" ? (
              <>
                Prefer Google?{" "}
                <button onClick={() => setTab("google")} className="text-gray-900 font-medium underline">
                  Sign in with Google
                </button>
              </>
            ) : (
              <>
                Use phone number?{" "}
                <button onClick={() => setTab("phone")} className="text-gray-900 font-medium underline">
                  Sign in with OTP
                </button>
              </>
            )}
          </p>
        </div>

        {/* Bottom safe area for mobile */}
        <div className="h-4 md:hidden" />
      </div>
    </div>
  );
}

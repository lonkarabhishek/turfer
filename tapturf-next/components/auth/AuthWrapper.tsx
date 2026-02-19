"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthProvider";
import { LoginModal } from "./LoginModal";
import { WelcomeToast } from "./WelcomeToast";
import { MobileNav } from "@/components/layout/MobileNav";
import { Loader2 } from "lucide-react";

function AuthLoadingOverlay() {
  const { authReturning } = useAuth();

  if (!authReturning) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-2">
          <img src="/images/tapturf-logo.png" alt="" className="w-10 h-10 rounded-xl" />
          <span className="font-bold text-2xl text-gray-900 tracking-tight">
            Tap<span className="text-primary-500">Turf</span>
          </span>
        </div>

        {/* Spinner */}
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />

        <p className="text-sm text-gray-500 font-medium">
          Signing you in...
        </p>
      </div>
    </div>
  );
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthLoadingOverlay />
      {children}
      <MobileNav />
      <LoginModal />
      <WelcomeToast />
    </AuthProvider>
  );
}

export function AuthWrapper({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AuthProviderInner>
        {children}
      </AuthProviderInner>
    </Suspense>
  );
}

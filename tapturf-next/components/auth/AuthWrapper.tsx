"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { LoginModal } from "./LoginModal";
import { WelcomeToast } from "./WelcomeToast";
import { MobileNav } from "@/components/layout/MobileNav";

/**
 * The outer <Suspense> used to wrap the WHOLE app tree so LoginModal's
 * useSearchParams() wouldn't bail out. That worked, but it also meant
 * page content was inside a Suspense boundary — Next.js treats such a
 * subtree as opting into CSR when children hit any client-only hook.
 * Push the boundary down to just LoginModal (the only useSearchParams
 * caller here) so children render directly and stay server-rendered.
 */
export function AuthWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <MobileNav />
      <Suspense fallback={null}>
        <LoginModal />
      </Suspense>
      <WelcomeToast />
    </AuthProvider>
  );
}

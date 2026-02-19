"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { LoginModal } from "./LoginModal";
import { WelcomeToast } from "./WelcomeToast";
import { MobileNav } from "@/components/layout/MobileNav";

function AuthProviderInner({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
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

"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { LoginModal } from "./LoginModal";
import { MobileNav } from "@/components/layout/MobileNav";

export function AuthWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <MobileNav />
      <LoginModal />
    </AuthProvider>
  );
}

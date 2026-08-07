"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoggedInHome } from "./LoggedInHome";

/**
 * Renders the marketing home (children, SSG-friendly) for logged-out
 * visitors, and the personalised LoggedInHome for signed-in users.
 * Auth is resolved almost instantly from localStorage on mount, so
 * the marketing flash is imperceptible in the common case.
 */
export function HomeShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // While auth is resolving, show the marketing HTML that was already
  // pre-rendered. Prevents a blank flash on cold loads.
  if (loading) return <>{children}</>;

  if (user) return <LoggedInHome />;

  return <>{children}</>;
}

"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase/client";
import type { AppUser } from "@/types/user";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
  welcomeMessage: string | null;
  dismissWelcome: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
  showLoginModal: false,
  setShowLoginModal: () => {},
  welcomeMessage: null,
  dismissWelcome: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Build minimal AppUser fields from a Supabase auth user's metadata
function buildUserFromSupabase(supaUser: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }): Omit<AppUser, "role"> & { role?: string; profile_image_url?: string } {
  return {
    id: supaUser.id,
    name: (supaUser.user_metadata?.name || supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0] || "User") as string,
    email: supaUser.email,
    phone: (supaUser.phone || supaUser.user_metadata?.phone) as string | undefined,
    profile_image_url: (supaUser.user_metadata?.avatar_url || supaUser.user_metadata?.picture) as string | undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());
  const userSetRef = useRef(false);

  const supabase = supabaseRef.current;

  const dismissWelcome = useCallback(() => setWelcomeMessage(null), []);

  const showWelcome = useCallback((name: string) => {
    setWelcomeMessage(`Welcome${name ? `, ${name}` : ""}!`);
    setTimeout(() => setWelcomeMessage(null), 3500);
  }, []);

  // ── DB helpers ──

  const fetchUserProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    try {
      // .limit(1) instead of .single() so we never throw on 0-rows or dup rows.
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userId)
        .limit(1);
      if (data && data.length > 0 && !error) return data[0] as AppUser;
    } catch (e) {
      console.warn("[Auth] fetchUserProfile failed:", e);
    }
    return null;
  }, [supabase]);

  const fetchUserProfileByEmail = useCallback(async (email: string): Promise<AppUser | null> => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("email", email)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) return data[0] as AppUser;
    } catch (e) {
      console.warn("[Auth] fetchUserProfileByEmail failed:", e);
    }
    return null;
  }, [supabase]);

  const ensureUserInDB = useCallback(async (userData: {
    id: string; name: string; email?: string; phone?: string; profile_image_url?: string;
  }): Promise<AppUser> => {
    // 1. Try lookup by id (fast path for Google users whose auth.id matches public.id)
    const byId = await fetchUserProfile(userData.id);
    if (byId) return byId;

    // 2. Try lookup by email (recovers users whose public row was seeded
    //    with a different id — happens with historical data)
    if (userData.email) {
      const byEmail = await fetchUserProfileByEmail(userData.email);
      if (byEmail) return byEmail;
    }

    // 3. Insert fresh row
    try {
      const { data: inserted } = await supabase.from("users").insert([{
        id: userData.id,
        name: userData.name,
        email: userData.email || null,
        phone: userData.phone || null,
        role: "user",
        profile_image_url: userData.profile_image_url || null,
        password: "oauth-no-password",
      }]).select().single();
      if (inserted) return inserted as AppUser;
    } catch (e) {
      console.warn("[Auth] ensureUserInDB insert failed (likely RLS):", e);
    }

    // 4. Fallback synthetic user so we at least render the header signed-in
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: "user" as AppUser["role"],
      profile_image_url: userData.profile_image_url,
    };
  }, [supabase, fetchUserProfile, fetchUserProfileByEmail]);

  // ── Resolve a Supabase auth user into AppUser and set state ──

  const resolveSupabaseUser = useCallback(async (supaUser: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }, shouldWelcome: boolean) => {
    const meta = buildUserFromSupabase(supaUser);
    const dbUser = await ensureUserInDB(meta);
    setUser(dbUser);
    userSetRef.current = true;
    if (shouldWelcome) showWelcome(dbUser.name?.split(" ")[0] || "");
  }, [ensureUserInDB, showWelcome]);

  // ── Init auth on mount ──

  useEffect(() => {
    let cancelled = false;
    const emergencyTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    // ── 1. Phone auth: instant from localStorage (no network) ──
    const authToken = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("user");

    if (authToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) {
          setUser({
            id: parsed.id,
            name: parsed.name || "User",
            email: parsed.email,
            phone: parsed.phone,
            role: (parsed.role || "user") as AppUser["role"],
            profile_image_url: parsed.profile_image_url,
          });
          userSetRef.current = true;
          setLoading(false);
          clearTimeout(emergencyTimeout);

          fetchUserProfile(parsed.id).then(profile => {
            if (profile && !cancelled) setUser(profile);
          });
        }
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
      }
    }

    // ── 2. Google OAuth: onAuthStateChange with welcome flag support ──
    // Check for ?welcome=1 in URL — set by /api/auth/callback on success —
    // so the very first INITIAL_SESSION after Google login triggers the
    // welcome toast + strips the param from the URL.
    const url = new URL(window.location.href);
    const shouldWelcomeFromCallback = url.searchParams.get("welcome") === "1";
    if (shouldWelcomeFromCallback) {
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        if (session?.user && !userSetRef.current) {
          await resolveSupabaseUser(session.user, shouldWelcomeFromCallback);
        }
        clearTimeout(emergencyTimeout);
        setLoading(false);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        const isNewSignIn = !userSetRef.current;
        await resolveSupabaseUser(session.user, isNewSignIn);
        setShowLoginModal(false);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Don't re-welcome or re-fetch — just keep the current user object.
        // resolveSupabaseUser would re-render everything; skip it here.
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        userSetRef.current = false;
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(emergencyTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──

  const login = useCallback(() => setShowLoginModal(true), []);

  const logout = useCallback(async () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    try { await firebaseAuth.signOut(); } catch { /* ignore */ }
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    userSetRef.current = false;
  }, [supabase]);

  const refreshUser = useCallback(async () => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) {
          const profile = await fetchUserProfile(parsed.id);
          const nextUser = profile || {
            id: parsed.id, name: parsed.name || "User", email: parsed.email,
            phone: parsed.phone, role: parsed.role || "user", profile_image_url: parsed.profile_image_url,
          };
          setUser(nextUser);
          userSetRef.current = true;
          // Trigger welcome for phone-login success (called from PhoneOTPForm.finishLogin)
          showWelcome(nextUser.name?.split(" ")[0] || "");
          return;
        }
      } catch { /* invalid */ }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) { setUser(profile); return; }
      }
    } catch { /* ignore */ }
  }, [fetchUserProfile, supabase, showWelcome]);

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, refreshUser,
      showLoginModal, setShowLoginModal,
      welcomeMessage, dismissWelcome,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

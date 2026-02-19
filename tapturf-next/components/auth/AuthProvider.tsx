"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase/client";
import type { AppUser } from "@/types/user";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  authReturning: boolean;
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
  authReturning: false,
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

// Helper: build AppUser from Supabase auth user metadata
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
  const [authReturning, setAuthReturning] = useState(false);

  const supabaseRef = useRef(createClient());
  const initDoneRef = useRef(false);
  const userSetRef = useRef(false); // tracks if we've set user at least once

  const supabase = supabaseRef.current;

  const dismissWelcome = useCallback(() => setWelcomeMessage(null), []);

  const showWelcome = useCallback((name: string) => {
    setWelcomeMessage(`Welcome${name ? `, ${name}` : ""}!`);
    setTimeout(() => setWelcomeMessage(null), 4000);
  }, []);

  // ── DB helpers ──

  const fetchUserProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userId)
        .single();
      if (data && !error) return data as AppUser;
    } catch { /* not found */ }
    return null;
  }, [supabase]);

  const ensureUserInDB = useCallback(async (userData: {
    id: string; name: string; email?: string; phone?: string; profile_image_url?: string;
  }): Promise<AppUser> => {
    // Try to find existing
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userData.id)
        .single();
      if (existing) return existing as AppUser;
    } catch { /* not found, will insert */ }

    // Insert new
    try {
      const { data: inserted } = await supabase.from("users").insert([{
        id: userData.id,
        name: userData.name,
        email: userData.email || null,
        phone: userData.phone || null,
        role: "player",
        profile_image_url: userData.profile_image_url || null,
      }]).select().single();
      if (inserted) return inserted as AppUser;
    } catch { /* RLS may block */ }

    // Fallback
    return { id: userData.id, name: userData.name, email: userData.email, phone: userData.phone, role: "player", profile_image_url: userData.profile_image_url };
  }, [supabase]);

  // ── Resolve a Supabase auth user into AppUser and set state ──

  const resolveSupabaseUser = useCallback(async (supaUser: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }, shouldWelcome: boolean) => {
    const profile = await fetchUserProfile(supaUser.id);
    if (profile) {
      setUser(profile);
      userSetRef.current = true;
      if (shouldWelcome) showWelcome(profile.name?.split(" ")[0] || "");
      return;
    }

    const meta = buildUserFromSupabase(supaUser);
    const dbUser = await ensureUserInDB(meta);
    setUser(dbUser);
    userSetRef.current = true;
    if (shouldWelcome) showWelcome(dbUser.name?.split(" ")[0] || "");
  }, [fetchUserProfile, ensureUserInDB, showWelcome]);

  // ── Init auth on mount ──

  useEffect(() => {
    let cancelled = false;
    const emergencyTimeout = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setAuthReturning(false);
      }
    }, 6000);

    const init = async () => {
      try {
        // 1. Phone auth (Firebase + localStorage)
        const authToken = localStorage.getItem("auth_token");
        const storedUser = localStorage.getItem("user");

        if (authToken && storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            if (parsed.id) {
              const profile = await fetchUserProfile(parsed.id);
              if (!cancelled) {
                setUser(profile || {
                  id: parsed.id,
                  name: parsed.name || "User",
                  email: parsed.email,
                  phone: parsed.phone,
                  role: (parsed.role || "player") as AppUser["role"],
                  profile_image_url: parsed.profile_image_url,
                });
                userSetRef.current = true;
              }
              initDoneRef.current = true;
              if (!cancelled) { clearTimeout(emergencyTimeout); setLoading(false); setAuthReturning(false); }
              return;
            }
          } catch {
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user");
          }
        }

        // 2. Google OAuth (Supabase session)
        // Try getSession() first (fast, reads from local storage)
        // Then validate with getUser() (network call, server-side JWT check)
        let supaUser = null;

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            supaUser = session.user;
            // Show loading overlay since we have a session to resolve
            if (!cancelled) setAuthReturning(true);
          }
        } catch {
          // no session
        }

        // Validate with getUser() if we got a session
        if (supaUser) {
          try {
            const { data, error } = await supabase.auth.getUser();
            if (data?.user && !error) {
              supaUser = data.user; // use the validated user
            }
            // If getUser fails, still use the session user — better than nothing
          } catch {
            console.warn("[AuthProvider] getUser() validation failed, using session user");
          }
        }

        if (supaUser && !cancelled) {
          await resolveSupabaseUser(supaUser, false);
        }
      } catch (err) {
        console.error("[AuthProvider] Init error:", err);
        if (!cancelled) setUser(null);
      } finally {
        initDoneRef.current = true;
        if (!cancelled) {
          clearTimeout(emergencyTimeout);
          setLoading(false);
          setAuthReturning(false);
        }
      }
    };

    init();

    // ── Auth state change listener ──
    // Handles: OAuth redirect return (SIGNED_IN), token refresh, sign out

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") {
        // On page refresh, if init() hasn't set a user yet and there's a session,
        // use it as backup to ensure we don't lose the logged-in state
        if (session?.user && !userSetRef.current) {
          await resolveSupabaseUser(session.user, false);
          setLoading(false);
          setAuthReturning(false);
        }
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // This fires after OAuth redirect when session is established
        // Show welcome for new sign-ins (not just refreshes)
        const isNewSignIn = !userSetRef.current;
        setAuthReturning(true);
        await resolveSupabaseUser(session.user, isNewSignIn);
        setShowLoginModal(false);
        setLoading(false);
        // Brief delay so the user sees the loading screen transition smoothly
        setTimeout(() => setAuthReturning(false), 400);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        await resolveSupabaseUser(session.user, false);
        setLoading(false);
        setAuthReturning(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        userSetRef.current = false;
        setLoading(false);
        setAuthReturning(false);
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
    // 1. Phone auth
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) {
          const profile = await fetchUserProfile(parsed.id);
          setUser(profile || {
            id: parsed.id, name: parsed.name || "User", email: parsed.email,
            phone: parsed.phone, role: parsed.role || "player", profile_image_url: parsed.profile_image_url,
          });
          return;
        }
      } catch { /* invalid */ }
    }

    // 2. Google auth
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) { setUser(profile); return; }
      }
    } catch { /* ignore */ }
  }, [fetchUserProfile, supabase]);

  return (
    <AuthContext.Provider value={{
      user, loading, authReturning, login, logout, refreshUser,
      showLoginModal, setShowLoginModal,
      welcomeMessage, dismissWelcome,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

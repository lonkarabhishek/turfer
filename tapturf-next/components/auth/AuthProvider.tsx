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

  const supabaseRef = useRef(createClient());
  const initDoneRef = useRef(false);
  const userSetRef = useRef(false);

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
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userData.id)
        .single();
      if (existing) return existing as AppUser;
    } catch { /* not found, will insert */ }

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
      if (!cancelled) setLoading(false);
    }, 5000);

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
              if (!cancelled) { clearTimeout(emergencyTimeout); setLoading(false); }
              return;
            }
          } catch {
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user");
          }
        }

        // 2. Google OAuth (Supabase session)
        let supaUser = null;

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) supaUser = session.user;
        } catch { /* no session */ }

        // Validate with getUser() if we got a session
        if (supaUser) {
          try {
            const { data, error } = await supabase.auth.getUser();
            if (data?.user && !error) supaUser = data.user;
          } catch { /* use session user */ }
        }

        if (supaUser && !cancelled) {
          await resolveSupabaseUser(supaUser, false);
        }
      } catch (err) {
        console.error("[AuthProvider] Init error:", err);
        if (!cancelled) setUser(null);
      } finally {
        initDoneRef.current = true;
        if (!cancelled) { clearTimeout(emergencyTimeout); setLoading(false); }
      }
    };

    init();

    // ── Auth state change listener ──

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session?.user && !userSetRef.current) {
          await resolveSupabaseUser(session.user, false);
          setLoading(false);
        }
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // Only show welcome if this is a genuinely new sign-in (user wasn't set before)
        const isNewSignIn = !userSetRef.current;
        await resolveSupabaseUser(session.user, isNewSignIn);
        setShowLoginModal(false);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        await resolveSupabaseUser(session.user, false);
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
          setUser(profile || {
            id: parsed.id, name: parsed.name || "User", email: parsed.email,
            phone: parsed.phone, role: parsed.role || "player", profile_image_url: parsed.profile_image_url,
          });
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
  }, [fetchUserProfile, supabase]);

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

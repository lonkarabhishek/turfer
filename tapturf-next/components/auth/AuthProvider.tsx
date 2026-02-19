"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const dismissWelcome = useCallback(() => {
    setWelcomeMessage(null);
  }, []);

  const showWelcome = useCallback((name: string) => {
    setWelcomeMessage(`Welcome${name ? `, ${name}` : ""}!`);
    // Auto-dismiss after 4 seconds
    setTimeout(() => setWelcomeMessage(null), 4000);
  }, []);

  const fetchUserProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userId)
        .single();

      if (data && !error) {
        return data as AppUser;
      }
    } catch {
      // Profile not found
    }
    return null;
  }, [supabase]);

  const ensureUserInDB = useCallback(async (userData: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    profile_image_url?: string;
  }): Promise<AppUser> => {
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id, name, email, phone, role, profile_image_url")
        .eq("id", userData.id)
        .single();

      if (existing) {
        return existing as AppUser;
      }

      const { data: inserted } = await supabase.from("users").insert([{
        id: userData.id,
        name: userData.name,
        email: userData.email || null,
        phone: userData.phone || null,
        role: "player",
        profile_image_url: userData.profile_image_url || null,
      }]).select().single();

      if (inserted) {
        return inserted as AppUser;
      }
    } catch {
      // Ignore — RLS may block, which is okay
    }

    // Fallback: return the data we have
    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: "player",
      profile_image_url: userData.profile_image_url,
    };
  }, [supabase]);

  // Check auth on mount
  useEffect(() => {
    const emergencyTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const isWelcomeReturn = searchParams.get("welcome") === "true";

    const init = async () => {
      try {
        // 1. Check localStorage (Firebase phone auth users)
        const authToken = localStorage.getItem("auth_token");
        const storedUser = localStorage.getItem("user");

        if (authToken && storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            if (parsed.id) {
              const profile = await fetchUserProfile(parsed.id);
              const resolvedUser = profile || {
                id: parsed.id,
                name: parsed.name || "User",
                email: parsed.email,
                phone: parsed.phone,
                role: parsed.role || "player" as const,
                profile_image_url: parsed.profile_image_url,
              };
              setUser(resolvedUser);
              clearTimeout(emergencyTimeout);
              setLoading(false);
              return;
            }
          } catch {
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user");
          }
        }

        // 2. Check Supabase session (Google OAuth users)
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const supaUser = session.user;
          const profile = await fetchUserProfile(supaUser.id);

          if (profile) {
            setUser(profile);
            if (isWelcomeReturn) {
              showWelcome(profile.name?.split(" ")[0] || "");
            }
          } else {
            const newUserData = {
              id: supaUser.id,
              name: supaUser.user_metadata?.name || supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0] || "User",
              email: supaUser.email,
              phone: supaUser.phone || supaUser.user_metadata?.phone,
              profile_image_url: supaUser.user_metadata?.avatar_url || supaUser.user_metadata?.picture,
            };
            const dbUser = await ensureUserInDB(newUserData);
            setUser(dbUser);
            if (isWelcomeReturn) {
              showWelcome(dbUser.name?.split(" ")[0] || "");
            }
          }
        }

        // Clean up the ?welcome= param from the URL
        if (isWelcomeReturn) {
          const url = new URL(window.location.href);
          url.searchParams.delete("welcome");
          router.replace(url.pathname + url.search, { scroll: false });
        }
      } catch {
        setUser(null);
      } finally {
        clearTimeout(emergencyTimeout);
        setLoading(false);
      }
    };

    init();

    // Listen for Supabase auth changes (Google OAuth)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const supaUser = session.user;
        const profile = await fetchUserProfile(supaUser.id);

        if (profile) {
          setUser(profile);
        } else {
          const newUserData = {
            id: supaUser.id,
            name: supaUser.user_metadata?.name || supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0] || "User",
            email: supaUser.email,
            phone: supaUser.phone,
            profile_image_url: supaUser.user_metadata?.avatar_url || supaUser.user_metadata?.picture,
          };
          const dbUser = await ensureUserInDB(newUserData);
          setUser(dbUser);
        }
        setShowLoginModal(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(emergencyTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const logout = useCallback(async () => {
    // Clear Firebase / localStorage auth
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");

    // Sign out from Firebase
    try {
      await firebaseAuth.signOut();
    } catch {
      // Ignore
    }

    // Sign out from Supabase
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore
    }

    setUser(null);
  }, [supabase]);

  const refreshUser = useCallback(async () => {
    // Try localStorage first (phone auth users)
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) {
          const profile = await fetchUserProfile(parsed.id);
          if (profile) {
            setUser(profile);
            return;
          }
          // If DB fetch failed, use stored data
          setUser({
            id: parsed.id,
            name: parsed.name || "User",
            email: parsed.email,
            phone: parsed.phone,
            role: parsed.role || "player",
            profile_image_url: parsed.profile_image_url,
          });
          return;
        }
      } catch {
        // Invalid stored data
      }
    }

    // Fall back to current user state
    if (user) {
      const profile = await fetchUserProfile(user.id);
      if (profile) setUser(profile);
    }
  }, [user, fetchUserProfile]);

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

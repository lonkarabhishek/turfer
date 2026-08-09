"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
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

// Two auth paths, tracked so we can handle each independently.
type AuthSource = "phone" | "oauth" | null;

// Build AppUser fields from a Supabase auth user's metadata
function buildUserFromSupabase(supaUser: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }): Omit<AppUser, "role"> & { role?: string; profile_image_url?: string } {
  return {
    id: supaUser.id,
    name: (supaUser.user_metadata?.name || supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0] || "User") as string,
    email: supaUser.email,
    phone: (supaUser.phone || supaUser.user_metadata?.phone) as string | undefined,
    profile_image_url: (supaUser.user_metadata?.avatar_url || supaUser.user_metadata?.picture) as string | undefined,
  };
}

/**
 * Read the phone-auth user out of localStorage synchronously so it's
 * available on the very first render (no auth flash on hydration).
 * Silent-fails on corrupt JSON — we return null instead of nuking the
 * keys so a transient parse hiccup can't log the user out.
 */
function readPhoneUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("auth_token");
    const raw = localStorage.getItem("user");
    if (!token || !raw) return null;
    const p = JSON.parse(raw);
    if (!p?.id) return null;
    return {
      id: p.id,
      name: p.name || "User",
      email: p.email,
      phone: p.phone,
      role: (p.role || "user") as AppUser["role"],
      profile_image_url: p.profile_image_url,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from localStorage synchronously.
  const initial = typeof window !== "undefined" ? readPhoneUser() : null;
  const [user, setUser] = useState<AppUser | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());
  const sourceRef = useRef<AuthSource>(initial ? "phone" : null);
  const supabase = supabaseRef.current;

  const dismissWelcome = useCallback(() => setWelcomeMessage(null), []);

  const showWelcome = useCallback((name: string) => {
    setWelcomeMessage(`Welcome${name ? `, ${name}` : ""}!`);
    setTimeout(() => setWelcomeMessage(null), 3500);
  }, []);

  // ── DB helpers ──

  const fetchUserProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    try {
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
    const byId = await fetchUserProfile(userData.id);
    if (byId) return byId;

    if (userData.email) {
      const byEmail = await fetchUserProfileByEmail(userData.email);
      if (byEmail) return byEmail;
    }

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

    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      role: "user" as AppUser["role"],
      profile_image_url: userData.profile_image_url,
    };
  }, [supabase, fetchUserProfile, fetchUserProfileByEmail]);

  const resolveSupabaseUser = useCallback(async (
    supaUser: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> },
    shouldWelcome: boolean,
  ) => {
    const meta = buildUserFromSupabase(supaUser);
    const dbUser = await ensureUserInDB(meta);
    setUser(dbUser);
    sourceRef.current = "oauth";
    if (shouldWelcome) showWelcome(dbUser.name?.split(" ")[0] || "");
  }, [ensureUserInDB, showWelcome]);

  // ── Init auth on mount ──

  useEffect(() => {
    let cancelled = false;
    const emergencyTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    // Called any time we might have lost/regained phone-auth localStorage
    // (visibility change, storage event, or a Supabase SIGNED_OUT while
    // there's still a phone token sitting there).
    const rehydratePhone = () => {
      const p = readPhoneUser();
      if (p) {
        setUser(p);
        sourceRef.current = "phone";
        setLoading(false);
        return true;
      }
      return false;
    };

    // ── 1. Phone auth: instant from localStorage ──
    if (initial) {
      sourceRef.current = "phone";
      setLoading(false);
      clearTimeout(emergencyTimeout);
      // Freshen from DB in the background — non-blocking, and if it
      // returns nothing we KEEP the localStorage user (don't nuke).
      fetchUserProfile(initial.id).then((profile) => {
        if (profile && !cancelled && sourceRef.current === "phone") setUser(profile);
      });
    }

    // ── 2. Google OAuth ──
    const url = new URL(window.location.href);
    const shouldWelcomeFromCallback = url.searchParams.get("welcome") === "1";
    if (shouldWelcomeFromCallback) {
      // Strip the flag from the URL right away so a share/reload doesn't
      // re-fire the welcome toast.
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());

      // User actively chose Google — OAuth must win. Blow away any stale
      // phone auth in localStorage so it can't out-vote the fresh session
      // once the subscription starts firing INITIAL_SESSION.
      try {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
      } catch { /* ignore */ }
      sourceRef.current = null;
    }

    // Belt-and-suspenders: proactively fetch the current Supabase session
    // in addition to subscribing to onAuthStateChange. INITIAL_SESSION can
    // fire before our subscription attaches on slow devices, and after a
    // fresh OAuth callback the cookies may not be visible to JS on the
    // very first attempt — retry a few times.
    (async () => {
      for (let attempt = 0; attempt < (shouldWelcomeFromCallback ? 4 : 1); attempt++) {
        if (cancelled) return;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const alreadyOAuth = sourceRef.current === "oauth" && user?.id === session.user.id;
            if (!alreadyOAuth) {
              await resolveSupabaseUser(session.user, shouldWelcomeFromCallback);
            }
            clearTimeout(emergencyTimeout);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("[Auth] getSession attempt", attempt + 1, "failed:", e);
        }
        // Wait 250ms before retrying (only in welcome=1 path)
        if (attempt < 3 && shouldWelcomeFromCallback) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          // If we came from the OAuth callback OR there's no phone user,
          // resolve Supabase. Otherwise phone wins (user hasn't asked for
          // Google — they're just carrying a stale cookie).
          const shouldResolve = shouldWelcomeFromCallback || sourceRef.current !== "phone";
          if (shouldResolve) {
            await resolveSupabaseUser(session.user, shouldWelcomeFromCallback);
          }
        }
        clearTimeout(emergencyTimeout);
        setLoading(false);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        const isNewSignIn = sourceRef.current === null;
        await resolveSupabaseUser(session.user, isNewSignIn);
        setShowLoginModal(false);
        setLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        // No-op. Silent refresh — don't churn state.
        return;
      }

      if (event === "SIGNED_OUT") {
        // Only care about SIGNED_OUT if we were actually oauth. Phone
        // users never had a Supabase session, so a spurious SIGNED_OUT
        // (e.g. token-reuse detection wiping the wrong thing) must NOT
        // log them out.
        if (sourceRef.current !== "oauth") return;

        // OAuth session gone. Before nuking user state, see if there's
        // still a phone token sitting in localStorage we can fall back
        // to — otherwise sign the user out.
        if (rehydratePhone()) return;
        setUser(null);
        sourceRef.current = null;
        setLoading(false);
      }
    });

    // ── 3. Robustness listeners ──
    // Storage: another tab logged in/out, sync our state.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "user" && e.key !== "auth_token") return;
      const p = readPhoneUser();
      if (p) {
        setUser(p);
        sourceRef.current = "phone";
      } else if (sourceRef.current === "phone") {
        // Phone auth cleared in another tab. Only wipe user if we were
        // phone — an oauth session might still be valid.
        setUser(null);
        sourceRef.current = null;
      }
    };

    // Visibility: app came back into focus. Re-check localStorage in
    // case iOS ITP or memory-pressure evicted it while we were away —
    // if it's still there we keep the current user; if it was evicted
    // AND we thought we were phone-auth, verify before wiping.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const p = readPhoneUser();
      if (p) {
        if (sourceRef.current !== "phone" || user?.id !== p.id) {
          setUser(p);
          sourceRef.current = "phone";
        }
      }
      // If phone user is missing but we thought we had one, don't
      // panic — the PWALifecycle full-reload will handle a stale
      // state cleanly. Doing nothing here avoids race-y wipe loops.
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(emergencyTimeout);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──

  const login = useCallback(() => setShowLoginModal(true), []);

  const logout = useCallback(async () => {
    // Intentional logout — clear BOTH sources.
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const auth = await getFirebaseAuth();
      await auth.signOut();
    } catch { /* ignore */ }
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    sourceRef.current = null;
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
          sourceRef.current = "phone";
          showWelcome(nextUser.name?.split(" ")[0] || "");
          return;
        }
      } catch { /* invalid */ }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) { setUser(profile); sourceRef.current = "oauth"; return; }
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

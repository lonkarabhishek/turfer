import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

// Extended user type with your app-specific fields
export interface AppUser extends User {
  name?: string;
  phone?: string;
  role?: 'user' | 'owner' | 'admin';
  profile_image_url?: string;
  isVerified?: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is authenticated on mount and listen for auth changes
  useEffect(() => {
    // Emergency timeout to prevent infinite loading
    const emergencyTimeout = setTimeout(() => {
      console.warn('Emergency timeout: forcing loading to false');
      setLoading(false);
      setUser(null);
    }, 3000); // 3 second emergency timeout

    // Get initial session with fast execution
    const getInitialSession = async () => {
      try {
        // First, check for Firebase-based auth in localStorage
        const authToken = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('user');

        if (authToken && storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            const firebaseUser: AppUser = {
              id: parsedUser.id,
              email: parsedUser.email,
              name: parsedUser.name,
              phone: parsedUser.phone,
              role: parsedUser.role || 'user',
              profile_image_url: parsedUser.profile_image_url,
              isVerified: parsedUser.isVerified || parsedUser.is_verified || true,
              // Add required Supabase User fields
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: parsedUser.createdAt || parsedUser.created_at || new Date().toISOString()
            } as AppUser;

            setUser(firebaseUser);
            clearTimeout(emergencyTimeout);
            setLoading(false);
            return;
          } catch (error) {
            console.error('Error parsing stored user:', error);
            // Clear invalid data and continue to Supabase Auth check
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
          }
        }

        // Fallback to Supabase Auth
        // Add a quick timeout for the session fetch itself
        const sessionPromise = supabase.auth.getSession();
        const quickTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout')), 2000)
        );

        const { data: { session }, error: sessionError } = await Promise.race([
          sessionPromise,
          quickTimeout
        ]) as any;

        if (sessionError) {
          console.warn('Session error:', sessionError);
          setUser(null);
          clearTimeout(emergencyTimeout);
          setLoading(false);
          return;
        }

        if (session?.user) {
          // Use Supabase Auth user directly - no database calls
          const baseUser: AppUser = {
            ...session.user,
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            phone: session.user.user_metadata?.phone || '',
            role: session.user.user_metadata?.role || 'user',
            profile_image_url: session.user.user_metadata?.profile_image_url || '',
            isVerified: session.user.email_confirmed_at ? true : false
          };

          setUser(baseUser);

          // Skip background profile enhancement to avoid RLS issues
        } else {
          // No session/user found, set user to null
          setUser(null);
        }
      } catch (error) {
        console.error('Session fetch error:', error);
        setUser(null);
      } finally {
        clearTimeout(emergencyTimeout);
        setLoading(false);
      }
    };

    getInitialSession();
    
    // Listen for auth state changes (fast, no blocking calls)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Use Supabase Auth user directly - immediate response
        const baseUser: AppUser = {
          ...session.user,
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          phone: session.user.user_metadata?.phone || '',
          role: session.user.user_metadata?.role || 'user',
          profile_image_url: session.user.user_metadata?.profile_image_url || '',
          isVerified: session.user.email_confirmed_at ? true : false
        };
        
        setUser(baseUser);
        
        // Skip background profile enhancement to avoid RLS issues
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    // Cleanup subscription and timeout
    return () => {
      subscription.unsubscribe();
      clearTimeout(emergencyTimeout);
    };
  }, []);

  const refreshAuth = async () => {
    // First, check for Firebase-based auth in localStorage
    const authToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');

    if (authToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        const firebaseUser: AppUser = {
          id: parsedUser.id,
          email: parsedUser.email,
          name: parsedUser.name,
          phone: parsedUser.phone,
          role: parsedUser.role || 'user',
          profile_image_url: parsedUser.profile_image_url,
          isVerified: parsedUser.isVerified || parsedUser.is_verified || true,
          // Add required Supabase User fields
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: parsedUser.createdAt || parsedUser.created_at || new Date().toISOString()
        } as AppUser;

        setUser(firebaseUser);
        return;
      } catch (error) {
        console.error('Error parsing stored user:', error);
        // Clear invalid data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      }
    }

    // Fallback to Supabase Auth
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // Use Supabase Auth user directly, with optional profile enhancement
      const baseUser: AppUser = {
        ...session.user,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
        phone: session.user.user_metadata?.phone || '',
        role: session.user.user_metadata?.role || 'user',
        profile_image_url: session.user.user_metadata?.profile_image_url || '',
        isVerified: session.user.email_confirmed_at ? true : false
      };

      // Use only Supabase Auth data to avoid RLS policy issues
      setUser(baseUser);
    } else {
      setUser(null);
    }
  };

  const logout = async () => {
    // Clear Firebase-based auth from localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');

    // Also sign out from Supabase Auth
    await supabase.auth.signOut();

    setUser(null);
  };

  const isAuthenticated = () => !!user;
  const isOwner = () => user?.role === 'owner';

  return {
    user,
    loading,
    refreshAuth,
    logout,
    isAuthenticated,
    isOwner,
  };
}
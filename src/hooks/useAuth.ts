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
    // Get initial session with timeout
    const getInitialSession = async () => {
      const timeoutId = setTimeout(() => {
        console.warn('Auth initialization timed out, continuing with no user');
        setLoading(false);
      }, 5000); // 5 second timeout

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn('Session error:', sessionError);
          clearTimeout(timeoutId);
          setLoading(false);
          return;
        }
        
        if (session?.user) {
          try {
            // Get user profile from your users table with timeout
            const profilePromise = supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
            );

            const { data: profile, error } = await Promise.race([profilePromise, timeoutPromise]) as any;
            
            if (error || !profile) {
              console.warn('Profile fetch failed, using basic user data:', error);
              setUser(session.user as AppUser);
            } else {
              setUser({
                ...session.user,
                ...profile
              });
            }
          } catch (profileError) {
            console.warn('Profile fetch failed:', profileError);
            setUser(session.user as AppUser);
          }
        }
        
        clearTimeout(timeoutId);
      } catch (error) {
        console.error('Session fetch error:', error);
        clearTimeout(timeoutId);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Get user profile from your users table
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setUser({
            ...session.user,
            ...profile
          });
        } else {
          setUser(session.user as AppUser);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    // Cleanup subscription
    return () => subscription.unsubscribe();
  }, []);

  const refreshAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (profile) {
        setUser({
          ...session.user,
          ...profile
        });
      } else {
        setUser(session.user as AppUser);
      }
    } else {
      setUser(null);
    }
  };

  const logout = async () => {
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
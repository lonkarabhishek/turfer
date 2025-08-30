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
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn('Session error:', sessionError);
          setLoading(false);
          return;
        }
        
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
          
          // Try to get enhanced profile from users table (optional)
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();
            
            if (profile) {
              setUser({
                ...baseUser,
                ...profile
              });
            } else {
              setUser(baseUser);
            }
          } catch (profileError) {
            // Users table doesn't exist or RLS blocking access, use base user
            console.log('Using Supabase Auth user only (users table not accessible)');
            setUser(baseUser);
          }
        }
      } catch (error) {
        console.error('Session fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Use Supabase Auth user directly, with optional profile enhancement
        const baseUser: AppUser = {
          ...session.user,
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          phone: session.user.user_metadata?.phone || '',
          role: session.user.user_metadata?.role || 'user',
          profile_image_url: session.user.user_metadata?.profile_image_url || '',
          isVerified: session.user.email_confirmed_at ? true : false
        };
        
        // Try to get enhanced profile from users table (optional)
        try {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            setUser({
              ...baseUser,
              ...profile
            });
          } else {
            setUser(baseUser);
          }
        } catch (profileError) {
          // Users table doesn't exist or RLS blocking access, use base user
          setUser(baseUser);
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
      // Use Supabase Auth user directly, with optional profile enhancement
      const baseUser: AppUser = {
        ...session.user,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
        phone: session.user.user_metadata?.phone || '',
        role: session.user.user_metadata?.role || 'user',
        profile_image_url: session.user.user_metadata?.profile_image_url || '',
        isVerified: session.user.email_confirmed_at ? true : false
      };
      
      // Try to get enhanced profile from users table (optional)
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setUser({
            ...baseUser,
            ...profile
          });
        } else {
          setUser(baseUser);
        }
      } catch (profileError) {
        // Users table doesn't exist or RLS blocking access, use base user
        setUser(baseUser);
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
import { useState, useEffect } from 'react';
import { authManager, authAPI, type User } from '../lib/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(authManager.getUser());
  const [loading, setLoading] = useState(false);

  // Check if user is authenticated on mount and refresh token if needed
  useEffect(() => {
    const initAuth = async () => {
      if (authManager.isAuthenticated()) {
        setLoading(true);
        try {
          // Verify token is still valid by getting profile
          const response = await authAPI.getProfile();
          if (response.success && response.data) {
            setUser(response.data);
          } else {
            // Token is invalid, clear auth
            authManager.clearAuth();
            setUser(null);
          }
        } catch {
          // Token is invalid, clear auth
          authManager.clearAuth();
          setUser(null);
        } finally {
          setLoading(false);
        }
      }
    };

    initAuth();
  }, []);

  const refreshAuth = () => {
    setUser(authManager.getUser());
  };

  const logout = () => {
    authManager.clearAuth();
    setUser(null);
  };

  const isAuthenticated = () => authManager.isAuthenticated();
  const isOwner = () => authManager.isOwner();

  return {
    user,
    loading,
    refreshAuth,
    logout,
    isAuthenticated,
    isOwner,
  };
}
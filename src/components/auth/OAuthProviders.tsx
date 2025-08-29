import { useState } from 'react';
import { Button } from '../ui/button';
import { authAPI, authManager } from '../../lib/api';
import { useToast } from '../../lib/toastManager';

// Type declarations for external libraries
declare global {
  interface Window {
    AppleID?: {
      auth: {
        signIn: () => Promise<any>;
      };
    };
  }
}

interface OAuthProvidersProps {
  onSuccess: () => void;
  onError: (error: string) => void;
}

// Google OAuth configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = `${window.location.origin}/auth/google/callback`;

// Apple OAuth configuration  
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID;
const APPLE_REDIRECT_URI = `${window.location.origin}/auth/apple/callback`;

export function OAuthProviders({ onSuccess, onError }: OAuthProvidersProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { success } = useToast();

  const handleGoogleOAuth = async () => {
    if (!GOOGLE_CLIENT_ID) {
      onError('Google OAuth is not configured');
      return;
    }

    setLoading('google');
    
    try {
      // Create Google OAuth URL
      const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleOAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      googleOAuthUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
      googleOAuthUrl.searchParams.set('response_type', 'code');
      googleOAuthUrl.searchParams.set('scope', 'openid email profile');
      googleOAuthUrl.searchParams.set('state', crypto.randomUUID());

      // Open OAuth popup
      const popup = window.open(
        googleOAuthUrl.toString(),
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for OAuth callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'oauth-success' && event.data.provider === 'google') {
          try {
            const response = await authAPI.oauth('google');
            
            if (response.success && response.data) {
              authManager.setAuth(response.data.token, response.data.user);
              success('Successfully signed in with Google!');
              onSuccess();
            } else {
              onError(response.error || 'Google sign-in failed');
            }
          } catch (err) {
            onError('Failed to complete Google sign-in');
          }
          
          popup?.close();
          window.removeEventListener('message', handleMessage);
        } else if (event.data.type === 'oauth-error') {
          onError(event.data.error || 'Google sign-in was cancelled');
          popup?.close();
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setLoading(null);
        }
      }, 1000);

    } catch (err) {
      onError('Failed to start Google sign-in');
    } finally {
      setTimeout(() => setLoading(null), 5000); // Fallback timeout
    }
  };

  const handleAppleOAuth = async () => {
    if (!APPLE_CLIENT_ID) {
      onError('Apple OAuth is not configured');
      return;
    }

    setLoading('apple');
    
    try {
      // Apple Sign-In with JavaScript SDK
      if (typeof window.AppleID !== 'undefined') {
        await window.AppleID?.auth.signIn();
        
        // Send Apple ID token to backend for verification
        const authResponse = await authAPI.oauth('apple');
        
        if (authResponse.success && authResponse.data) {
          authManager.setAuth(authResponse.data.token, authResponse.data.user);
          success('Successfully signed in with Apple!');
          onSuccess();
        } else {
          onError(authResponse.error || 'Apple sign-in failed');
        }
      } else {
        // Fallback to web-based Apple OAuth
        const appleOAuthUrl = new URL('https://appleid.apple.com/auth/authorize');
        appleOAuthUrl.searchParams.set('client_id', APPLE_CLIENT_ID);
        appleOAuthUrl.searchParams.set('redirect_uri', APPLE_REDIRECT_URI);
        appleOAuthUrl.searchParams.set('response_type', 'code');
        appleOAuthUrl.searchParams.set('scope', 'name email');
        appleOAuthUrl.searchParams.set('response_mode', 'form_post');
        appleOAuthUrl.searchParams.set('state', crypto.randomUUID());

        window.location.href = appleOAuthUrl.toString();
      }
    } catch (err: any) {
      if (err.error === 'popup_closed_by_user') {
        // User cancelled, don't show error
        setLoading(null);
        return;
      }
      onError('Apple sign-in failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (provider === 'google') {
      await handleGoogleOAuth();
    } else if (provider === 'apple') {
      await handleAppleOAuth();
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => handleOAuth('google')}
          disabled={loading !== null}
          className="py-2.5"
        >
          {loading === 'google' ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span className="text-sm">Google</span>
        </Button>

        <Button
          variant="outline"
          onClick={() => handleOAuth('apple')}
          disabled={loading !== null}
          className="py-2.5"
        >
          {loading === 'apple' ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
            </svg>
          )}
          <span className="text-sm">Apple</span>
        </Button>
      </div>
    </div>
  );
}
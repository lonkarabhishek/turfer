import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader, Home, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { supabase } from '../lib/supabase';

export function EmailConfirmation() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        console.log('📧 Starting email confirmation process');
        console.log('🔗 Current URL:', window.location.href);
        console.log('📍 Hash:', window.location.hash);
        console.log('🔍 Search params:', window.location.search);
        
        // Try different ways to get the tokens
        let accessToken = null;
        let refreshToken = null;
        let type = null;
        
        // Method 1: Check hash params (most common)
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          accessToken = hashParams.get('access_token');
          refreshToken = hashParams.get('refresh_token');
          type = hashParams.get('type');
          console.log('🔑 From hash - Access Token:', !!accessToken, 'Refresh Token:', !!refreshToken, 'Type:', type);
        }
        
        // Method 2: Check query params (alternative)
        if (!accessToken && window.location.search) {
          const urlParams = new URLSearchParams(window.location.search);
          accessToken = urlParams.get('access_token');
          refreshToken = urlParams.get('refresh_token');
          type = urlParams.get('type');
          console.log('🔑 From search - Access Token:', !!accessToken, 'Refresh Token:', !!refreshToken, 'Type:', type);
        }
        
        // Method 3: Try Supabase's built-in session from URL
        if (!accessToken) {
          console.log('🔄 Trying Supabase getSessionFromUrl...');
          const { data, error } = await supabase.auth.getSession();
          console.log('📱 Current session:', !!data.session, error?.message);
          
          if (!data.session) {
            // Try to exchange the URL for a session
            const { data: sessionData, error: sessionError } = await supabase.auth.getSessionFromUrl(window.location.href);
            console.log('🔄 Session from URL:', !!sessionData.session, sessionError?.message);
            
            if (sessionData.session) {
              setStatus('success');
              setMessage('Your email has been verified successfully!');
              
              // Auto-redirect to dashboard after 2 seconds
              setTimeout(() => {
                window.location.href = '/';
              }, 2000);
              return;
            }
          } else {
            // Already have a session
            setStatus('success');
            setMessage('Your email has been verified successfully!');
            
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
            return;
          }
        }
        
        if (accessToken && refreshToken) {
          console.log('✅ Found tokens, setting session...');
          // Set the session
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('❌ Session error:', error);
            throw error;
          }

          console.log('🎉 Session set successfully!');
          setStatus('success');
          setMessage('Your email has been verified successfully!');
          
          // Auto-redirect to dashboard after 2 seconds
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        } else {
          console.error('❌ No valid tokens found');
          console.log('🔍 Available URL parts:');
          console.log('  - Hash:', window.location.hash);
          console.log('  - Search:', window.location.search);
          console.log('  - Pathname:', window.location.pathname);
          throw new Error('Invalid confirmation link. Please make sure you clicked the correct link from your email.');
        }
      } catch (error: any) {
        console.error('❌ Email confirmation error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to verify email. Please try signing up again or contact support.');
      }
    };

    confirmEmail();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center"
      >
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Verifying your email...
            </h1>
            <p className="text-gray-600">
              Please wait while we confirm your email address.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Welcome to TapTurf!
            </h1>
            <p className="text-gray-600 mb-6">
              {message}
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <Loader className="w-4 h-4 animate-spin" />
                <span>Redirecting to dashboard...</span>
              </div>
              <Button
                onClick={() => window.location.href = '/'}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Verification Failed
            </h1>
            <p className="text-gray-600 mb-6">
              {message}
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => window.location.href = '/'}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              <p className="text-xs text-gray-500">
                Having trouble? Contact support for assistance.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default EmailConfirmation;
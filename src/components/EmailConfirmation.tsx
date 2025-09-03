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
        // Get the hash params from URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          // Set the session
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          setStatus('success');
          setMessage('Your email has been verified successfully!');
          
          // Auto-redirect to dashboard after 3 seconds
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
        } else {
          throw new Error('Invalid confirmation link');
        }
      } catch (error: any) {
        console.error('Email confirmation error:', error);
        setStatus('error');
        setMessage(error.message || 'Failed to verify email. Please try again.');
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
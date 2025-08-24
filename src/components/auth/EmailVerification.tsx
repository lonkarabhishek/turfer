import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, CheckCircle, X } from 'lucide-react';
import { Button } from '../ui/button';
import { authAPI } from '../../lib/api';

interface EmailVerificationProps {
  email: string;
  onClose: () => void;
  onVerified: () => void;
}

export function EmailVerification({ email, onClose, onVerified }: EmailVerificationProps) {
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setResending(true);
    setError('');
    
    try {
      const response = await authAPI.resendVerification(email);
      if (response.success) {
        setCountdown(60); // 1 minute cooldown
      } else {
        setError(response.error || 'Failed to resend verification email');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async (code: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.verifyEmail(email, code);
      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          onVerified();
          onClose();
        }, 1500);
      } else {
        setError(response.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Email Verified!</h2>
          <p className="text-gray-600">Your account has been successfully verified.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-3">
              <Mail className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Verify Your Email</h2>
              <p className="text-sm text-gray-600">Check your inbox</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              We've sent a verification email to:
            </p>
            <p className="font-medium text-blue-900 mt-1">{email}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Click the verification link in your email to activate your account.
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Didn't receive the email?
              </p>
              <Button
                variant="outline"
                onClick={handleResend}
                disabled={resending || countdown > 0}
                size="sm"
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : countdown > 0 ? (
                  `Resend in ${countdown}s`
                ) : (
                  'Resend Email'
                )}
              </Button>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs text-gray-500">
                Check your spam folder if you don't see the email
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
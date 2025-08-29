import { useState } from 'react';
import { motion } from 'framer-motion';
import { Key, Mail, Eye, EyeOff, X, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { authAPI } from '../../lib/api';

interface PasswordResetProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'email' | 'code' | 'password' | 'success';

export function PasswordReset({ open, onClose }: PasswordResetProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.requestPasswordReset(email);
      if (response.success) {
        setStep('code');
      } else {
        setError(response.error || 'Failed to send reset email');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!resetCode || resetCode.length !== 6) {
      setError('Please enter the 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.verifyResetCode(email, resetCode);
      if (response.success) {
        setStep('password');
      } else {
        setError(response.error || 'Invalid or expired code');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate password
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.resetPassword(email, resetCode, password);
      if (response.success) {
        setStep('success');
      } else {
        setError(response.error || 'Failed to reset password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('email');
    setEmail('');
    setResetCode('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  const renderStep = () => {
    switch (step) {
      case 'email':
        return (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold">Reset Password</h2>
              <p className="text-sm text-gray-600 mt-1">
                Enter your email to receive a reset code
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
              />

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Sending Code...
                  </div>
                ) : (
                  'Send Reset Code'
                )}
              </Button>
            </form>
          </div>
        );

      case 'code':
        return (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold">Enter Reset Code</h2>
              <p className="text-sm text-gray-600 mt-1">
                We've sent a 6-digit code to {email}
              </p>
            </div>

            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <Input
                placeholder="Enter 6-digit code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-full text-center text-lg tracking-wider"
              />

              <Button
                type="submit"
                disabled={loading || resetCode.length !== 6}
                className="w-full bg-primary-600 hover:bg-primary-700"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Verifying...
                  </div>
                ) : (
                  'Verify Code'
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('email')}
                className="w-full"
              >
                Back to Email
              </Button>
            </form>
          </div>
        );

      case 'password':
        return (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="text-xl font-bold">Set New Password</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create a strong password for your account
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>

              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />

              <div className="text-xs text-gray-600 space-y-1">
                <p>Password must:</p>
                <ul className="space-y-1 ml-4">
                  <li className="flex items-center">
                    <div className={`w-1 h-1 rounded-full mr-2 ${password.length >= 8 ? 'bg-green-500' : 'bg-gray-300'}`} />
                    Be at least 8 characters long
                  </li>
                  <li className="flex items-center">
                    <div className={`w-1 h-1 rounded-full mr-2 ${password === confirmPassword && password ? 'bg-green-500' : 'bg-gray-300'}`} />
                    Match the confirmation
                  </li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirmPassword}
                className="w-full bg-primary-600 hover:bg-primary-700"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </div>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </div>
        );

      case 'success':
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Password Updated!</h2>
            <p className="text-gray-600 mb-6">
              Your password has been successfully updated. You can now sign in with your new password.
            </p>
            <Button
              onClick={handleClose}
              className="w-full bg-primary-600 hover:bg-primary-700"
            >
              Sign In Now
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1" />
          <Button variant="ghost" onClick={handleClose} className="p-2">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {renderStep()}
      </motion.div>
    </div>
  );
}
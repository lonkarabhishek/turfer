import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Eye, EyeOff, User, Building2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { authAPI, authManager } from '../lib/api';
import { OAuthProviders } from './auth/OAuthProviders';
import { EmailVerification } from './auth/EmailVerification';
import { PasswordReset } from './auth/PasswordReset';

interface SimpleAuthProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SimpleAuth({ open, onClose, onSuccess }: SimpleAuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'user' | 'owner'>('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });

  const [validation, setValidation] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  });

  if (!open) return null;

  // Validation functions
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return 'Email is required';
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const validatePassword = (password: string) => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters long';
    if (!/(?=.*[a-z])(?=.*[A-Z])/.test(password)) return 'Password must contain both uppercase and lowercase letters';
    if (!/(?=.*\d)/.test(password)) return 'Password must contain at least one number';
    return '';
  };

  const validateConfirmPassword = (password: string, confirmPassword: string) => {
    if (!confirmPassword) return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const validateName = (name: string) => {
    if (!name) return 'Name is required';
    if (name.length < 2) return 'Name must be at least 2 characters long';
    if (!/^[a-zA-Z\s]+$/.test(name)) return 'Name can only contain letters and spaces';
    return '';
  };

  const validateForm = () => {
    const errors = {
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
      confirmPassword: isLogin ? '' : validateConfirmPassword(formData.password, formData.confirmPassword),
      name: isLogin ? '' : validateName(formData.name)
    };

    setValidation(errors);
    return Object.values(errors).every(error => error === '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate form
    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      let response;
      
      if (isLogin) {
        response = await authAPI.login(formData.email, formData.password);
      } else {
        response = await authAPI.register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || undefined,
          role: userType,
        });
      }

      if (response.success && response.data) {
        // Check if email verification is required
        if (!isLogin && !response.data.user.isVerified) {
          setPendingEmail(formData.email);
          setShowEmailVerification(true);
          return;
        }
        
        authManager.setAuth(response.data.token, response.data.user);
        onSuccess();
        onClose();
        // Reset form
        setFormData({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
        setValidation({ email: '', password: '', confirmPassword: '', name: '' });
        setError('');
      } else {
        setError(response.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (email: string, password: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.login(email, password);
      if (response.success && response.data) {
        authManager.setAuth(response.data.token, response.data.user);
        onSuccess();
        onClose();
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">
              {isLogin ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-sm text-gray-600">
              {isLogin ? 'Welcome back to TapTurf' : 'Join TapTurf today'}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* OAuth Providers */}
        <OAuthProviders
          onSuccess={() => {
            onSuccess();
            onClose();
          }}
          onError={setError}
        />

        {/* Demo accounts only in development */}
        {isLogin && import.meta.env.DEV && (
          <div className="mt-6 mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 mb-3">🚧 Development Mode - Quick Login:</p>
            <div className="space-y-2">
              <Button
                onClick={() => quickLogin('user@turfbooking.com', 'password123')}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-sm py-2"
              >
                <User className="w-4 h-4 mr-2" />
                Demo Player
              </Button>
              <Button
                onClick={() => quickLogin('owner@turfbooking.com', 'password123')}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-sm py-2"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Demo Owner
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-600 text-center">Or sign in with your account:</p>
            </div>
          </div>
        )}

        {/* User Type Selection (for signup) */}
        {!isLogin && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">I am a:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={userType === 'user' ? 'default' : 'outline'}
                onClick={() => setUserType('user')}
                className="py-2"
              >
                <User className="w-4 h-4 mr-2" />
                Player
              </Button>
              <Button
                type="button"
                variant={userType === 'owner' ? 'default' : 'outline'}
                onClick={() => setUserType('owner')}
                className="py-2"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Turf Owner
              </Button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <Input
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  setValidation(prev => ({ ...prev, name: '' }));
                }}
                required
                className={validation.name ? 'border-red-300' : ''}
              />
              {validation.name && (
                <p className="text-red-600 text-xs mt-1">{validation.name}</p>
              )}
            </div>
          )}

          <div>
            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, email: e.target.value }));
                setValidation(prev => ({ ...prev, email: '' }));
              }}
              required
              className={validation.email ? 'border-red-300' : ''}
            />
            {validation.email && (
              <p className="text-red-600 text-xs mt-1">{validation.email}</p>
            )}
          </div>

          {!isLogin && (
            <Input
              placeholder="Phone (optional)"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            />
          )}

          <div>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={formData.password}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, password: e.target.value }));
                  setValidation(prev => ({ ...prev, password: '' }));
                }}
                required
                className={validation.password ? 'border-red-300' : ''}
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
            {validation.password && (
              <p className="text-red-600 text-xs mt-1">{validation.password}</p>
            )}
          </div>

          {!isLogin && (
            <div>
              <Input
                type="password"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, confirmPassword: e.target.value }));
                  setValidation(prev => ({ ...prev, confirmPassword: '' }));
                }}
                required
                className={validation.confirmPassword ? 'border-red-300' : ''}
              />
              {validation.confirmPassword && (
                <p className="text-red-600 text-xs mt-1">{validation.confirmPassword}</p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-primary-600 hover:bg-primary-700"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                {isLogin ? 'Signing In...' : 'Creating Account...'}
              </div>
            ) : (
              isLogin ? 'Sign In' : 'Create Account'
            )}
          </Button>
        </form>

        {/* Toggle Login/Signup and Password Reset */}
        <div className="mt-6 text-center space-y-2">
          {isLogin && (
            <button
              type="button"
              onClick={() => setShowPasswordReset(true)}
              className="text-primary-600 hover:text-primary-700 text-sm block w-full"
            >
              Forgot your password?
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setFormData({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
              setValidation({ email: '', password: '', confirmPassword: '', name: '' });
            }}
            className="text-primary-600 hover:text-primary-700 text-sm"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        {/* Email Verification Modal */}
        {showEmailVerification && (
          <EmailVerification
            email={pendingEmail}
            onClose={() => setShowEmailVerification(false)}
            onVerified={() => {
              setShowEmailVerification(false);
              onSuccess();
              onClose();
            }}
          />
        )}

        {/* Password Reset Modal */}
        <PasswordReset
          open={showPasswordReset}
          onClose={() => setShowPasswordReset(false)}
        />
      </motion.div>
    </div>
  );
}
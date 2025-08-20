import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Eye, EyeOff, User, Building2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { authAPI, authManager } from '../lib/api';

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
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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
        authManager.setAuth(response.data.token, response.data.user);
        onSuccess();
        onClose();
        // Reset form
        setFormData({ name: '', email: '', password: '', phone: '' });
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

        {/* Quick Login Demo Accounts */}
        {isLogin && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-3">Quick Demo Login:</p>
            <div className="space-y-2">
              <Button
                onClick={() => quickLogin('user@turfbooking.com', 'password123')}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-sm py-2"
              >
                <User className="w-4 h-4 mr-2" />
                Login as User
              </Button>
              <Button
                onClick={() => quickLogin('owner@turfbooking.com', 'password123')}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-sm py-2"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Login as Owner
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">Or sign in manually:</p>
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
            <Input
              placeholder="Full Name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          )}

          <Input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            required
          />

          {!isLogin && (
            <Input
              placeholder="Phone (optional)"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            />
          )}

          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
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

        {/* Toggle Login/Signup */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setFormData({ name: '', email: '', password: '', phone: '' });
            }}
            className="text-primary-600 hover:text-primary-700 text-sm"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, EyeOff, User, Building2, Mail, Phone, Shield, CheckCircle, Loader } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { supabase } from '../lib/supabase';

interface SupabaseAuthProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupabaseAuth({ open, onClose, onSuccess }: SupabaseAuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'user' | 'owner'>('user');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);

  if (!open) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isLogin) {
        // Sign in with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;

        if (data.user) {
          onSuccess();
          onClose();
        }
      } else {
        // Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/confirm`,
            data: {
              name: formData.name,
              phone: formData.phone,
              role: userType,
            }
          }
        });

        console.log('🔐 Signup response:', { 
          user: !!data.user, 
          session: !!data.session,
          userId: data.user?.id,
          emailConfirmed: data.user?.email_confirmed_at,
          redirectTo: `${window.location.origin}/confirm`
        });

        if (error) throw error;

        if (data.user) {
          // Show success message regardless of email confirmation status
          if (data.user.identities && data.user.identities.length === 0) {
            setError('This email is already registered. Please try signing in instead.');
          } else {
            setPendingUser(data.user);
            setShowVerifyEmail(true);
            // Start checking for email verification
            checkEmailVerification(data.user.id);
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const checkEmailVerification = async (userId: string) => {
    const checkInterval = setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email_confirmed_at) {
          clearInterval(checkInterval);
          await createUserProfile(user);
          setShowVerifyEmail(false);
          onSuccess();
          onClose();
        }
      } catch (err) {
        console.error('Error checking verification:', err);
      }
    }, 2000); // Check every 2 seconds

    // Clear interval after 10 minutes
    setTimeout(() => clearInterval(checkInterval), 600000);
  };

  const createUserProfile = async (user: any) => {
    try {
      const { error } = await supabase
        .from('users')
        .insert([
          {
            id: user.id,
            email: user.email,
            name: formData.name,
            phone: formData.phone,
            role: userType,
            isVerified: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        ]);

      if (error && !error.message.includes('duplicate key')) {
        throw error;
      }
    } catch (err) {
      console.error('Error creating user profile:', err);
    }
  };

  const validateStep = () => {
    if (currentStep === 1) {
      return formData.name.trim() !== '' && formData.phone.trim() !== '';
    }
    if (currentStep === 2) {
      return formData.email.trim() !== '' && formData.email.includes('@');
    }
    if (currentStep === 3) {
      return formData.password.length >= 6 && formData.password === formData.confirmPassword;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep() && currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (showVerifyEmail) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center"
        >
          <div className="mb-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-600">
              We've sent a verification link to<br />
              <span className="font-semibold text-gray-900">{formData.email}</span>
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
              <Loader className="w-4 h-4 animate-spin" />
              <span>Waiting for verification...</span>
            </div>
            
            <p className="text-xs text-gray-500">
              Click the link in your email to verify your account.<br />
              This page will automatically refresh once verified.
            </p>
            
            <div className="pt-4 border-t">
              <Button
                onClick={() => {
                  setShowVerifyEmail(false);
                  setCurrentStep(1);
                  setFormData({
                    name: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    phone: '',
                  });
                }}
                variant="outline"
                className="w-full"
              >
                Back to signup
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {isLogin ? 'Welcome back!' : `Step ${currentStep} of 3`}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Progress bar for signup */}
          {!isLogin && (
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {currentStep === 1 ? 'Personal Details' : 
                   currentStep === 2 ? 'Email Address' : 'Set Password'}
                </span>
                <span className="text-sm text-gray-500">{currentStep}/3</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Success/Error Messages */}
          {message && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {message}
            </div>
          )}
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* User Type Selection (for signup) */}
          {!isLogin && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUserType('user')}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    userType === 'user'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <User className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-sm font-medium">Player</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserType('owner')}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    userType === 'owner'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Building2 className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-sm font-medium">Turf Owner</span>
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={isLogin ? handleSubmit : (e) => e.preventDefault()} className="space-y-4">
            {/* Login Form */}
            {isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-base font-medium"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </>
            )}

            {/* Signup Form - Step by Step */}
            {!isLogin && (
              <>
                <AnimatePresence mode="wait">
                  {/* Step 1: Personal Details */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className="text-center mb-6">
                        <User className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900">Tell us about yourself</h3>
                        <p className="text-sm text-gray-600">We'll use this to personalize your experience</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Full Name *
                        </label>
                        <Input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          placeholder="Enter your full name"
                          className="text-base"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone Number (WhatsApp Preferred) *
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            placeholder="+91 98765 43210"
                            className="pl-10 text-base"
                            required
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">We'll use this for game coordination</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Email */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className="text-center mb-6">
                        <Mail className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900">Your email address</h3>
                        <p className="text-sm text-gray-600">We'll send important updates here</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address *
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            placeholder="your@email.com"
                            className="pl-10 text-base"
                            required
                          />
                        </div>
                      </div>

                      {/* User Type Selection */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Account Type *
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setUserType('user')}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              userType === 'user'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <User className="w-6 h-6 mx-auto mb-2" />
                            <span className="text-sm font-medium">Player</span>
                            <p className="text-xs text-gray-500 mt-1">Find & join games</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserType('owner')}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              userType === 'owner'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Building2 className="w-6 h-6 mx-auto mb-2" />
                            <span className="text-sm font-medium">Turf Owner</span>
                            <p className="text-xs text-gray-500 mt-1">Manage your turf</p>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Password */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className="text-center mb-6">
                        <Shield className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900">Secure your account</h3>
                        <p className="text-sm text-gray-600">Create a strong password to protect your account</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Password *
                        </label>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            placeholder="Create a secure password"
                            className="text-base"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Confirm Password *
                        </label>
                        <Input
                          type="password"
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          placeholder="Confirm your password"
                          className="text-base"
                          required
                        />
                        {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                          <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex gap-3 pt-4">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      onClick={prevStep}
                      variant="outline"
                      className="flex-1"
                    >
                      Back
                    </Button>
                  )}
                  
                  {currentStep < 3 ? (
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={!validateStep()}
                      className={`${currentStep === 1 ? 'w-full' : 'flex-1'} bg-emerald-600 hover:bg-emerald-700 text-white`}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={loading || !validateStep()}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {loading ? (
                        <div className="flex items-center">
                          <Loader className="w-4 h-4 animate-spin mr-2" />
                          Creating account...
                        </div>
                      ) : (
                        'Create Account'
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </form>

          {/* Toggle between login/signup */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setMessage('');
              }}
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
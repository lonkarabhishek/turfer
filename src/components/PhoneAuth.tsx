import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, ShieldCheck, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { phoneAuthHelpers } from '../lib/firebase';
import { authManager } from '../lib/api';
import { useToast } from '../lib/toastManager';

interface PhoneAuthProps {
  onSuccess: () => void;
  onCancel?: () => void;
  onSwitchToEmail?: () => void;
}

export function PhoneAuth({ onSuccess, onCancel, onSwitchToEmail }: PhoneAuthProps) {
  const { success, error } = useToast();
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<any>(null);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [inlineError, setInlineError] = useState(''); // Inline error message visible in modal

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Setup reCAPTCHA on mount
  useEffect(() => {
    const verifier = phoneAuthHelpers.setupRecaptcha('recaptcha-container');
    setRecaptchaVerifier(verifier);

    return () => {
      if (verifier) {
        verifier.clear();
      }
    };
  }, []);

  // OTP timer
  useEffect(() => {
    if (step === 'otp' && timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (timer === 0) {
      setCanResend(true);
    }
  }, [step, timer]);

  const handleSendOTP = async () => {
    setInlineError(''); // Clear previous errors

    if (!phoneNumber || phoneNumber.length !== 10) {
      setInlineError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await phoneAuthHelpers.sendOTP(phoneNumber, recaptchaVerifier);

      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
        setStep('otp');
        setTimer(120); // Increased to 120 seconds to reduce rate limit issues
        setCanResend(false);
        setInlineError(''); // Clear errors on success
      } else {
        // Better error handling for rate limits
        const errorMsg = result.error || 'Failed to send OTP';
        if (errorMsg.includes('too-many-requests') || errorMsg.includes('quota')) {
          setInlineError('Too many attempts. Please wait 1 hour or switch to Email & Password.');
        } else {
          setInlineError(errorMsg);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send OTP';
      // Handle Firebase rate limit errors
      if (errorMsg.includes('too-many-requests') || errorMsg.includes('quota-exceeded')) {
        setInlineError('Too many OTP requests. Please wait 1 hour or use Email & Password login.');
      } else if (errorMsg.includes('invalid-phone-number')) {
        setInlineError('Invalid phone number format. Please check and try again.');
      } else {
        setInlineError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setInlineError(''); // Clear previous errors
    const otpCode = otp.join('').trim(); // Trim any whitespace

    console.log('🔐 Verifying OTP:', { otpCode, length: otpCode.length });

    if (otpCode.length !== 6) {
      setInlineError('Please enter the complete 6-digit OTP');
      return;
    }

    // Validate that OTP contains only digits
    if (!/^\d{6}$/.test(otpCode)) {
      setInlineError('OTP must be 6 digits (0-9 only)');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Verify OTP with Firebase
      console.log('📞 Calling Firebase verifyOTP with code:', otpCode);
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);
      console.log('📞 Firebase verifyOTP result:', result);

      if (!result.success || !result.user) {
        console.error('❌ OTP verification failed:', result.error);
        // Better error messages for common Firebase OTP errors
        let errorMessage = result.error || 'Invalid OTP. Please check and try again.';
        if (errorMessage.includes('invalid-verification-code')) {
          errorMessage = 'Invalid OTP code. Please check and try again.';
        } else if (errorMessage.includes('session-expired')) {
          errorMessage = 'OTP expired. Please request a new code.';
        } else if (errorMessage.includes('too-many-requests')) {
          errorMessage = 'Too many attempts. Please wait and try again later.';
        }
        setInlineError(errorMessage);
        return;
      }

      // Step 2: Try to login (check if user exists in our database)
      const loginResult = await authManager.loginWithFirebase(result.user.idToken);

      if (loginResult.success && loginResult.data) {
        // ✅ EXISTING USER - Account found, log them in
        const { user, token } = loginResult.data;

        // Save authentication state
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));

        success('Welcome back! Logged in successfully.');

        // Trigger page refresh/redirect
        onSuccess();
      } else {
        // ⭐ NEW USER - No account found, ask for details
        console.log('New user detected, proceeding to registration');
        setStep('name');
        setInlineError(''); // Clear any errors before moving to name step
      }
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setInlineError(err.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setInlineError(''); // Clear previous errors

    if (!name.trim()) {
      setInlineError('Please enter your name');
      return;
    }

    // Validate email format if provided
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setInlineError('Please enter a valid email address');
        return;
      }
    }

    setLoading(true);
    try {
      // Get current Firebase user
      const firebaseUser = phoneAuthHelpers.getCurrentUser();
      if (!firebaseUser) {
        setInlineError('Session expired. Please restart the signup process.');
        return;
      }

      // Get Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // Create account in our database
      const signupResult = await authManager.signupWithFirebase(
        name,
        firebaseUser.phoneNumber || '',
        idToken,
        email.trim() || undefined
      );

      if (signupResult.success && signupResult.data) {
        // ✅ Account created successfully
        const { user, token } = signupResult.data;

        // Save authentication state
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));

        success('Account created successfully! Welcome to TapTurf!');

        // Trigger page refresh/redirect
        onSuccess();
      } else {
        // Handle specific error cases
        const errorMsg = signupResult.error || 'Failed to create account';
        if (errorMsg.includes('already exists')) {
          setInlineError('Account already exists. You were logged in successfully!');
          // Still try to save the session if available
          if (signupResult.data) {
            localStorage.setItem('auth_token', signupResult.data.token);
            localStorage.setItem('user', JSON.stringify(signupResult.data.user));
          }
          setTimeout(() => onSuccess(), 1500);
        } else {
          setInlineError(errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Account creation error:', err);
      setInlineError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[0];
    }

    if (!/^\d*$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOTPKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendOTP = () => {
    setOtp(['', '', '', '', '', '']);
    setTimer(60);
    setCanResend(false);
    handleSendOTP();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-gradient-to-br from-emerald-50 via-white to-blue-50 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-4 relative">
            {onCancel && (
              <button
                onClick={onCancel}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
            >
              {step === 'phone' && <Phone className="w-10 h-10 text-white" />}
              {step === 'otp' && <ShieldCheck className="w-10 h-10 text-white" />}
              {step === 'name' && <Phone className="w-10 h-10 text-white" />}
            </motion.div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {step === 'phone' && 'Enter Your Phone Number'}
              {step === 'otp' && 'Verify OTP'}
              {step === 'name' && 'Complete Your Profile'}
            </CardTitle>
            <p className="text-gray-600 text-sm mt-2">
              {step === 'phone' && 'We\'ll send you a verification code'}
              {step === 'otp' && `Code sent to +91${phoneNumber}`}
              {step === 'name' && 'Just one more step to get started'}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <AnimatePresence mode="wait">
              {/* Phone Number Step */}
              {step === 'phone' && (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-600 font-medium">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="Enter 10-digit number"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value.replace(/\D/g, ''));
                        setInlineError(''); // Clear error on input change
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                      className="w-full pl-24 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                  </div>

                  {/* Inline Error Message */}
                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleSendOTP}
                    disabled={loading || phoneNumber.length !== 10}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>

                  {onCancel && (
                    <Button
                      onClick={onCancel}
                      variant="outline"
                      className="w-full py-3 rounded-xl"
                    >
                      Cancel
                    </Button>
                  )}
                </motion.div>
              )}

              {/* OTP Verification Step */}
              {step === 'otp' && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (otpInputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          handleOTPChange(index, e.target.value);
                          setInlineError(''); // Clear error on input change
                        }}
                        onKeyDown={(e) => handleOTPKeyDown(index, e)}
                        className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                        disabled={loading}
                      />
                    ))}
                  </div>

                  <div className="text-center">
                    {!canResend ? (
                      <p className="text-gray-600 text-sm">
                        Resend code in <span className="font-bold text-emerald-600">{timer}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={handleResendOTP}
                        className="text-emerald-600 font-semibold hover:underline"
                        disabled={loading}
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  {/* Inline Error Message */}
                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleVerifyOTP}
                    disabled={loading || otp.join('').length !== 6}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify OTP'
                    )}
                  </Button>

                  <button
                    onClick={() => setStep('phone')}
                    className="w-full text-gray-600 hover:text-gray-900 text-sm font-medium"
                    disabled={loading}
                  >
                    Change phone number
                  </button>
                </motion.div>
              )}

              {/* Name & Email Input Step */}
              {step === 'name' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div>
                    <input
                      type="text"
                      placeholder="Enter your full name *"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setInlineError(''); // Clear error on input change
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreateAccount()}
                      className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setInlineError(''); // Clear error on input change
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreateAccount()}
                      className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-2 ml-1">
                      Add your email to receive booking confirmations and updates
                    </p>
                  </div>

                  {/* Inline Error Message */}
                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleCreateAccount}
                    disabled={loading || !name.trim()}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* reCAPTCHA container */}
            <div id="recaptcha-container"></div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-4 space-y-4">
          {onSwitchToEmail && (
            <div className="text-center">
              <button
                onClick={onSwitchToEmail}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 hover:border-emerald-300"
              >
                Use Email & Password Instead
              </button>
            </div>
          )}

          <p className="text-center text-gray-600 text-xs px-4">
            By continuing, you agree to TapTurf's Terms of Service and Privacy Policy
          </p>
        </div>
      </motion.div>
    </div>
  );
}

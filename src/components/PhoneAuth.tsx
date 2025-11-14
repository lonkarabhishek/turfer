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
    if (!phoneNumber || phoneNumber.length !== 10) {
      error('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await phoneAuthHelpers.sendOTP(phoneNumber, recaptchaVerifier);

      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
        setStep('otp');
        success('OTP sent successfully!');
        setTimer(120); // Increased to 120 seconds to reduce rate limit issues
        setCanResend(false);
      } else {
        // Better error handling for rate limits
        const errorMsg = result.error || 'Failed to send OTP';
        if (errorMsg.includes('too-many-requests') || errorMsg.includes('quota')) {
          error('Too many attempts. Please wait 1 hour and try again, or use email login instead.');
        } else {
          error(errorMsg);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send OTP';
      // Handle Firebase rate limit errors
      if (errorMsg.includes('too-many-requests') || errorMsg.includes('quota-exceeded')) {
        error('Too many OTP requests. Please wait 1 hour or use Email & Password login instead.');
      } else if (errorMsg.includes('invalid-phone-number')) {
        error('Invalid phone number format. Please check and try again.');
      } else {
        error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const otpCode = otp.join('');

    if (otpCode.length !== 6) {
      error('Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);

      if (result.success && result.user) {
        // Check if user exists in our system
        const loginResult = await authManager.loginWithFirebase(result.user.idToken);

        if (loginResult.success) {
          success('Login successful!');
          onSuccess();
        } else {
          // New user - ask for name
          setStep('name');
        }
      } else {
        error(result.error || 'Invalid OTP');
      }
    } catch (err: any) {
      error(err.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!name.trim()) {
      error('Please enter your name');
      return;
    }

    // Validate email format if provided
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        error('Please enter a valid email address');
        return;
      }
    }

    setLoading(true);
    try {
      const firebaseUser = phoneAuthHelpers.getCurrentUser();
      if (!firebaseUser) {
        error('Authentication error. Please try again.');
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const signupResult = await authManager.signupWithFirebase(
        name,
        firebaseUser.phoneNumber || '',
        idToken,
        email.trim() || undefined
      );

      if (signupResult.success) {
        success('Account created successfully!');
        onSuccess();
      } else {
        error(signupResult.error || 'Failed to create account');
      }
    } catch (err: any) {
      error(err.message || 'Failed to create account');
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
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                      className="w-full pl-24 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                  </div>

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
                        onChange={(e) => handleOTPChange(index, e.target.value)}
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
                      onChange={(e) => setName(e.target.value)}
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
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreateAccount()}
                      className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-2 ml-1">
                      Add your email to receive booking confirmations and updates
                    </p>
                  </div>

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

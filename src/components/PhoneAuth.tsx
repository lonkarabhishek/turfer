import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, ShieldCheck, Loader2, X, Lock, KeyRound } from 'lucide-react';
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

type AuthStep = 'phone' | 'pin' | 'otp' | 'createPin' | 'name';

export function PhoneAuth({ onSuccess, onCancel, onSwitchToEmail }: PhoneAuthProps) {
  const { success, error: showError } = useToast();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<any>(null);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [inlineError, setInlineError] = useState('');

  // PIN-specific state
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [isForgotPin, setIsForgotPin] = useState(false);
  const [pinAttemptsRemaining, setPinAttemptsRemaining] = useState<number | undefined>();
  const [lockoutUntil, setLockoutUntil] = useState<string | undefined>();

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  // Handle phone number submission - check if user exists
  const handlePhoneSubmit = async () => {
    setInlineError('');

    if (!phoneNumber || phoneNumber.length !== 10) {
      setInlineError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      // Check if phone exists and has PIN
      const checkResult = await authManager.checkPhone(phoneNumber);

      if (!checkResult.success) {
        setInlineError(checkResult.error || 'Failed to check phone number');
        return;
      }

      const { exists, hasPin } = checkResult.data!;

      if (exists && hasPin) {
        // Existing user with PIN - go to PIN step
        setIsExistingUser(true);
        setStep('pin');
      } else if (exists && !hasPin) {
        // Existing user without PIN (legacy) - send OTP to set PIN
        setIsExistingUser(true);
        setIsForgotPin(true); // Will set PIN after OTP
        await sendOTP();
      } else {
        // New user - send OTP for registration
        setIsExistingUser(false);
        await sendOTP();
      }
    } catch (err: any) {
      setInlineError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Send OTP via Firebase
  const sendOTP = async () => {
    setLoading(true);
    try {
      const result = await phoneAuthHelpers.sendOTP(phoneNumber, recaptchaVerifier);

      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
        setStep('otp');
        setTimer(120);
        setCanResend(false);
        setInlineError('');
      } else {
        const errorMsg = result.error || 'Failed to send OTP';
        if (errorMsg.includes('too-many-requests') || errorMsg.includes('quota')) {
          setInlineError('Too many attempts. Please wait 1 hour or switch to Email & Password.');
        } else {
          setInlineError(errorMsg);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send OTP';
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

  // Handle PIN verification for existing users
  const handlePinVerify = async () => {
    setInlineError('');
    const pinCode = pin.join('');

    if (pinCode.length !== 4) {
      setInlineError('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const result = await authManager.loginWithPin(phoneNumber, pinCode);

      if (result.success && result.data) {
        // Login successful
        const { user, token } = result.data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));
        success('Welcome back!');
        onSuccess();
      } else {
        // Handle errors
        if (result.lockedUntil) {
          setLockoutUntil(result.lockedUntil);
          const lockDate = new Date(result.lockedUntil);
          const now = new Date();
          const remainingMinutes = Math.ceil((lockDate.getTime() - now.getTime()) / (1000 * 60));
          setInlineError(`Account locked. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`);
        } else {
          setPinAttemptsRemaining(result.attemptsRemaining);
          if (result.attemptsRemaining !== undefined && result.attemptsRemaining > 0) {
            setInlineError(`Invalid PIN. ${result.attemptsRemaining} attempt${result.attemptsRemaining > 1 ? 's' : ''} remaining.`);
          } else {
            setInlineError(result.error || 'Invalid PIN');
          }
        }
        // Clear PIN input on error
        setPin(['', '', '', '']);
        pinInputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setInlineError(err.message || 'Failed to verify PIN');
    } finally {
      setLoading(false);
    }
  };

  // Handle "Forgot PIN" - send OTP to reset
  const handleForgotPin = async () => {
    setIsForgotPin(true);
    setInlineError('');
    await sendOTP();
  };

  // Handle OTP verification
  const handleVerifyOTP = async () => {
    setInlineError('');
    const otpCode = otp.join('').trim();

    if (otpCode.length !== 6) {
      setInlineError('Please enter the complete 6-digit OTP');
      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      setInlineError('OTP must be 6 digits (0-9 only)');
      return;
    }

    setLoading(true);
    try {
      const result = await phoneAuthHelpers.verifyOTP(confirmationResult, otpCode);

      if (!result.success || !result.user) {
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

      // OTP verified - go to PIN creation step
      setStep('createPin');
      setInlineError('');
    } catch (err: any) {
      setInlineError(err.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle PIN creation
  const handleCreatePin = async () => {
    setInlineError('');
    const pinCode = pin.join('');

    if (pinCode.length !== 4) {
      setInlineError('Please enter a 4-digit PIN');
      return;
    }

    // Validate PIN
    if (/^(\d)\1{3}$/.test(pinCode)) {
      setInlineError('PIN cannot be all same digits (e.g., 1111)');
      return;
    }

    const sequences = ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'];
    if (sequences.includes(pinCode)) {
      setInlineError('PIN cannot be a simple sequence (e.g., 1234)');
      return;
    }

    if (isExistingUser) {
      // Existing user - just set PIN and login
      setLoading(true);
      try {
        const firebaseUser = phoneAuthHelpers.getCurrentUser();
        if (!firebaseUser) {
          setInlineError('Session expired. Please restart the process.');
          return;
        }

        const idToken = await firebaseUser.getIdToken();
        const result = await authManager.setPin(idToken, pinCode);

        if (result.success && result.data) {
          const { user, token } = result.data;
          localStorage.setItem('auth_token', token);
          localStorage.setItem('user', JSON.stringify(user));
          success('PIN set successfully! Welcome back!');
          onSuccess();
        } else {
          setInlineError(result.error || 'Failed to set PIN');
        }
      } catch (err: any) {
        setInlineError(err.message || 'Failed to set PIN');
      } finally {
        setLoading(false);
      }
    } else {
      // New user - go to name step (PIN will be sent with signup)
      setStep('name');
    }
  };

  // Handle account creation for new users
  const handleCreateAccount = async () => {
    setInlineError('');

    if (!name.trim()) {
      setInlineError('Please enter your name');
      return;
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setInlineError('Please enter a valid email address');
        return;
      }
    }

    setLoading(true);
    try {
      const firebaseUser = phoneAuthHelpers.getCurrentUser();
      if (!firebaseUser) {
        setInlineError('Session expired. Please restart the signup process.');
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const pinCode = pin.join('');

      const signupResult = await authManager.signupWithFirebaseAndPin(
        name,
        firebaseUser.phoneNumber || '',
        idToken,
        pinCode,
        email.trim() || undefined
      );

      if (signupResult.success && signupResult.data) {
        const { user, token } = signupResult.data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));
        success('Account created successfully! Welcome to TapTurf!');
        onSuccess();
      } else {
        const errorMsg = signupResult.error || 'Failed to create account';
        if (errorMsg.includes('already exists')) {
          setInlineError('Account already exists. Please try logging in.');
        } else {
          setInlineError(errorMsg);
        }
      }
    } catch (err: any) {
      setInlineError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // PIN input handlers
  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 3) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  // OTP input handlers
  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

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
    sendOTP();
  };

  const getStepIcon = () => {
    switch (step) {
      case 'phone': return <Phone className="w-10 h-10 text-white" />;
      case 'pin': return <Lock className="w-10 h-10 text-white" />;
      case 'otp': return <ShieldCheck className="w-10 h-10 text-white" />;
      case 'createPin': return <KeyRound className="w-10 h-10 text-white" />;
      case 'name': return <Phone className="w-10 h-10 text-white" />;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'phone': return 'Enter Your Phone Number';
      case 'pin': return 'Enter Your PIN';
      case 'otp': return 'Verify OTP';
      case 'createPin': return 'Create Your PIN';
      case 'name': return 'Complete Your Profile';
    }
  };

  const getStepSubtitle = () => {
    switch (step) {
      case 'phone': return "We'll verify your phone number";
      case 'pin': return `Enter your 4-digit PIN for +91${phoneNumber}`;
      case 'otp': return `Code sent to +91${phoneNumber}`;
      case 'createPin': return 'Create a 4-digit PIN for quick login';
      case 'name': return 'Just one more step to get started';
    }
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
              {getStepIcon()}
            </motion.div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {getStepTitle()}
            </CardTitle>
            <p className="text-gray-600 text-sm mt-2">
              {getStepSubtitle()}
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
                        setInlineError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
                      className="w-full pl-24 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                  </div>

                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handlePhoneSubmit}
                    disabled={loading || phoneNumber.length !== 10}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Checking...
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

              {/* PIN Entry Step (Existing Users) */}
              {step === 'pin' && (
                <motion.div
                  key="pin"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex gap-3 justify-center">
                    {pin.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (pinInputRefs.current[index] = el)}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          handlePinChange(index, e.target.value);
                          setInlineError('');
                        }}
                        onKeyDown={(e) => handlePinKeyDown(index, e)}
                        className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                        disabled={loading}
                      />
                    ))}
                  </div>

                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handlePinVerify}
                    disabled={loading || pin.join('').length !== 4}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleForgotPin}
                      className="text-emerald-600 font-semibold hover:underline text-sm"
                      disabled={loading}
                    >
                      Forgot PIN?
                    </button>
                    <button
                      onClick={() => {
                        setStep('phone');
                        setPin(['', '', '', '']);
                        setInlineError('');
                      }}
                      className="text-gray-600 hover:text-gray-900 text-sm"
                      disabled={loading}
                    >
                      Change phone number
                    </button>
                  </div>
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
                          setInlineError('');
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
                    onClick={() => {
                      setStep('phone');
                      setOtp(['', '', '', '', '', '']);
                      setInlineError('');
                    }}
                    className="w-full text-gray-600 hover:text-gray-900 text-sm font-medium"
                    disabled={loading}
                  >
                    Change phone number
                  </button>
                </motion.div>
              )}

              {/* Create PIN Step */}
              {step === 'createPin' && (
                <motion.div
                  key="createPin"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex gap-3 justify-center">
                    {pin.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (pinInputRefs.current[index] = el)}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          handlePinChange(index, e.target.value);
                          setInlineError('');
                        }}
                        onKeyDown={(e) => handlePinKeyDown(index, e)}
                        className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                        disabled={loading}
                      />
                    ))}
                  </div>

                  <p className="text-center text-gray-500 text-sm">
                    This PIN will be used for quick login next time
                  </p>

                  {inlineError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-600 text-sm font-medium">⚠️</span>
                      <p className="text-red-700 text-sm flex-1">{inlineError}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleCreatePin}
                    disabled={loading || pin.join('').length !== 4}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Setting PIN...
                      </>
                    ) : isExistingUser ? (
                      'Set PIN & Login'
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {/* Name & Email Input Step (New Users) */}
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
                        setInlineError('');
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
                        setInlineError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && !loading && handleCreateAccount()}
                      className="w-full px-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none transition-colors"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-2 ml-1">
                      Add your email to receive booking confirmations and updates
                    </p>
                  </div>

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

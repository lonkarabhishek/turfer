import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Loader2, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '../lib/toastManager';

interface EmailOTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function EmailOTPModal({
  isOpen,
  onClose,
  email,
  onVerified,
  title = 'Verify Email Address',
  description = 'Enter the OTP sent to your email'
}: EmailOTPModalProps) {
  const { success, error } = useToast();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [timer, setTimer] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [inlineError, setInlineError] = useState('');

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-send OTP when modal opens
  useEffect(() => {
    if (isOpen && email) {
      handleSendOTP();
    }
  }, [isOpen, email]);

  // OTP timer
  useEffect(() => {
    if (isOpen && timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (timer === 0) {
      setCanResend(true);
    }
  }, [isOpen, timer]);

  const handleSendOTP = async () => {
    setInlineError('');
    setSending(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002/api';
      const response = await fetch(`${API_BASE_URL}/email/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTimer(300);
        setCanResend(false);
        setInlineError('');
        success('OTP sent to your email');
      } else {
        const errorMsg = result.error || 'Failed to send OTP';
        setInlineError(errorMsg);
        error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send OTP';
      setInlineError(errorMsg);
      error(errorMsg);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOTP = async () => {
    setInlineError('');
    const otpCode = otp.join('').trim();

    if (otpCode.length !== 6) {
      setInlineError('Please enter the complete 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002/api';
      const response = await fetch(`${API_BASE_URL}/email/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          otp: otpCode
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        success('Email verified successfully!');
        onVerified();
        handleClose();
      } else {
        const errorMsg = result.error || 'Invalid OTP';
        setInlineError(errorMsg);
        error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to verify OTP';
      setInlineError(errorMsg);
      error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOtp(['', '', '', '', '', '']);
    setInlineError('');
    setTimer(300);
    setCanResend(false);
    onClose();
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = pastedData.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtp(newOtp);

    const nextEmptyIndex = newOtp.findIndex(val => !val);
    if (nextEmptyIndex !== -1) {
      otpInputRefs.current[nextEmptyIndex]?.focus();
    } else {
      otpInputRefs.current[5]?.focus();
    }
  };

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <p className="text-sm text-emerald-50">{description}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Email display */}
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">
                We sent a verification code to
              </p>
              <p className="text-lg font-semibold text-gray-900">{email}</p>
            </div>

            {/* OTP Input */}
            <div className="space-y-4">
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => (otpInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(index, e.target.value)}
                    onKeyDown={e => handleKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                    disabled={loading || sending}
                  />
                ))}
              </div>

              {/* Inline error message */}
              {inlineError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-red-600 text-center bg-red-50 px-4 py-2 rounded-lg border border-red-200"
                >
                  {inlineError}
                </motion.div>
              )}

              {/* Timer and Resend */}
              <div className="text-center text-sm text-gray-600">
                {!canResend ? (
                  <p>Resend OTP in {formatTime(timer)}</p>
                ) : (
                  <button
                    onClick={handleSendOTP}
                    disabled={sending}
                    className="text-emerald-600 font-medium hover:text-emerald-700 disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Resend OTP'}
                  </button>
                )}
              </div>
            </div>

            {/* Verify Button */}
            <Button
              onClick={handleVerifyOTP}
              disabled={loading || sending || otp.join('').length !== 6}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify Email
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

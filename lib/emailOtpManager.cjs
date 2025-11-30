// Email OTP Management
// Stores OTPs in memory with expiration (5 minutes)

const otpStore = new Map();
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Generate a 6-digit OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP for an email with expiration
 */
function storeOTP(email, otp) {
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = Date.now() + OTP_EXPIRY;

  otpStore.set(normalizedEmail, {
    code: otp,
    expiresAt,
    attempts: 0
  });

  // Auto-cleanup after expiry
  setTimeout(() => {
    otpStore.delete(normalizedEmail);
  }, OTP_EXPIRY);

  console.log(`📧 OTP stored for ${normalizedEmail}, expires in 5 minutes`);
}

/**
 * Verify OTP for an email
 * Returns { success: boolean, error?: string }
 */
function verifyOTP(email, code) {
  const normalizedEmail = email.toLowerCase().trim();
  const stored = otpStore.get(normalizedEmail);

  if (!stored) {
    return {
      success: false,
      error: 'No OTP found. Please request a new one.'
    };
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      error: 'OTP expired. Please request a new one.'
    };
  }

  // Increment attempts
  stored.attempts++;

  // Max 5 attempts
  if (stored.attempts > 5) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      error: 'Too many failed attempts. Please request a new OTP.'
    };
  }

  if (stored.code !== code.trim()) {
    return {
      success: false,
      error: 'Invalid OTP. Please try again.'
    };
  }

  // Success - delete the OTP
  otpStore.delete(normalizedEmail);
  console.log(`✅ OTP verified successfully for ${normalizedEmail}`);

  return { success: true };
}

/**
 * Clean up expired OTPs (run periodically)
 */
function cleanupExpiredOTPs() {
  const now = Date.now();
  let cleaned = 0;

  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired OTPs`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOTPs, 10 * 60 * 1000);

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP
};

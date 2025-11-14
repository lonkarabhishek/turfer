import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY",
  authDomain: "tapturf.firebaseapp.com",
  projectId: "tapturf",
  storageBucket: "tapturf.firebasestorage.app",
  messagingSenderId: "22698492266",
  appId: "1:22698492266:web:3592ce331900ba64ea2513",
  measurementId: "G-6677MJVRV9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Set language to user's preferred language (defaults to device language)
auth.languageCode = 'en'; // Can be set to 'hi' for Hindi if needed

export { auth };

// Phone Auth Helper Functions
export const phoneAuthHelpers = {
  // Setup reCAPTCHA verifier with better error handling
  setupRecaptcha: (containerId: string): RecaptchaVerifier => {
    // Clean up any existing recaptcha widget
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }

    const recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      'size': 'invisible',
      'callback': () => {
        console.log('✅ reCAPTCHA verified successfully');
      },
      'expired-callback': () => {
        console.log('⚠️ reCAPTCHA expired, please try again');
      },
      'error-callback': (error: any) => {
        console.error('❌ reCAPTCHA error:', error);
      }
    });

    return recaptchaVerifier;
  },

  // Send OTP to phone number
  sendOTP: async (phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) => {
    try {
      console.log('📱 Sending OTP to:', phoneNumber);

      // Ensure phone number is in E.164 format (+91XXXXXXXXXX for India)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
      console.log('✅ OTP sent successfully');
      return { success: true, confirmationResult, error: null };
    } catch (error: any) {
      console.error('❌ Error sending OTP:', error);
      return { success: false, confirmationResult: null, error: error.message };
    }
  },

  // Verify OTP
  verifyOTP: async (confirmationResult: any, otp: string) => {
    try {
      console.log('🔐 Verifying OTP:', otp);
      const result = await confirmationResult.confirm(otp);
      const user = result.user;

      console.log('✅ OTP verified successfully');
      console.log('👤 Firebase User:', user);

      // Get Firebase ID token to send to backend
      const idToken = await user.getIdToken();

      return {
        success: true,
        user: {
          uid: user.uid,
          phoneNumber: user.phoneNumber,
          idToken
        },
        error: null
      };
    } catch (error: any) {
      console.error('❌ Error verifying OTP:', error);
      return { success: false, user: null, error: error.message };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      await auth.signOut();
      console.log('✅ Signed out successfully');
      return { success: true, error: null };
    } catch (error: any) {
      console.error('❌ Error signing out:', error);
      return { success: false, error: error.message };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChanged: (callback: (user: any) => void) => {
    return auth.onAuthStateChanged(callback);
  }
};

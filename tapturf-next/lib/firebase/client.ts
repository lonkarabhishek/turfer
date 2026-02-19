import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "tapturf.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tapturf",
  storageBucket: "tapturf.firebasestorage.app",
  messagingSenderId: "22698492266",
  appId: "1:22698492266:web:3592ce331900ba64ea2513",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
auth.languageCode = "en";

export { auth };

export const phoneAuthHelpers = {
  setupRecaptcha: (containerId: string): RecaptchaVerifier => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = "";
    }

    return new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {},
    });
  },

  sendOTP: async (phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) => {
    try {
      const formattedPhone = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+91${phoneNumber}`;
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );
      return { success: true, confirmationResult, error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send OTP";
      return { success: false, confirmationResult: null, error: message };
    }
  },

  verifyOTP: async (confirmationResult: ReturnType<typeof signInWithPhoneNumber> extends Promise<infer R> ? R : never, otp: string) => {
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      const idToken = await user.getIdToken();

      return {
        success: true,
        user: {
          uid: user.uid,
          phoneNumber: user.phoneNumber,
          idToken,
        },
        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid OTP";
      return { success: false, user: null, error: message };
    }
  },

  signOut: async () => {
    try {
      await auth.signOut();
      return { success: true, error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sign out failed";
      return { success: false, error: message };
    }
  },
};

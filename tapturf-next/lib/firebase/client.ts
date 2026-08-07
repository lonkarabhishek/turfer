// Firebase SDK is ~330 KB gzipped and was being pulled into the main
// client bundle for every visitor. This module now lazy-imports every
// firebase/* symbol on first use, so anyone who doesn't touch phone
// OTP (or ever log out) never downloads the SDK.

import type {
  Auth,
  ConfirmationResult,
  RecaptchaVerifier as RecaptchaVerifierType,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDQE1iEsJXZqqHLJw5WrtjkD5A0vwpvwxY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "tapturf.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tapturf",
  storageBucket: "tapturf.firebasestorage.app",
  messagingSenderId: "22698492266",
  appId: "1:22698492266:web:3592ce331900ba64ea2513",
};

// Cached promise so we only initialize once per tab.
let _authP: Promise<Auth> | null = null;

async function getAuthLazy(): Promise<Auth> {
  if (_authP) return _authP;
  _authP = (async () => {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const a = getAuth(app);
    a.languageCode = "en";
    return a;
  })();
  return _authP;
}

/** Await-able accessor for callers that need the Auth instance (e.g. signOut). */
export async function getFirebaseAuth(): Promise<Auth> {
  return getAuthLazy();
}

export const phoneAuthHelpers = {
  async setupRecaptcha(containerId: string): Promise<RecaptchaVerifierType> {
    const auth = await getAuthLazy();
    const { RecaptchaVerifier } = await import("firebase/auth");
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = "";
    return new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {},
    });
  },

  async sendOTP(phoneNumber: string, recaptchaVerifier: RecaptchaVerifierType) {
    try {
      const auth = await getAuthLazy();
      const { signInWithPhoneNumber } = await import("firebase/auth");
      const formattedPhone = phoneNumber.startsWith("+")
        ? phoneNumber
        : `+91${phoneNumber}`;
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );
      return { success: true as const, confirmationResult, error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send OTP";
      return { success: false as const, confirmationResult: null, error: message };
    }
  },

  async verifyOTP(confirmationResult: ConfirmationResult, otp: string) {
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      const idToken = await user.getIdToken();
      return {
        success: true as const,
        user: {
          uid: user.uid,
          phoneNumber: user.phoneNumber,
          idToken,
        },
        error: null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid OTP";
      return { success: false as const, user: null, error: message };
    }
  },

  async signOut() {
    try {
      const auth = await getAuthLazy();
      await auth.signOut();
      return { success: true, error: null };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sign out failed";
      return { success: false, error: message };
    }
  },
};

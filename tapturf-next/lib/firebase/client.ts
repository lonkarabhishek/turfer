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

/**
 * Firebase error code -> what we tell the player. Codes come from
 * FirebaseError.code ("auth/quota-exceeded" etc).
 */
export function friendlyOtpError(code: string | null | undefined, fallback: string): string {
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "That phone number doesn't look right. Check it and try again.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Wait a few minutes, or continue with Google.";
    case "auth/quota-exceeded":
      return "We've hit today's SMS limit. Please continue with Google for now.";
    case "auth/captcha-check-failed":
    case "auth/invalid-app-credential":
    case "auth/missing-app-credential":
      return "Security check failed. Refresh the page and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    case "auth/operation-not-allowed":
    case "auth/billing-not-enabled":
    case "auth/unauthorized-domain":
      return "Phone login is temporarily unavailable. Please continue with Google.";
    case "auth/invalid-verification-code":
      return "That code is incorrect. Check the SMS and try again.";
    case "auth/code-expired":
      return "That code has expired. Tap resend to get a new one.";
    default:
      return fallback;
  }
}

function errorCode(error: unknown): string | null {
  const c = (error as { code?: unknown })?.code;
  return typeof c === "string" ? c : null;
}

/**
 * Record a send attempt (outcome + Firebase code only; last 2 digits
 * of the number, never the full number) so "OTP not coming" reports
 * can be diagnosed from the otp_send_log table. Fire-and-forget.
 */
function logOtpSend(ok: boolean, code: string | null, phone: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    void fetch(`${url}/rest/v1/rpc/log_otp_send`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_ok: ok,
        p_error_code: code,
        p_phone_tail: phone.replace(/\D/g, "").slice(-2),
        p_host: window.location.host,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export const phoneAuthHelpers = {
  async setupRecaptcha(
    containerId: string,
    previous?: RecaptchaVerifierType | null,
  ): Promise<RecaptchaVerifierType> {
    const auth = await getAuthLazy();
    const { RecaptchaVerifier } = await import("firebase/auth");
    // A reCAPTCHA token is single-use. Tear down the old verifier
    // before making a new one, otherwise a retry / resend fails with
    // "reCAPTCHA has already been rendered in this element".
    try {
      previous?.clear();
    } catch {
      /* already cleared */
    }
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
      logOtpSend(true, null, phoneNumber);
      return { success: true as const, confirmationResult, error: null, code: null };
    } catch (error: unknown) {
      const code = errorCode(error);
      logOtpSend(false, code ?? (error instanceof Error ? error.message.slice(0, 80) : "unknown"), phoneNumber);
      return {
        success: false as const,
        confirmationResult: null,
        error: friendlyOtpError(code, "Couldn't send the OTP. Please try again, or continue with Google."),
        code,
      };
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
      return {
        success: false as const,
        user: null,
        error: friendlyOtpError(errorCode(error), "That code didn't work. Please try again."),
      };
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

"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/user";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { saveSignupContext } from "@/lib/analytics/visitor";
import type { AccountProfile } from "@/lib/account/types";
import { cancelGoogleLink, errorOf, firebaseToken, getMe, postMe, profileOf, setSignInToken, supabaseToken, type TokenCheck } from "@/lib/account/client";
import { loginErrorText } from "@/lib/auth/callback";
import { clearAllDrafts } from "@/lib/reviews/draft";
import { forgetToolDevice } from "@/lib/analytics/tools";

/** What a write says when the server couldn't confirm a Google sign-in's account (confirmedUser gave null). */
export const ACCOUNT_NOT_CONFIRMED = "Couldn't load your TapTurf account. Check your connection and try again.";

/** How this device is signed in: the phone (Firebase OTP) or Google (a Supabase session). */
export type SignedInWith = "phone" | "google";
/** Why a Google sign-in opens no account right now (the same answers /login explains). */
export type AccountProblem = "linking" | "replaced";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  /**
   * The first real answer is in: a phone login read from storage, or
   * Supabase's first session check handled (a Google user resolved, or no
   * session). Unlike loading, never set by the 3 s fallback, so a page
   * that would mislead a logged-in user by showing its logged-out view
   * (the live score's login card) can wait for it.
   */
  settled: boolean;
  /** The user came from the server in this tab (not only from this device's storage). */
  profileFresh: boolean;
  /** How this device is signed in; null when it is not. The account can be the same either way. */
  signedInWith: SignedInWith | null;
  /**
   * A Google sign-in that opens no TapTurf account: being added to a phone
   * account on another device (linking), or taken off one (replaced). Its
   * session was ended here; /login/complete sends the person to /login.
   */
  accountProblem: AccountProblem | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /**
   * Synchronously pull the phone-auth user out of localStorage and
   * publish them into the context. Use this right after a PhoneOTP
   * success writes to localStorage — cheaper and faster than
   * refreshUser() (no DB round-trip). fresh: what was written came from
   * the server just now.
   */
  hydrateFromStorage: (fresh?: boolean) => AppUser | null;
  /**
   * The token the account routes need, for this sign-in. A phone sign-in
   * whose Firebase session is gone is signed out here (it cannot do
   * anything that needs one), with a notice.
   */
  getToken: () => Promise<TokenCheck>;
  /** Publish a profile the server just sent (after an edit). */
  applyProfile: (p: AccountProfile) => void;
  /**
   * The account a write (a game, a join request, a review) is for. A phone
   * sign-in's account at once; a Google sign-in's only once the server has
   * sent it in this tab: the profile this device kept for it can be stale
   * (the Google account was added to a phone account, or taken off one,
   * on another device). Asks the server again and waits up to 12 s; null
   * when it can't say, and the caller says so instead of writing.
   */
  confirmedUser: () => Promise<AppUser | null>;
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
  welcomeMessage: string | null;
  dismissWelcome: () => void;
  /** A longer message about the sign-in itself ("your phone login ended"). */
  notice: string | null;
  dismissNotice: () => void;
  showNotice: (text: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  settled: false,
  profileFresh: false,
  signedInWith: null,
  accountProblem: null,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
  hydrateFromStorage: () => null,
  getToken: async () => ({ none: true }),
  applyProfile: () => {},
  confirmedUser: async () => null,
  showLoginModal: false,
  setShowLoginModal: () => {},
  welcomeMessage: null,
  dismissWelcome: () => {},
  notice: null,
  dismissNotice: () => {},
  showNotice: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Two auth paths, tracked so we can handle each independently.
type AuthSource = "phone" | "oauth" | null;

/** When this device last checked its phone sign-in with the server. */
const PROFILE_CHECKED_KEY = "tapturf_profile_checked_v1";
/** When this device first found no Firebase session behind its phone sign-in. */
const FB_MISSING_KEY = "tapturf_fb_missing_v1";
/** The last profile the server sent for this device's Google sign-in: { uid, user }. */
const GOOGLE_PROFILE_KEY = "tapturf_google_profile_v1";

const DAY_MS = 86_400_000;
/** A missing Firebase session must be seen twice, this far apart, before a background sign-out. */
const FB_MISSING_GRACE_MS = 10 * 60_000;

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A server profile as the app's user. */
function userFromProfile(p: AccountProfile): AppUser {
  return {
    id: p.id,
    name: p.name || "User",
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    role: (p.role || "user") as AppUser["role"],
    profile_image_url: p.profile_image_url ?? undefined,
    username: p.username ?? undefined,
    taggable: p.taggable,
    contactEmail: p.contact_email ?? undefined,
    googleEmail: p.google_email ?? undefined,
    // Only a database that has the account links sends these true.
    googleLinkable: p.google_linkable === true,
    phoneConfirmed: p.phone_confirmed === true,
    phoneSettable: p.phone_settable === true,
    askGoogle: p.ask_google === true,
    // The verified tick, and its halves only when the database knows the tick.
    verified: p.verified,
    phoneProven: p.verified === null ? undefined : p.phone_proven,
    emailProven: p.verified === null ? undefined : p.email_proven,
  };
}

/** The name Google gave a sign-in, for a notice only: the account itself always comes from the server. */
function googleName(supaUser: { email?: string; user_metadata?: Record<string, unknown> }): string {
  return (supaUser.user_metadata?.name || supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0] || "User") as string;
}

const firstName = (name: string | undefined) => name?.split(" ")[0] || "";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** How long a write waits for the server to confirm a Google sign-in's account. */
const CONFIRM_WAIT_MS = 12_000;
/** How long a Google sign-in with no profile on this device waits for the server before the page goes on. */
const GOOGLE_FIRST_WAIT_MS = 8_000;

/** The Google user this device last had from the server, if it is this sign-in's. */
function readGoogleUser(uid: string): AppUser | null {
  try {
    const p = JSON.parse(read(GOOGLE_PROFILE_KEY) ?? "null");
    return p?.uid === uid && p.user?.id ? (p.user as AppUser) : null;
  } catch {
    return null;
  }
}

/**
 * Read the phone-auth user out of localStorage synchronously so it's
 * available on the very first render (no auth flash on hydration).
 * Silent-fails on corrupt JSON — we return null instead of nuking the
 * keys so a transient parse hiccup can't log the user out.
 */
function readPhoneUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("auth_token");
    const raw = localStorage.getItem("user");
    if (!token || !raw) return null;
    const p = JSON.parse(raw);
    if (!p?.id) return null;
    return {
      id: p.id,
      name: p.name || "User",
      email: p.email,
      phone: p.phone,
      role: (p.role || "user") as AppUser["role"],
      profile_image_url: p.profile_image_url,
      username: typeof p.username === "string" ? p.username : undefined,
      taggable: typeof p.taggable === "boolean" ? p.taggable : undefined,
      // As storePhoneUser writes them (userFromProfile's names).
      contactEmail: typeof p.contactEmail === "string" ? p.contactEmail : undefined,
      googleEmail: typeof p.googleEmail === "string" ? p.googleEmail : undefined,
      googleLinkable: p.googleLinkable === true,
      phoneConfirmed: p.phoneConfirmed === true,
      phoneSettable: p.phoneSettable === true,
      askGoogle: p.askGoogle === true,
      verified: typeof p.verified === "boolean" ? p.verified : null,
      phoneProven: typeof p.phoneProven === "boolean" ? p.phoneProven : undefined,
      emailProven: typeof p.emailProven === "boolean" ? p.emailProven : undefined,
    };
  } catch {
    return null;
  }
}

/** Save a phone sign-in's server profile on this device. */
export function storePhoneUser(p: AccountProfile, token?: string) {
  if (token) store("auth_token", token);
  store("user", JSON.stringify(userFromProfile(p)));
}

// Mirror the current phone-auth user id to a browser cookie the server
// can read. Phone auth lives entirely in localStorage (no Supabase auth
// session). It is only a hint: anyone can set it, so never use it to
// grant access (/admin verifies a Firebase ID token instead).
//
// - `tt_uid=<uuid>` with 30-day max-age, path=/, SameSite=Lax.
// - Not HttpOnly on purpose (we set/clear it from JS).
// - Only ever carries the users.id UUID, never a secret.
function writeUidCookie(uid: string | null) {
  if (typeof document === "undefined") return;
  try {
    if (uid) {
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `tt_uid=${encodeURIComponent(uid)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
    } else {
      document.cookie = "tt_uid=; path=/; max-age=0; SameSite=Lax";
    }
  } catch {
    /* cookie writes can fail in odd contexts (Safari private) — ignore */
  }
}

/** The Firebase token AdminGate hands the server (lib/admin/auth.ts ADMIN_TOKEN_COOKIE). Goes with the phone sign-in. */
function clearFidCookie() {
  try {
    document.cookie = "tt_fid=; path=/; max-age=0; SameSite=Lax";
  } catch {
    /* ignore */
  }
}

/**
 * Pages where a background check never runs and a missing Firebase
 * session never signs out: live scoring and following must not be
 * interrupted, and /account/link says itself when the phone login ended.
 */
function quietPath(): boolean {
  const p = window.location.pathname;
  return p.startsWith("/live") || p.startsWith("/tools") || p === "/account/link" || p.startsWith("/account/link/");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from localStorage synchronously.
  const initial = typeof window !== "undefined" ? readPhoneUser() : null;
  const [user, setUser] = useState<AppUser | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [settled, setSettled] = useState(initial !== null);
  const [profileFresh, setFreshState] = useState(false);
  // The same, for code that runs outside a render (confirmedUser).
  const freshRef = useRef(false);
  const setProfileFresh = useCallback((v: boolean) => {
    freshRef.current = v;
    setFreshState(v);
  }, []);
  const userRef = useRef<AppUser | null>(initial);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  /** One more server read for this device's Google sign-in (set by resolveSupabaseUser). */
  const googleRecheckRef = useRef<(() => Promise<void>) | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedInWith, setSignedInWith] = useState<SignedInWith | null>(initial ? "phone" : null);
  const [accountProblem, setAccountProblem] = useState<AccountProblem | null>(null);

  const supabaseRef = useRef(createClient());
  const sourceRef = useRef<AuthSource>(initial ? "phone" : null);
  /** The one place the sign-in source changes, so the context's signedInWith always agrees with it. */
  const setSource = useCallback((src: AuthSource) => {
    sourceRef.current = src;
    setSignedInWith(src === "oauth" ? "google" : src);
  }, []);
  /** The Google sign-in's own id (a legacy account's users.id can differ). */
  const authUidRef = useRef<string | null>(null);
  // Bumped by every profile applied after an edit: a read that started before it is stale.
  const writeSeq = useRef(0);
  const supabase = supabaseRef.current;

  const dismissWelcome = useCallback(() => setWelcomeMessage(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const showWelcome = useCallback((name: string) => {
    setWelcomeMessage(`Welcome${name ? `, ${name}` : ""}!`);
    setTimeout(() => setWelcomeMessage(null), 3500);
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 9000);
  }, []);

  // ── Server profile ──

  const applyProfile = useCallback((p: AccountProfile) => {
    writeSeq.current++;
    const next = userFromProfile(p);
    if (sourceRef.current === "phone") {
      storePhoneUser(p);
    } else if (sourceRef.current === "oauth") {
      // Keyed by the Google sign-in's id, which a legacy account's id can differ from.
      try {
        const prev = JSON.parse(read(GOOGLE_PROFILE_KEY) ?? "null");
        if (prev?.uid) store(GOOGLE_PROFILE_KEY, JSON.stringify({ uid: prev.uid, user: next }));
      } catch {
        /* ignore */
      }
    }
    userRef.current = next;
    setUser(next);
    setProfileFresh(true);
  }, [setProfileFresh]);

  /** Back to the phone sign-in kept on this device, if there is one. */
  const rehydratePhone = useCallback((): boolean => {
    const p = readPhoneUser();
    if (!p) return false;
    setUser(p);
    setSource("phone");
    setLoading(false);
    setSettled(true);
    return true;
  }, [setSource]);

  /**
   * This Google sign-in opens no account right now (linking, replaced): end
   * its session on this device, never touching a phone sign-in kept here,
   * and say why. /login/complete sends the person on to /login, which says
   * it there.
   */
  const refuseGoogle = useCallback(async (why: AccountProblem) => {
    setSource(null);
    authUidRef.current = null;
    store(GOOGLE_PROFILE_KEY, null);
    setUser(null);
    setProfileFresh(false);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore: the session is unusable for accounts anyway */
    }
    rehydratePhone();
    setAccountProblem(why);
    if (window.location.pathname !== "/login/complete" && window.location.pathname !== "/login") {
      const text = loginErrorText("account", why);
      if (text) showNotice(text);
    }
  }, [supabase, setSource, setProfileFresh, rehydratePhone, showNotice]);

  /**
   * Google: the account from the server, made if there is none. A user is
   * published at once only from this device's last server copy for this
   * sign-in; without one, nothing is shown until the server answers (at
   * most 8 s here, then the page goes on and the answer lands when it
   * comes), so no page ever acts on a Google sign-in that has no account.
   * Never throws; a failed call keeps any user already shown.
   */
  const resolveSupabaseUser = useCallback(async (
    supaUser: { id: string; email?: string; user_metadata?: Record<string, unknown> },
    shouldWelcome: boolean,
    accessToken: string | null,
  ) => {
    const cached = readGoogleUser(supaUser.id);
    setSource("oauth");
    authUidRef.current = supaUser.id;
    // Not confirmed in this tab until the server answers (confirmedUser waits for it).
    setProfileFresh(false);
    if (cached) {
      userRef.current = cached;
      setUser(cached);
      if (shouldWelcome) showWelcome(firstName(cached.name));
    }
    const mine = () => sourceRef.current === "oauth" && authUidRef.current === supaUser.id;
    let published = !!cached;

    /** One POST: ok, a refusal handled, try again later, or stop (401: Supabase's own events handle it). */
    const attempt = async (token: string | null): Promise<"ok" | "refused" | "retry" | "stop"> => {
      if (!token || !mine()) return "stop";
      const a = await postMe(token);
      if (!mine()) return "stop";
      const p = profileOf(a);
      if (p) {
        const next = userFromProfile(p);
        store(GOOGLE_PROFILE_KEY, JSON.stringify({ uid: supaUser.id, user: next }));
        // What this device kept was another account (this Google account was added to a phone
        // account on another device, say): say which one it opens now.
        if (cached && cached.id !== next.id) {
          showNotice(`This Google login now opens your TapTurf account${next.name ? `, ${next.name}` : ""}.`);
        }
        userRef.current = next;
        setUser(next);
        setProfileFresh(true);
        setAccountProblem(null);
        if (!published && shouldWelcome) showWelcome(firstName(next.name));
        published = true;
        // A new account: save how they found us, in the background. The sign-in callback makes a
        // Google account a moment before this call, so the server says fresh for a row made in the
        // last 15 minutes (its clock, not the phone's).
        const b = a.body as { created?: boolean; fresh?: boolean };
        if (b.created || b.fresh) saveSignupContext(p.id, "google");
        return "ok";
      }
      const e = errorOf(a);
      if (e === "linking" || e === "replaced") {
        await refuseGoogle(e);
        return "refused";
      }
      return a.status === 401 ? "stop" : "retry";
    };

    const stillLoading = "Couldn't load your TapTurf account. Check your connection; we'll keep trying.";
    const run = async () => {
      let r = await attempt(accessToken);
      for (let tries = 2; r === "retry" && tries > 0; tries--) {
        if (!published && mine()) showNotice(stillLoading);
        await sleep(15_000);
        if (!mine()) return;
        const again = await supabaseToken();
        r = await attempt("token" in again ? again.token : null);
      }
    };
    const running = run();
    googleRecheckRef.current = async () => {
      if (!mine()) return;
      const t = await supabaseToken();
      await attempt("token" in t ? t.token : null);
    };
    if (published) return;
    await Promise.race([running, sleep(GOOGLE_FIRST_WAIT_MS)]);
    if (!published && mine()) showNotice(stillLoading);
  }, [showWelcome, showNotice, setSource, setProfileFresh, refuseGoogle]);

  /**
   * End this device's phone sign-in: its Firebase session is gone, or the
   * server has no account for its number. Never touches the Google
   * session; if there is one, the user carries on with it.
   */
  const forcePhoneSignOut = useCallback(async (message: string) => {
    for (const k of ["auth_token", "user", FB_MISSING_KEY, PROFILE_CHECKED_KEY]) store(k, null);
    writeUidCookie(null);
    clearFidCookie();
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      await (await getFirebaseAuth()).signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
    setProfileFresh(false);
    setSource(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const name = readGoogleUser(data.session.user.id)?.name ?? googleName(data.session.user);
        await resolveSupabaseUser(data.session.user, false, data.session.access_token);
        showNotice(`Your phone login ended. You are signed in with Google as ${name}.`);
        return;
      }
    } catch {
      /* ignore */
    }
    showNotice(message);
  }, [supabase, resolveSupabaseUser, showNotice, setSource, setProfileFresh]);

  const getToken = useCallback(async (): Promise<TokenCheck> => {
    if (sourceRef.current === "oauth") return supabaseToken();
    if (sourceRef.current !== "phone") return { none: true };
    const t = await firebaseToken();
    if ("none" in t) {
      // Never mid-match: on live and tools pages it only counts as a sighting; the caller shows its own error.
      if (quietPath()) {
        if (!read(FB_MISSING_KEY)) store(FB_MISSING_KEY, String(Date.now()));
      } else await forcePhoneSignOut("Your login ended. Please log in again with your phone number.");
    } else if ("token" in t) store(FB_MISSING_KEY, null);
    return t;
  }, [forcePhoneSignOut]);

  // The free tools send the sign-in with each use they log (lib/analytics/tools.ts). Read quietly:
  // a missing Firebase session there only makes the use a guest's, never a sign-out.
  // undefined until the first answer is in (a Google session still being read): a use then waits
  // for it rather than going out as a guest's with this browser's tag.
  const toolSignIn = user ? signedInWith : settled ? null : undefined;
  const hadToolSignIn = useRef(false);
  useEffect(() => {
    // Signed in, or just signed out: the tools' random guest tag starts over, so no tag spans an account's session.
    if (toolSignIn || hadToolSignIn.current) forgetToolDevice();
    hadToolSignIn.current = !!toolSignIn;
    if (!toolSignIn) {
      setSignInToken(toolSignIn === undefined ? undefined : null);
      return;
    }
    setSignInToken(() => (sourceRef.current === "oauth" ? supabaseToken() : sourceRef.current === "phone" ? firebaseToken() : Promise.resolve<TokenCheck>({ none: true })));
    return () => setSignInToken(null);
  }, [toolSignIn]);

  /**
   * Phone: check this device's sign-in with the server, at most once a
   * day. A missing Firebase session signs out only when seen twice, ten
   * minutes apart; offline, slow or failing checks change nothing.
   */
  const checkPhoneSignIn = useCallback(async () => {
    const local = readPhoneUser();
    if (!local || sourceRef.current !== "phone") return;
    if (Date.now() - Number(read(PROFILE_CHECKED_KEY) || 0) < DAY_MS) return;
    const t = await firebaseToken();
    if (sourceRef.current !== "phone" || "unknown" in t) return;
    if ("none" in t) {
      const first = Number(read(FB_MISSING_KEY) || 0);
      if (!first) store(FB_MISSING_KEY, String(Date.now()));
      else if (Date.now() - first >= FB_MISSING_GRACE_MS && !quietPath()) await forcePhoneSignOut("Your login ended. Please log in again with your phone number.");
      return;
    }
    store(FB_MISSING_KEY, null);
    const seq = writeSeq.current;
    const a = await getMe(t.token);
    if (sourceRef.current !== "phone") return;
    const p = profileOf(a);
    // An edit saved while this read was out: its answer is newer.
    if (p && writeSeq.current !== seq) return;
    if (p) {
      store(PROFILE_CHECKED_KEY, String(Date.now()));
      storePhoneUser(p, t.token);
      setUser(userFromProfile(p));
      setProfileFresh(true);
      if (p.id !== local.id) showNotice(`You are signed in to the account for your phone number, ${p.name}.`);
      return;
    }
    const e = errorOf(a);
    // The page may have changed while the check ran: never sign out on live or tools pages; a later visit tries again.
    if (e === "new" && !quietPath()) {
      // The account this number opened changed its number (it logs in with Google).
      if ((a.body as { wasUsed?: boolean }).wasUsed === true) {
        await forcePhoneSignOut("This number no longer opens your TapTurf account. Log in with Google.");
        return;
      }
      const tail = (local.phone ?? "").slice(-2);
      await forcePhoneSignOut(
        `This phone number has no TapTurf account. Log in with the number on your profile${/^\d{2}$/.test(tail) ? `, ending in ${tail}` : ""}.`,
      );
    } else if (e === "conflict") {
      store(PROFILE_CHECKED_KEY, String(Date.now()));
    }
    // sign_in, unavailable: try again on a later visit. Never sign out from a server error.
  }, [forcePhoneSignOut, showNotice, setProfileFresh]);

  // ── Init auth on mount ──

  useEffect(() => {
    let cancelled = false;
    const emergencyTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    // ── 1. Phone auth: instant from localStorage ──
    let idle: number | null = null;
    if (initial) {
      setSource("phone");
      setLoading(false);
      clearTimeout(emergencyTimeout);
      // Check with the server in the background, when the page is idle,
      // never on live scoring pages or on a data-saving connection.
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      if (!quietPath() && !conn?.saveData && navigator.onLine !== false) {
        const run = () => {
          if (!cancelled) void checkPhoneSignIn();
        };
        idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 2000) as unknown as number;
      }
    }

    // ── 2. Google OAuth signal ──
    // Two ways to know a callback just happened:
    //   (a) legacy ?welcome=1 (kept for backwards compat)
    //   (b) landing on /login/complete (the new post-OAuth handoff)
    // We DON'T clear phone-auth localStorage on the mere presence of
    // this signal — that would blow away a phone session for anyone
    // who navigates to /login/complete directly. Instead we only clear
    // it once INITIAL_SESSION confirms an actual Supabase session is
    // present (see below).
    const url = new URL(window.location.href);
    const shouldWelcomeFromCallback =
      url.searchParams.get("welcome") === "1" ||
      url.pathname === "/login/complete";
    if (shouldWelcomeFromCallback && url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }

    // Rely on onAuthStateChange for session pickup — it fires INITIAL_SESSION
    // exactly once when the subscription attaches, with the current session
    // (or null) already resolved. Don't ALSO call getSession() here: it
    // acquires the same `lock:sb-…-auth-token` navigator lock the internal
    // auto-refresh uses, and racing them causes 10-second lock timeouts
    // that surface as "Google sign-in isn't smooth."

    // IMPORTANT: supabase-js runs onAuthStateChange callbacks while it
    // still holds its auth lock (e.g. the SIGNED_IN it emits when a tab
    // comes back to the foreground). Any Supabase query awaited inside
    // the callback needs that same lock to attach the access token, so
    // it waits forever and every later request in the tab hangs too
    // (seen as "Send" spinning on iOS after switching apps). So the
    // callback only schedules the work; it runs after the lock is free.
    const handleAuthEvent = async (event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;
      const token = session?.access_token ?? null;

      if (event === "INITIAL_SESSION") {
        if (session?.user) {
          // If we came from the OAuth callback OR there's no phone user,
          // resolve Supabase. Otherwise phone wins (user hasn't asked for
          // Google — they're just carrying a stale cookie).
          const shouldResolve = shouldWelcomeFromCallback || sourceRef.current !== "phone";
          if (shouldResolve) {
            // Now that we KNOW there's a fresh Supabase session (not
            // just a URL hint), it's safe to blow away any stale
            // phone-auth localStorage so it can't out-vote the OAuth
            // user.
            if (shouldWelcomeFromCallback) {
              store("auth_token", null);
              store("user", null);
              setSource(null);
            }
            // The session is known: this resolve settles the page itself (waiting for the server
            // when this device has no profile for it), so the 3 s fallback must not cut in.
            clearTimeout(emergencyTimeout);
            await resolveSupabaseUser(session.user, shouldWelcomeFromCallback, token);
          }
        }
        clearTimeout(emergencyTimeout);
        setLoading(false);
        setSettled(true);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // A phone sign-in on this device wins, as at INITIAL_SESSION: supabase-js re-emits SIGNED_IN
        // from storage whenever the tab comes back, and that must not switch the account. Only the
        // page a Google sign-in returns to takes it.
        if (sourceRef.current === "phone" && window.location.pathname !== "/login/complete") return;
        const isNewSignIn = sourceRef.current === null;
        // The same sign-in again (a tab back in the foreground): nothing to fetch.
        if (sourceRef.current === "oauth" && authUidRef.current === session.user.id) {
          setShowLoginModal(false);
          return;
        }
        await resolveSupabaseUser(session.user, isNewSignIn, token);
        setShowLoginModal(false);
        setLoading(false);
        setSettled(true);
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        // A silent refresh changes nothing for a signed-in user. With nobody signed in it is a session that
        // came back late (the first check failed on a bad network): sign them in now, not on the next tab switch.
        if (session?.user && sourceRef.current === null) {
          await resolveSupabaseUser(session.user, false, token);
          setLoading(false);
          setSettled(true);
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        // Only care about SIGNED_OUT if we were actually oauth. Phone
        // users never had a Supabase session, so a spurious SIGNED_OUT
        // (e.g. token-reuse detection wiping the wrong thing) must NOT
        // log them out.
        if (sourceRef.current !== "oauth") return;

        // OAuth session gone. Before nuking user state, see if there's
        // still a phone token sitting in localStorage we can fall back
        // to — otherwise sign the user out.
        setProfileFresh(false);
        authUidRef.current = null;
        if (rehydratePhone()) return;
        setUser(null);
        setSource(null);
        setLoading(false);
        setSettled(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        void handleAuthEvent(event, session);
      }, 0);
    });

    // ── 3. Robustness listeners ──
    // Storage: another tab logged in/out, sync our state.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "user" && e.key !== "auth_token") return;
      const p = readPhoneUser();
      if (p) {
        setUser(p);
        setSource("phone");
      } else if (sourceRef.current === "phone") {
        // Phone auth cleared in another tab. Only wipe user if we were
        // phone — an oauth session might still be valid.
        setUser(null);
        setProfileFresh(false);
        setSource(null);
      }
    };

    // Visibility: app came back into focus. Re-check localStorage in
    // case iOS ITP or memory-pressure evicted it while we were away —
    // if it's still there we keep the current user; if it was evicted
    // AND we thought we were phone-auth, verify before wiping.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const p = readPhoneUser();
      if (p) {
        if (sourceRef.current !== "phone" || user?.id !== p.id) {
          setUser(p);
          setSource("phone");
        }
      }
      // If phone user is missing but we thought we had one, don't
      // panic — the PWALifecycle full-reload will handle a stale
      // state cleanly. Doing nothing here avoids race-y wipe loops.
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(emergencyTimeout);
      if (idle !== null) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
        else clearTimeout(idle);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the server-readable `tt_uid` cookie in sync with the current
  // user id.
  useEffect(() => {
    writeUidCookie(user?.id ?? null);
  }, [user?.id]);

  // ── Actions ──

  // Route to the dedicated /login page instead of opening the old modal.
  // The modal juggled mount/unmount + route changes badly; a real page
  // is bookmarkable, survives back/forward, and settles OAuth cleanly.
  // We keep `next` set to the current path so /login knows where to
  // return the user after a successful sign-in.
  const login = useCallback(() => {
    if (typeof window === "undefined") return;
    const current = window.location.pathname + window.location.search;
    if (window.location.pathname === "/login") return; // already there
    const next = encodeURIComponent(current || "/");
    window.location.href = `/login?next=${next}`;
  }, []);

  const logout = useCallback(async () => {
    // Intentional logout, clear BOTH sources, and any Google account being added (its cookie).
    void cancelGoogleLink();
    for (const k of ["auth_token", "user", GOOGLE_PROFILE_KEY, FB_MISSING_KEY, PROFILE_CHECKED_KEY]) store(k, null);
    // Report drafts on this phone go too: whoever signs in next never picks one up (lib/reviews/draft.ts).
    clearAllDrafts();
    writeUidCookie(null);
    clearFidCookie();
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const auth = await getFirebaseAuth();
      await auth.signOut();
    } catch { /* ignore */ }
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    setProfileFresh(false);
    setSource(null);
    authUidRef.current = null;
    setAccountProblem(null);
  }, [supabase, setSource, setProfileFresh]);

  const confirmedUser = useCallback(async (): Promise<AppUser | null> => {
    if (sourceRef.current === "oauth" && !freshRef.current) void googleRecheckRef.current?.();
    const deadline = Date.now() + CONFIRM_WAIT_MS;
    for (;;) {
      // A phone sign-in's account comes from the server at sign-in and keeps its id.
      if (sourceRef.current !== "oauth") return userRef.current;
      if (freshRef.current && userRef.current) return userRef.current;
      if (Date.now() >= deadline) return null;
      await sleep(200);
    }
  }, []);

  // Fast, synchronous path: read localStorage and push into context.
  // Called right after PhoneOTP writes the user so the modal/page can
  // navigate away without waiting on a redundant DB round-trip.
  const hydrateFromStorage = useCallback((fresh = false): AppUser | null => {
    const p = readPhoneUser();
    if (p) {
      setUser(p);
      setSource("phone");
      setLoading(false);
      setSettled(true);
      setAccountProblem(null);
      if (fresh) {
        setProfileFresh(true);
        store(PROFILE_CHECKED_KEY, String(Date.now()));
        store(FB_MISSING_KEY, null);
      }
      showWelcome(firstName(p.name));
      return p;
    }
    return null;
  }, [showWelcome, setSource, setProfileFresh]);

  /** The account from the server again, for this sign-in. */
  const refreshUser = useCallback(async () => {
    const seq = writeSeq.current;
    const t = await getToken();
    if (!("token" in t)) return;
    const p = profileOf(await getMe(t.token));
    // An edit saved while this read was out (a slow phone token, say): keep the edit.
    if (p && writeSeq.current === seq) applyProfile(p);
  }, [getToken, applyProfile]);

  return (
    <AuthContext.Provider value={{
      user, loading, settled, profileFresh, signedInWith, accountProblem, login, logout, refreshUser, hydrateFromStorage,
      getToken, applyProfile, confirmedUser,
      showLoginModal, setShowLoginModal,
      welcomeMessage, dismissWelcome,
      notice, dismissNotice, showNotice,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { quietToken } from "@/lib/account/client";
import {
  currentSubscription,
  endStopped,
  notificationPermission,
  pushStatus,
  pushSupport,
  sendPushTest,
  turnPushOff,
  turnPushOn,
} from "@/lib/push/client";

/**
 * "Notifications on this phone", shared by the Me tab's switch
 * (PushSwitch) and the nudge above its sections (NotificationsPrompt), so
 * both always say the same. One check per account per page (and again
 * when the page comes back, at most every 30 s: permission may have
 * changed in Settings).
 *
 * view: loading; none (no Web Push in this browser: nothing is shown);
 * soon (the server can't send yet); ios-install (an iPhone in Safari: add
 * to the Home Screen first); ios-update (iOS older than 16.4); blocked
 * (notifications refused in the phone's settings); off; on.
 */
export type PushView = "loading" | "none" | "soon" | "ios-install" | "ios-update" | "blocked" | "off" | "on";
export type PushNote = { tone: "ok" | "bad"; text: string };
type State = { userId: string | null; view: PushView; devices: number; busy: null | "on" | "off" | "test"; note: PushNote | null };

const START: State = { userId: null, view: "loading", devices: 0, busy: null, note: null };
let state: State = START;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;
const serverSnapshot = () => START;

type GetToken = Parameters<typeof turnPushOn>[0];
let loading: { userId: string; at: number; p: Promise<void> } | null = null;

async function check(userId: string, getToken: GetToken): Promise<void> {
  const support = pushSupport();
  if (support === "none") return set({ userId, view: "none" });
  const sub = support === "push" ? await currentSubscription() : null;
  const st = await pushStatus(getToken, sub?.endpoint ?? null);
  if (state.userId !== userId && state.userId !== null) return;
  if (!st) return set({ userId, view: state.view === "loading" ? "none" : state.view });
  if (!st.ready) return set({ userId, view: "soon", devices: 0 });
  if (support !== "push") return set({ userId, view: support, devices: st.devices });
  const permission = notificationPermission();
  if (permission === "denied") return set({ userId, view: "blocked", devices: st.devices });
  // One the server stopped (the push service ended it, say): ended here too, so turning on makes a new one.
  if (sub && !st.on && st.gone) await endStopped(sub);
  set({ userId, view: sub && st.on && permission === "granted" ? "on" : "off", devices: st.devices });
}

function load(userId: string, getToken: GetToken, again = false): Promise<void> {
  if (loading && loading.userId === userId && (!again || Date.now() - loading.at < 30_000)) return loading.p;
  if (state.userId !== userId) state = { ...START, userId };
  const p = check(userId, getToken).catch(() => set({ view: state.view === "loading" ? "none" : state.view }));
  loading = { userId, at: Date.now(), p };
  return p;
}

const TEXT = {
  on: "Notifications are on for this phone.",
  dismissed: "Your phone didn't turn them on. Tap the switch again and choose Allow.",
  limit: "That's a lot of tries today. Please try again tomorrow.",
  sign_in: "Please log in again, then turn this on.",
  unavailable: "Couldn't turn on notifications. Check your connection and try again.",
  off: "Turned off for this phone.",
  offFailed: "Turned off on this phone. We'll stop sending to it.",
  sent: "Sent. It should arrive in a few seconds, even with TapTurf closed.",
  stopped: "This phone's notifications had stopped. Turn them on again.",
  testLimit: "You can send 5 tests an hour. Try again a little later.",
  testFailed: "Couldn't send the test. Please try again.",
} as const;

export function usePush() {
  const { user, getToken, signedInWith } = useAuth();
  const userId = user?.id ?? null;
  const s = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (!userId) return;
    // Reading where it stands never signs anyone out: a quiet token.
    const quiet = quietToken(signedInWith);
    void load(userId, quiet);
    const onShow = () => {
      if (document.visibilityState === "visible" && !state.busy) void load(userId, quiet, true);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [userId, signedInWith]);

  const mine = s.userId === userId ? s : START;

  /** From the tap itself: the phone's question comes first. */
  const turnOn = () => {
    if (!userId || state.busy) return;
    set({ busy: "on", note: null });
    void turnPushOn(getToken, userId).then((r) => {
      if ("ok" in r) return set({ busy: null, view: "on", devices: r.ok.devices, note: { tone: "ok", text: TEXT.on } });
      if (r.error === "denied") return set({ busy: null, view: "blocked" });
      if (r.error === "not_ready") return set({ busy: null, view: "soon" });
      set({ busy: null, view: "off", note: { tone: "bad", text: TEXT[r.error] } });
    });
  };

  const turnOff = () => {
    if (!userId || state.busy) return;
    set({ busy: "off", note: null });
    void turnPushOff(getToken).then((told) =>
      set({ busy: null, view: "off", devices: Math.max(0, state.devices - 1), note: { tone: "ok", text: told ? TEXT.off : TEXT.offFailed } }),
    );
  };

  const test = () => {
    if (!userId || state.busy) return;
    set({ busy: "test", note: null });
    void sendPushTest(getToken).then(async (r) => {
      // One of the account's phones has ended: whether it is this one, the server says (and check ends it here too).
      const ended = ("ok" in r && r.ok.gone > 0) || ("error" in r && r.error === "none");
      if (ended) await check(userId, getToken).catch(() => {});
      if (ended && state.view !== "on") return set({ busy: null, view: "off", note: { tone: "bad", text: TEXT.stopped } });
      if ("ok" in r && r.ok.sent > 0) return set({ busy: null, note: { tone: "ok", text: TEXT.sent } });
      set({ busy: null, note: { tone: "bad", text: "error" in r && r.error === "limit" ? TEXT.testLimit : TEXT.testFailed } });
    });
  };

  return { view: mine.view, devices: mine.devices, busy: mine.busy, note: mine.note, turnOn, turnOff, test };
}

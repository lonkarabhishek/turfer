"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/supabase-js";
import { createLeases, createWatch, type WatchChannel, type WatchStatus, type Watchers } from "./watch";

/** This tab's presence key: random, so nothing about the viewer is sent, and the same across this page's remounts. */
let tabKey: string | null = null;
function keyOfTab(): string {
  if (!tabKey) {
    tabKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : // randomUUID needs a secure context; a local network test over http still gets a key.
          Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
  }
  return tabKey;
}

const leases = createLeases();

/**
 * Realtime removes its socket a moment after the last channel goes (100
 * ms in realtime-js 2.96); a join in that window waits out a 10 s timeout.
 * A new channel on the same topic waits this long after a removal.
 */
const SETTLE_MS = 150;

let realtime: RealtimeClient | null = null;

/**
 * The one Realtime connection for counts, loaded only when a count is
 * shown. Its own, not the site client's: it carries the public key only,
 * never the viewer's login, so joining a count says nothing about who is
 * watching.
 */
async function realtimeClient(): Promise<RealtimeClient> {
  if (!realtime) {
    const { RealtimeClient } = await import("@supabase/supabase-js");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const url = new URL("realtime/v1", base.endsWith("/") ? base : `${base}/`);
    url.protocol = url.protocol.replace("http", "ws");
    realtime = new RealtimeClient(url.href, { params: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
  }
  return realtime;
}

/** The Realtime channel for a topic. */
async function openChannel(topic: string): Promise<WatchChannel> {
  const release = await leases.acquire(topic);
  let channel: RealtimeChannel;
  let remove: () => Promise<unknown>;
  try {
    const client = await realtimeClient();
    channel = client.channel(topic, { config: { presence: { key: keyOfTab() } } });
    remove = () => client.removeChannel(channel).finally(() => setTimeout(release, SETTLE_MS));
  } catch (e) {
    release();
    throw e;
  }
  return {
    onSync: (fn) => {
      channel.on("presence", { event: "sync" }, fn);
    },
    subscribe: (fn) => {
      channel.subscribe((status) => fn(status as WatchStatus));
    },
    state: () => channel.presenceState(),
    // An empty payload: the count needs the key only.
    track: () => channel.track({}),
    untrack: () => channel.untrack(),
    remove,
  };
}

/**
 * How many people have this live score open now, or null to show no
 * count (no link, Realtime not reachable, any error). Followers pass
 * track: true and count themselves in; the scorer listens only. One per
 * code per page. A tab hidden for 30 s leaves the count and joins again
 * when looked at.
 */
export function useWatchers(code: string | null, opts: { track: boolean }): Watchers | null {
  const { track } = opts;
  // Tagged with the code it is for, so a link turned off or changed shows nothing until its own count comes in.
  const [got, setGot] = useState<{ code: string; w: Watchers | null } | null>(null);

  useEffect(() => {
    if (!code) return;
    const watch = createWatch(code, track, {
      open: openChannel,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      hidden: () => document.visibilityState === "hidden",
      emit: (w) => setGot({ code, w }),
    });
    const onVisibility = () => (document.visibilityState === "hidden" ? watch.hidden() : watch.visible());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watch.stop();
    };
  }, [code, track]);

  return code && got?.code === code ? got.w : null;
}

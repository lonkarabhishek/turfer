"use client";

import { useEffect, useId, useState } from "react";
import { Search, User, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorOf, searchPlayers } from "@/lib/account/client";
import type { PlayerHit } from "@/lib/account/types";
import type { Tag } from "@/lib/account/tag";
import { USERNAME_RE } from "@/lib/account/tag";

/**
 * Pick a TapTurf profile to tag on a player: recently tagged profiles
 * (kept on this device, so they work offline), and "Find on TapTurf"
 * for signed-in scorers who are online. Only people who left "Let
 * others find and tag me" on are found. Shared by the cricket scorer
 * and the Live Scoreboard.
 */

/** Profiles this device tagged, newest first. Not under the scorer or board keys: clearing a match keeps them. */
const RECENT_KEY = "tapturf_tag_recent_v1";
const RECENT_KEPT = 12;

function readRecent(): PlayerHit[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((p): p is PlayerHit => !!p && typeof p.u === "string" && USERNAME_RE.test(p.u) && typeof p.name === "string").slice(0, RECENT_KEPT);
  } catch {
    return [];
  }
}

export function rememberTagged(p: PlayerHit) {
  try {
    const next = [p, ...readRecent().filter((x) => x.u !== p.u)].slice(0, RECENT_KEPT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
}

function Avatar({ photo }: { photo: string | null }) {
  return photo ? (
    <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
  ) : (
    <span className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0" aria-hidden>
      <User className="w-4 h-4 text-primary-400" />
    </span>
  );
}

/** The tag a player has now, with Remove. */
export function TagLine({ tag, onRemove }: { tag: Tag; onRemove: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-accent-50 border border-accent-200 px-3 py-2">
      <span className="text-[14px] font-semibold text-accent-800 truncate">@{tag.u}</span>
      <span className="text-[12px] text-accent-700">TapTurf profile</span>
      <button type="button" onClick={onRemove} className="press-tight ml-auto h-9 px-3 rounded-full text-[13px] font-semibold text-primary-700 hover:bg-white">
        Remove tag
      </button>
    </div>
  );
}

/** exclude: usernames already on show (chips of players tagged in this match): not offered again as recent ones. */
export function PlayerSearch({ onPick, exclude = [] }: { onPick: (p: PlayerHit) => void; exclude?: readonly (string | null | undefined)[] }) {
  const { user, getToken } = useAuth();
  const id = useId();
  const [recent] = useState(readRecent);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; players: PlayerHit[] } | { q: string; error: true } | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const query = q.trim().replace(/^@/, "");
  const ready = query.length >= 2;

  useEffect(() => {
    if (!open || !ready) return;
    let live = true;
    const t = setTimeout(async () => {
      const tok = await getToken();
      if (!live) return;
      if (!("token" in tok)) {
        setResult({ q: query, error: true });
        return;
      }
      const a = await searchPlayers(tok.token, query);
      if (!live) return;
      const players = (a.body as { players?: PlayerHit[] }).players;
      setResult(errorOf(a) || !Array.isArray(players) ? { q: query, error: true } : { q: query, players });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, ready, query, getToken]);

  const pick = (p: PlayerHit) => {
    rememberTagged(p);
    onPick(p);
  };

  const recentShown = recent.filter((p) => !exclude.includes(p.u)).slice(0, 6);
  const canSearch = !!user && online;
  const current = result && result.q === query ? result : null;

  if (!recentShown.length && !canSearch) return null;

  return (
    <div className="mt-3">
      {recentShown.length > 0 && (
        <>
          <p className="text-[12px] font-semibold text-primary-500 mb-1.5">Tag a TapTurf profile</p>
          <div className="flex flex-wrap gap-2">
            {recentShown.map((p) => (
              <button
                key={p.u}
                type="button"
                onClick={() => pick(p)}
                className="press-tight h-11 pl-1.5 pr-3 rounded-full border-2 border-accent-200 bg-white inline-flex items-center gap-2 text-[14px] font-semibold text-primary-800 hover:border-accent-400"
              >
                <Avatar photo={p.photo} />
                <span className="truncate max-w-[9rem]">{p.name}</span>
                <span className="text-[12px] text-primary-500">@{p.u}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {canSearch && !open && (
        <button type="button" onClick={() => setOpen(true)} className="press-tight mt-2 inline-flex items-center gap-1.5 h-10 text-[14px] font-semibold text-accent-700">
          <Search className="w-4 h-4" aria-hidden />
          Find on TapTurf
        </button>
      )}

      {canSearch && open && (
        <div className="mt-2">
          <label htmlFor={`${id}-q`} className="sr-only">
            Find a TapTurf profile by name or username
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
            <input
              id={`${id}-q`}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={q}
              autoFocus
              maxLength={30}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Name or @username"
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-12 pl-9 pr-10 rounded-xl bg-white border-2 border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-500 focus:outline-none focus:border-accent-500"
            />
            <button type="button" onClick={() => { setOpen(false); setQ(""); }} aria-label="Close search" className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full text-primary-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div aria-live="polite" className="mt-2">
            {ready && !current && <p className="text-[13px] text-primary-500">Searching…</p>}
            {current && "error" in current && <p className="text-[13px] text-red-600">Couldn&apos;t search right now. Try again in a moment.</p>}
            {current && "players" in current && current.players.length === 0 && (
              <p className="text-[13px] text-primary-500">No TapTurf profile found. They can pick a username in their profile.</p>
            )}
            {current && "players" in current && current.players.length > 0 && (
              <ul className="divide-y divide-primary-100 rounded-xl border border-primary-100">
                {current.players.map((p) => (
                  <li key={p.u}>
                    <button type="button" onClick={() => pick(p)} className="w-full min-h-14 px-3 py-2 flex items-center gap-3 text-left hover:bg-primary-50">
                      <Avatar photo={p.photo} />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-primary-900 truncate">{p.name}</span>
                        <span className="block text-[13px] text-primary-500">@{p.u}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

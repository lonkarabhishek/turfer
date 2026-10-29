"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, LogIn, MessageCircle, Radio, Share2, X } from "lucide-react";
import { shortUrl, type LiveFault, type LiveInfo } from "./live";
import { Sheet } from "./ui";

/**
 * Sharing, shared by the Live Cricket Scorer and the Live Scoreboard: the
 * WhatsApp text, the live link block and a plain confirm sheet. Only ./live
 * and ./ui here, never a scoring engine, so the scoreboard's bundle does not
 * carry the cricket one. Sheets.tsx re-exports all of it for the cricket
 * imports.
 */

/** The share sheet's live link block, when live links are on for this site. */
export type ShareLive = {
  info: LiveInfo;
  /** The follower link while the link is on. */
  url: string | null;
  onStart: () => void;
  onStop: () => void;
  /** Logged out: Turn on live link goes to the login first. */
  loginFirst?: boolean;
  /** The server asked for a login again (fault login): off to it, back to this match, and the link carries on. */
  onLogin?: () => void;
};

/** What the link carries, in the sport's own words. */
export type ShareWords = {
  /** "Friends open the link and <follow>." */
  follow: string;
  /** Everything has reached the link. */
  sent: string;
  /** "Offline. <saved> and will send when you are back online." */
  saved: string;
};

export const CRICKET_WORDS: ShareWords = { follow: "follow every ball", sent: "Live, all balls sent", saved: "Balls are saved" };
export const BOARD_WORDS: ShareWords = { follow: "follow the score", sent: "Live, up to date", saved: "The score is saved" };

export const LIVE_FAULT: Record<LiveFault, string> = {
  offline: "No internet? Try again.",
  unavailable: "Live links are not working right now. Try again in a bit.",
  busy: "Live links are busy right now. Retrying…",
  limit: "Too many live links from this network for now. Try again later.",
  too_big: "This match is too long to share live.",
  forbidden: "This link was made in another browser, so it cannot be updated here. Turn on a new live link.",
  gone: "This live link was turned off or has expired. Turn on a new one to keep sharing.",
  bad: "The live link could not take this update. Turn it off and on again.",
  login: "Log in again to keep your live link updating. Your match is saved here, so nothing is lost.",
  not_off: "Could not turn it off. Check your internet and try again.",
};

export function faultText(info: LiveInfo): string | null {
  if (!info.fault) return null;
  // Still on: the server took writes for this link and keeps showing them, so it stays until turned off.
  if (info.on && info.fault === "limit") return "This live link has reached its limit. Turn it off, then turn on a new one to keep sharing.";
  if (info.on && info.fault === "too_big") return "This match is too long to share live now. Friends see the score up to here until you turn the link off.";
  // Not on: the server would not give a link, so there is nothing to keep updating yet.
  if (!info.on && info.fault === "login") return "Log in again to turn on the live link. Your match is saved here.";
  return LIVE_FAULT[info.fault];
}

function liveStatus(words: ShareWords): Record<"synced" | "sending" | "offline" | "busy", { dot: string; text: string }> {
  return {
    synced: { dot: "bg-green-500", text: words.sent },
    sending: { dot: "bg-amber-400", text: "Sending…" },
    offline: { dot: "bg-amber-400", text: `Offline. ${words.saved} and will send when you are back online.` },
    busy: { dot: "bg-amber-400", text: LIVE_FAULT.busy },
  };
}

const waLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function PrivacyNote() {
  return (
    <p className="mt-1 flex items-center gap-1 text-[12px] leading-snug text-primary-500">
      <span className="min-w-0">Team and player names, any TapTurf usernames you tag, and the score are uploaded for this link.</span>
      <a href="/privacy#live-links" target="_blank" rel="noopener" className="shrink-0 min-h-12 px-2 inline-flex items-center font-semibold text-accent-700 underline underline-offset-2">
        Privacy
      </a>
    </p>
  );
}

/**
 * Over the scoring pad while the server wants a login again (fault
 * login): scoring goes on, the link waits. Once per screen; the LIVE pill
 * and the share sheet still say it after it is closed. behind: a toast
 * has the spot for now. inline: in the footer's own flow, taking room
 * rather than covering what is above it (the racquet halves, tap zones to
 * their bottom edge); it stays put while a toast floats above it.
 */
export function LiveLoginNote({ live, behind = false, inline = false }: { live?: ShareLive; behind?: boolean; inline?: boolean }) {
  const [closed, setClosed] = useState(false);
  if (!live || live.info.fault !== "login" || !live.onLogin || closed || (behind && !inline)) return null;
  return (
    <div role="status" className={`${inline ? "mb-2" : "absolute left-3 right-3 bottom-full mb-2 z-10 shadow-elevated"} rounded-2xl pl-4 pr-2 py-2 min-h-14 flex items-center gap-2 bg-amber-300 text-amber-950`}>
      <span className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{live.info.on ? "Live link paused. Log in again to keep it updating." : "Log in again to turn on the live link."}</span>
      <button type="button" onClick={live.onLogin} className="press-tight shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-amber-950 text-white text-[14px] font-bold">
        <LogIn className="w-4 h-4" aria-hidden /> Log in
      </button>
      <button type="button" onClick={() => setClosed(true)} aria-label="Dismiss" className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-amber-950/10">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function LiveLinkBlock({ live, text, onShared, words = CRICKET_WORDS }: { live: ShareLive; text: string; onShared: (how: string) => void; words?: ShareWords }) {
  const { info, url } = live;
  // The link that was copied: one turned on since has not been.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copied = url !== null && copiedUrl === url;
  const [confirmOff, setConfirmOff] = useState(false);
  const fault = faultText(info);
  const box = "rounded-2xl border-2 border-primary-200 p-3";
  const heading = <h3 className="text-[16px] font-bold text-primary-900">Live link</h3>;

  if (info.mode === "starting") {
    return (
      <section className={box} aria-busy="true">
        {heading}
        <p role="status" className="min-h-14 flex items-center gap-2 text-[15px] font-semibold text-primary-800">
          <Loader2 className="w-5 h-5 shrink-0 text-accent-600 animate-spin" aria-hidden /> Getting your link…
        </p>
      </section>
    );
  }

  if (!info.on || !url) {
    return (
      <section className={box}>
        {heading}
        <p className="mt-0.5 text-[14px] leading-snug text-primary-700">Friends open the link to see the score, then log in to {words.follow}. No app needed.</p>
        {fault && (
          <p role="alert" className="mt-2 text-[14px] font-semibold leading-snug text-red-700">
            {fault}
          </p>
        )}
        <button type="button" onClick={live.onStart} className="press-tight mt-3 w-full inline-flex items-center justify-center gap-2 h-14 rounded-full bg-primary-900 text-white text-[17px] font-bold hover:bg-primary-800">
          <Radio className="w-5 h-5" aria-hidden /> {live.loginFirst ? "Log in and turn on live link" : "Turn on live link"}
        </button>
        {live.loginFirst && info.fault !== "login" && <p className="mt-2 text-[13px] leading-snug text-primary-500">Log in with Google or your phone to share. Your match is saved on this phone.</p>}
        <PrivacyNote />
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      onShared("live_copy");
    } catch {
      setCopiedUrl(null);
    }
  };
  // Sending, but the server said busy and is being retried: say so rather than a plain "Sending…".
  const shown = info.state === "sending" && info.fault === "busy" ? "busy" : info.state;
  const status = shown === "synced" || shown === "sending" || shown === "offline" || shown === "busy" ? liveStatus(words)[shown] : null;
  const stopping = info.mode === "stopping";

  return (
    <section className={box}>
      {heading}
      <p className="mt-0.5 text-[15px] font-bold text-primary-900 break-all">{shortUrl(url)}</p>
      <a
        href={waLink(text)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShared("live_whatsapp")}
        className="press-tight mt-3 w-full inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600"
      >
        <MessageCircle className="w-5 h-5" aria-hidden /> Send link on WhatsApp
      </a>
      <button type="button" onClick={copy} className="press-tight mt-2 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800">
        {copied ? <Check className="w-4 h-4" aria-hidden /> : <Link2 className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
      </button>
      <p role="status" className="mt-3 flex items-start gap-2 text-[14px] leading-snug">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${status ? status.dot : "bg-red-500"}`} aria-hidden />
        <span className={status ? "text-primary-700" : "font-semibold text-red-700"}>{status ? status.text : (fault ?? "Live link stopped.")}</span>
      </p>
      {info.fault === "login" && live.onLogin && (
        <button type="button" onClick={live.onLogin} className="press-tight mt-2 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary-900 text-white text-[15px] font-bold hover:bg-primary-800">
          <LogIn className="w-4 h-4" aria-hidden /> Log in again
        </button>
      )}
      {info.fault === "not_off" && (
        <p role="alert" className="mt-2 text-[14px] font-semibold leading-snug text-red-700">
          {fault}
        </p>
      )}
      {confirmOff ? (
        <div className="mt-3 rounded-2xl bg-red-50 p-3">
          <p className="text-[14px] font-semibold leading-snug text-red-800">Turn off the live link? Friends will see that it is off.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmOff(false)} className="press-tight h-12 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800">
              Keep it on
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOff(false);
                live.onStop();
              }}
              className="press-tight h-12 rounded-full bg-red-600 text-white text-[15px] font-bold hover:bg-red-700"
            >
              Turn off
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmOff(true)} disabled={stopping} className="press-tight mt-2 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
          {stopping && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {stopping ? "Turning off…" : "Turn off live link"}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </section>
  );
}

/**
 * Score as WhatsApp text, and the live link on top when the site has
 * live links. With the link on, the text carries it and the block's own
 * WhatsApp button sends it, so the one below goes. words: the live
 * block's copy (cricket's by default).
 */
export function ShareSheet({ text, title, live, onShared, onClose, words }: { text: string; title: string; live?: ShareLive; onShared: (how: string) => void; onClose: () => void; words?: ShareWords }) {
  const [copied, setCopied] = useState(false);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const linkOn = !!live?.info.on && !!live.url;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onShared("copy");
    } catch {
      setCopied(false);
    }
  };
  return (
    <Sheet title={title} subtitle="Bold bits show as bold in WhatsApp." onClose={onClose}>
      {live && (
        <div className="mb-4">
          <LiveLinkBlock live={live} text={text} onShared={onShared} words={words} />
        </div>
      )}
      <pre className="whitespace-pre-wrap break-words rounded-2xl bg-primary-50 p-3 text-[14px] leading-relaxed text-primary-800 font-sans">{text}</pre>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {!linkOn && (
          <a
            href={waLink(text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onShared("whatsapp")}
            className="press-tight col-span-2 inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600"
          >
            <MessageCircle className="w-5 h-5" aria-hidden /> Send on WhatsApp
          </a>
        )}
        <button type="button" onClick={copy} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy text"}
        </button>
        {canNative ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.share({ text });
                onShared("native");
              } catch {
                /* cancelled */
              }
            }}
            className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800"
          >
            <Share2 className="w-4 h-4" aria-hidden /> Other apps
          </button>
        ) : (
          <span />
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Sheet>
  );
}

export function ConfirmSheet({ title, body, confirm, danger, onConfirm, onClose }: { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-[15px] text-primary-700 leading-relaxed">{body}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="press-tight h-14 rounded-full border-2 border-primary-200 text-[16px] font-bold text-primary-800">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={`press-tight h-14 rounded-full text-white text-[16px] font-bold ${danger ? "bg-red-600 hover:bg-red-700" : "bg-primary-900"}`}>
          {confirm}
        </button>
      </div>
    </Sheet>
  );
}

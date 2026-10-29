"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { useAsk } from "./AskProvider";
import { SUMMARY_CHIP } from "@/lib/ask/blog";
import { isCity, labelFor } from "@/lib/city";
import { useCookieBanner } from "@/lib/consent";

/**
 * Floating "Ask" pill, bottom right on every page. Sits above the
 * mobile nav on phones, and above a page's own sticky button when it
 * sets --ask-lift (StickyMobileCTA). Hidden while the panel is open and
 * on admin and login pages. On a blog post it offers, once, to
 * summarize it; on a turf list, once a visit, to answer turf questions
 * (the list has no Ask box of its own).
 */
export function AskLauncher() {
  const { open, openPanel, turns, pageContext } = useAsk();
  const pathname = usePathname();
  // The cookie card covers the bottom edge on phones: no offer under it.
  const banner = useCookieBanner();
  // Not on owner (myTapturf), admin or login pages, nor while adding Google to an account (its buttons fill the bottom).
  if (open || pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/account/") || pathname === "/my" || pathname.startsWith("/my/")) return null;
  // Turf and game pages own the bottom edge on phones (Call / WhatsApp
  // bar, Join bar, create-game footer), so the pill is desktop-only there
  // and those pages offer an in-page button instead.
  // Tool pages end their cards with a full-width button the pill would
  // sit on, so they are desktop-only too.
  const barPages = pathname.startsWith("/turf/") || pathname.startsWith("/game/") || pathname.startsWith("/tools");
  const count = turns.filter((t) => t.res).length;
  const blog = pageContext.blog;
  // Only the short version counts: a question about the article still leaves the offer open.
  const summarized = !!blog && turns.some((t) => t.res?.blog?.slug === blog.slug && t.res.blog.mode !== "answer");
  // A turf list, before this visit's first answer: they may not know Ask is there.
  const listing = !!pageContext.listing && !blog && count === 0 && !banner;
  const where = pageContext.city && isCity(pageContext.city) ? labelFor(pageContext.city) : null;
  return (
    <>
      {blog && !barPages && !summarized && (
        <AskNudge key={blog.slug} store={BLOG_NUDGE} id={blog.slug} after="reading" closeLabel="No thanks" onOpen={() => openPanel(SUMMARY_CHIP)}>
          Short on time? <Strong>I can summarize this blog</Strong>.
        </AskNudge>
      )}
      {listing && !barPages && (
        <AskNudge key="listing" store={LIST_NUDGE} id="list" after="settled" closeLabel="Close" onOpen={() => openPanel()}>
          Got a turf question? <Strong>Ask&nbsp;me</Strong> about prices, timings or comparing two turfs{where ? ` in ${where}` : ""}.
        </AskNudge>
      )}
      <button
        type="button"
        onClick={() => openPanel()}
        aria-label="Ask TapTurf"
        className={`press-tight fixed right-4 bottom-[calc(4.75rem+var(--ask-lift,0px))] md:right-6 md:bottom-6 z-30 items-center gap-2 h-12 pl-3.5 pr-4 rounded-full bg-primary-900 text-white shadow-elevated hover:bg-accent-600 transition-[background-color,bottom] duration-200 cursor-pointer ${
          barPages ? "hidden md:inline-flex" : "inline-flex"
        }`}
      >
        <span className="relative inline-flex">
          <Sparkles className="w-5 h-5 text-accent-400" strokeWidth={2.25} />
          {count > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent-400 ring-2 ring-primary-900" aria-hidden />}
        </span>
        <span className="text-[14px] font-semibold">Ask</span>
      </button>
    </>
  );
}

const BLOG_NUDGE = "tapturf_ask_blog_nudge";
const LIST_NUDGE = "tapturf_ask_list_nudge";
/** How far into the article the reader is before the offer shows: past the hero, actually reading. */
const READ = 0.15;
/** How long a turf list is on screen before its offer shows: the cards are in, the visitor is looking. */
const SETTLE = 3_000;
/** It goes away on its own; hovering or focusing it holds it. */
const SHOW_FOR = 12_000;
const AFTER_HOVER = 4_000;

/** This offer was shown (for this article, on a blog), or turned down or used, this visit. */
function seen(store: string, id: string): boolean {
  try {
    const v = sessionStorage.getItem(store);
    if (!v) return false;
    if (v === "off") return true;
    const list: unknown = JSON.parse(v);
    return Array.isArray(list) && list.includes(id);
  } catch {
    return false;
  }
}

/** null: no more of these offers this visit (closed or used); an id: shown for that one. */
function remember(store: string, id: string | null): void {
  try {
    if (id === null) return sessionStorage.setItem(store, "off");
    const v = sessionStorage.getItem(store);
    if (v === "off") return;
    const list: unknown = v ? JSON.parse(v) : [];
    sessionStorage.setItem(store, JSON.stringify([...(Array.isArray(list) ? list : []), id].slice(-50)));
  } catch {
    /* private mode: it may show again, which is harmless */
  }
}

/** The offer's key words, underlined in the accent. */
function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-primary-900 underline decoration-accent-400/70 decoration-2 underline-offset-[3px]">{children}</span>;
}

/**
 * A small speech bubble over the pill, once per visit (per article on a
 * blog): "I can summarize this blog" once the reader is into it, or on a
 * turf list "Ask me about prices, timings…" once the list has been on
 * screen a moment. Tapping it opens the chat; it goes after a few seconds.
 */
function AskNudge({
  store,
  id,
  after,
  closeLabel,
  onOpen,
  children,
}: {
  store: string;
  id: string;
  after: "reading" | "settled";
  closeLabel: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"in" | "out" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideIn = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase((p) => (p ? "out" : p)), ms);
  };

  useEffect(() => {
    if (seen(store, id)) return;
    const show = () => {
      remember(store, id);
      setPhase("in");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase((p) => (p ? "out" : p)), SHOW_FOR);
    };
    if (after === "settled") {
      const wait = setTimeout(show, SETTLE);
      return () => {
        clearTimeout(wait);
        clearTimeout(timer.current);
      };
    }
    const onScroll = () => {
      const doc = document.documentElement;
      if (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) < READ) return;
      window.removeEventListener("scroll", onScroll);
      show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer.current);
    };
  }, [store, id, after]);

  if (!phase) return null;
  return (
    <div
      className={`fixed z-30 right-4 bottom-[calc(8.25rem+var(--ask-lift,0px))] md:right-6 md:bottom-[5rem] w-[15.5rem] max-w-[calc(100vw-2rem)] transition-[bottom] duration-200 ${phase === "out" ? "ask-nudge-out" : "ask-nudge-in"}`}
      onAnimationEnd={() => phase === "out" && setPhase(null)}
      onPointerEnter={() => clearTimeout(timer.current)}
      onPointerLeave={() => hideIn(AFTER_HOVER)}
      onFocus={() => clearTimeout(timer.current)}
      onBlur={() => hideIn(AFTER_HOVER)}
    >
      <div className="relative rounded-2xl bg-white shadow-elevated ring-1 ring-primary-900/5">
        <button
          type="button"
          onClick={() => {
            remember(store, null);
            clearTimeout(timer.current);
            setPhase(null);
            onOpen();
          }}
          className="w-full flex items-start gap-2.5 pl-3.5 pr-9 py-3 text-left rounded-2xl cursor-pointer"
        >
          <Sparkles className="w-4 h-4 mt-px shrink-0 text-accent-500" strokeWidth={2.25} aria-hidden />
          <span className="text-[13px] leading-snug text-primary-600">{children}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            remember(store, null);
            setPhase("out");
          }}
          aria-label={closeLabel}
          className="absolute top-1 right-1 h-8 w-8 inline-flex items-center justify-center rounded-full text-primary-400 hover:text-primary-700 hover:bg-primary-100 cursor-pointer transition-colors"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
        {/* Tail, pointing down at the pill's icon. */}
        <span aria-hidden className="absolute -bottom-[5px] right-[50px] w-2.5 h-2.5 rotate-45 rounded-[2px] bg-white" />
      </div>
    </div>
  );
}

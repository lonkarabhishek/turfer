"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { useAsk } from "./AskProvider";
import { SUMMARY_CHIP } from "@/lib/ask/blog";

/**
 * Floating "Ask" pill, bottom right on every page. Sits above the
 * mobile nav on phones, and above a page's own sticky button when it
 * sets --ask-lift (StickyMobileCTA). Hidden while the panel is open and
 * on admin and login pages. On a blog post it offers, once, to
 * summarize it.
 */
export function AskLauncher() {
  const { open, openPanel, turns, pageContext } = useAsk();
  const pathname = usePathname();
  // Not on owner (myTapturf), admin or login pages.
  if (open || pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname === "/my" || pathname.startsWith("/my/")) return null;
  // Turf and game pages own the bottom edge on phones (Call / WhatsApp
  // bar, Join bar, create-game footer), so the pill is desktop-only there
  // and those pages offer an in-page button instead.
  // Tool pages end their cards with a full-width button the pill would
  // sit on, so they are desktop-only too.
  const barPages = pathname.startsWith("/turf/") || pathname.startsWith("/game/") || pathname.startsWith("/tools");
  const count = turns.filter((t) => t.res).length;
  const blog = pageContext.blog;
  const summarized = !!blog && turns.some((t) => t.res?.blog?.slug === blog.slug);
  return (
    <>
      {blog && !barPages && !summarized && <BlogNudge key={blog.slug} slug={blog.slug} onSummarize={() => openPanel(SUMMARY_CHIP)} />}
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

const NUDGE = "tapturf_ask_blog_nudge";
/** How far into the article the reader is before the offer shows: past the hero, actually reading. */
const READ = 0.15;
/** It goes away on its own; hovering or focusing it holds it. */
const SHOW_FOR = 12_000;
const AFTER_HOVER = 4_000;

/** The offer was shown for this article, or turned down or used, this visit. */
function seen(slug: string): boolean {
  try {
    const v = sessionStorage.getItem(NUDGE);
    if (!v) return false;
    if (v === "off") return true;
    const list: unknown = JSON.parse(v);
    return Array.isArray(list) && list.includes(slug);
  } catch {
    return false;
  }
}

/** null: no more offers this visit (closed or used); a slug: shown for that article. */
function remember(slug: string | null): void {
  try {
    if (slug === null) return sessionStorage.setItem(NUDGE, "off");
    const v = sessionStorage.getItem(NUDGE);
    if (v === "off") return;
    const list: unknown = v ? JSON.parse(v) : [];
    sessionStorage.setItem(NUDGE, JSON.stringify([...(Array.isArray(list) ? list : []), slug].slice(-50)));
  } catch {
    /* private mode: it may show again, which is harmless */
  }
}

/** A small speech bubble over the pill: "I can summarize this blog". Once per article a visit, gone after a few seconds. */
function BlogNudge({ slug, onSummarize }: { slug: string; onSummarize: () => void }) {
  const [phase, setPhase] = useState<"in" | "out" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideIn = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase((p) => (p ? "out" : p)), ms);
  };

  useEffect(() => {
    if (seen(slug)) return;
    const onScroll = () => {
      const doc = document.documentElement;
      if (doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight) < READ) return;
      window.removeEventListener("scroll", onScroll);
      remember(slug);
      setPhase("in");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase((p) => (p ? "out" : p)), SHOW_FOR);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer.current);
    };
  }, [slug]);

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
            remember(null);
            clearTimeout(timer.current);
            setPhase(null);
            onSummarize();
          }}
          className="w-full flex items-start gap-2.5 pl-3.5 pr-9 py-3 text-left rounded-2xl cursor-pointer"
        >
          <Sparkles className="w-4 h-4 mt-px shrink-0 text-accent-500" strokeWidth={2.25} aria-hidden />
          <span className="text-[13px] leading-snug text-primary-600">
            Short on time? <span className="font-semibold text-primary-900 underline decoration-accent-400/70 decoration-2 underline-offset-[3px]">I can summarize this blog</span>.
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            remember(null);
            setPhase("out");
          }}
          aria-label="No thanks"
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

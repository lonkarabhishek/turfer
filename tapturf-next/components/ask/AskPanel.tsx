"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useAsk, type Turn } from "./AskProvider";
import { AskResultBody } from "./AskResults";

const WELCOME_CHIPS = ["Box cricket near me tonight", "Football games this weekend", "Compare two turfs", "Cheapest turf in my city"];

/**
 * The chat itself. A bottom sheet on phones, a side panel on desktop.
 * Thread on top, composer pinned to the bottom, Esc or the cross
 * closes. Only the latest reply shows follow-up chips.
 */
export function AskPanel() {
  const { open, closePanel, turns, busy, send, reset, requestLocation, locating, pageContext, draft, setDraft, signedIn, pending, freeLeft, signIn } = useAsk();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    const prev = document.body.style.overflow;
    // Phones: stop the page scrolling under the sheet.
    if (window.innerWidth < 768) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, closePanel]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end", behavior: turns.length > 1 ? "smooth" : "auto" });
  }, [open, turns, busy, freeLeft, pending]);

  // Close when navigating away from the page the chat was opened on? No:
  // the thread follows the player. Only hide on admin and login.
  if (!open || pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;

  const last = turns.length ? turns[turns.length - 1] : null;
  const chips = last?.res?.followups?.length ? last.res.followups : turns.length === 0 ? WELCOME_CHIPS : [];
  const where = pageContext.turf ? pageContext.turf.name : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" role="presentation">
      <button type="button" aria-label="Close" onClick={closePanel} className="absolute inset-0 bg-primary-900/35 backdrop-blur-[2px] cursor-pointer" />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ask TapTurf"
        className="relative flex flex-col w-full md:w-[440px] h-[calc(100dvh-3rem)] md:h-full bg-white md:bg-primary-50 rounded-t-[28px] md:rounded-none shadow-elevated ask-sheet-in md:ask-panel-in overflow-hidden"
      >
        {/* Header */}
        <header className="relative shrink-0 px-4 pt-3 pb-3 md:pt-4 bg-white border-b border-primary-100">
          <div className="md:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-primary-200" aria-hidden />
          <div className="flex items-center gap-3">
            <Orb />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] text-primary-900 leading-tight">Ask TapTurf</p>
              <p className="text-[12px] text-primary-500 truncate">
                {where ? `Looking at ${where}` : "Turfs, games, comparisons, questions"}
              </p>
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="h-11 w-11 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-primary-900 hover:bg-primary-100 cursor-pointer transition-colors"
                aria-label="Start over"
                title="Start over"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              className="h-11 w-11 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-primary-900 hover:bg-primary-100 cursor-pointer transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4" aria-live="polite">
          {turns.length === 0 && <Welcome where={where} />}
          {turns.map((t, i) => (
            <TurnView key={t.id} turn={t} isLast={i === turns.length - 1} onUseLocation={() => void requestLocation()} locating={locating} />
          ))}
          {!signedIn && freeLeft === 0 && <SignInCard pending={pending} onSignIn={signIn} />}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="shrink-0 bg-white border-t border-primary-100 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {chips.length > 0 && !busy && (
            <div className="-mx-3 px-3 mb-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void send(c)}
                  className="shrink-0 h-9 px-3.5 rounded-full border border-primary-200 bg-white hover:border-accent-500 hover:text-accent-700 text-[13px] font-medium text-primary-800 whitespace-nowrap cursor-pointer transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="ask-input" className="sr-only">
              Message
            </label>
            <input
              id="ask-input"
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={160}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={!signedIn && freeLeft === 0 ? "Sign in to keep going" : turns.length ? "Ask a follow-up" : "Ask for a turf, a game, or compare two"}
              className="flex-1 h-12 px-4 rounded-full bg-primary-100 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white transition-colors"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length < 1}
              aria-label="Send"
              className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-full bg-primary-900 text-white hover:bg-accent-600 disabled:opacity-40 disabled:hover:bg-primary-900 cursor-pointer transition-colors"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/** Animated gradient avatar. */
export function Orb({ size = 40 }: { size?: number }) {
  return (
    <span className="ask-orb relative inline-flex shrink-0 items-center justify-center rounded-2xl overflow-hidden" style={{ width: size, height: size }} aria-hidden>
      <span className="relative z-10 inline-flex items-center justify-center rounded-[14px] bg-primary-900" style={{ width: size - 4, height: size - 4 }}>
        <Sparkles className="text-accent-400" style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.25} />
      </span>
    </span>
  );
}

function Welcome({ where }: { where: string | null }) {
  return (
    <div className="ask-message-in">
      <div className="flex items-end gap-2">
        <Orb size={28} />
        <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white md:bg-white border border-primary-100 px-4 py-3 text-[15px] text-primary-900 leading-snug shadow-soft">
          {where ? (
            <>
              Hey. You&rsquo;re looking at <span className="font-semibold">{where}</span>. Ask me anything about it, compare it with another turf, or find something nearby.
            </>
          ) : (
            <>Hey. I know every turf and open game on TapTurf. Tell me a sport, an area and a budget, or just ask.</>
          )}

        </div>
      </div>
    </div>
  );
}

/** Inline sign-in step: the thread stays, the parked message goes once they're in. */
function SignInCard({ pending, onSignIn }: { pending: string | null; onSignIn: () => void }) {
  return (
    <div className="ask-message-in flex items-end gap-2">
      <Orb size={28} />
      <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-primary-900 text-white px-4 py-3.5 shadow-elevated">
        <p className="text-[15px] leading-snug">Sign in to keep chatting. It&rsquo;s free and takes ten seconds, and I&rsquo;ll pick up right where we are.</p>
        {pending && <p className="mt-1.5 text-[13px] text-white/70">Next up: &ldquo;{pending}&rdquo;</p>}
        <button
          type="button"
          onClick={onSignIn}
          className="mt-3 inline-flex items-center justify-center h-11 px-5 rounded-full bg-accent-500 hover:bg-accent-400 text-white text-[14px] font-semibold cursor-pointer transition-colors"
        >
          Sign in to continue
        </button>
      </div>
    </div>
  );
}

function TurnView({ turn, isLast, onUseLocation, locating }: { turn: Turn; isLast: boolean; onUseLocation: () => void; locating: boolean }) {
  return (
    <div className="space-y-3 ask-message-in">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-900 text-white text-[15px] px-4 py-2.5 leading-snug">{turn.user}</p>
      </div>
      <div className="flex items-end gap-2">
        <Orb size={28} />
        <div className="min-w-0 flex-1">
          <div className="inline-block max-w-[92%] rounded-2xl rounded-bl-md bg-white border border-primary-100 px-4 py-3 text-[15px] text-primary-900 leading-snug shadow-soft">
            {turn.error ? (
              <span className="text-hot-600">{turn.error}</span>
            ) : turn.res ? (
              <>
                {turn.res.reply}
                <Subline res={turn.res} />
              </>
            ) : (
              <span className="inline-flex items-center gap-1 h-5 px-1" aria-label="Typing">
                <span className="ask-dot inline-block w-2 h-2 rounded-full bg-primary-400" />
                <span className="ask-dot inline-block w-2 h-2 rounded-full bg-primary-400" />
                <span className="ask-dot inline-block w-2 h-2 rounded-full bg-primary-400" />
              </span>
            )}
          </div>
        </div>
      </div>
      {turn.res && (isLast || turn.res.intent !== "other") && (
        <div className="pl-0 sm:pl-9">
          <AskResultBody res={turn.res} onUseLocation={onUseLocation} locating={locating} />
        </div>
      )}
    </div>
  );
}

function Subline({ res }: { res: Turn["res"] & object }) {
  let text = "";
  if (res.failed) text = "Something went wrong on our side. Try again in a moment.";
  else
    switch (res.intent) {
      case "find_turf":
        text = res.total === 0 ? "Nothing matched that. Try fewer conditions." : `${res.total} match${res.total === 1 ? "" : "es"}${res.relaxed.length ? `, after widening ${res.relaxed.join(" and ")}.` : "."}`;
        break;
      case "find_game":
        text = res.total === 0 ? "No open games match yet." : `${res.total} open game${res.total === 1 ? "" : "s"}${res.relaxed.length ? `, after widening ${res.relaxed.join(" and ")}.` : "."}`;
        break;
      case "compare":
        if (res.missing?.length) text = `I couldn't find ${res.missing.map((m) => `"${m}"`).join(" or ")} in our listings.`;
        else if ((res.turfs?.length ?? 0) < 2) text = "Name two venues we list and I'll put them side by side.";
        break;
      case "question":
        if (res.missing?.length) text = `I couldn't find "${res.missing[0]}" in our listings.`;
        else if (!res.answer) text = "Couldn't answer that right now.";
        break;
    }
  if (!text) return null;
  return <span className="block mt-1 text-[12px] text-primary-500">{text}</span>;
}

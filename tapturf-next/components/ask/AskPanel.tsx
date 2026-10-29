"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
import { useAsk, type AskResponse, type PageContext, type Turn } from "./AskProvider";
import { AskResultBody } from "./AskResults";
import { AskSkeleton, AskThinking, type CardsKind } from "./AskThinking";
import { TypingReply, prefersReducedMotion } from "./TypingReply";
import { articleWelcome } from "./blogUi";
import { askChips, openingChips } from "@/lib/ask/chips";
import { SUMMARY_CHIP } from "@/lib/ask/blog";
import { getCityPref } from "@/lib/city";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";

// Until /api/ask/chips answers: no place names, no games promise.
const WELCOME_CHIPS = askChips(null, 0);

/**
 * The chat itself. A bottom sheet on phones, a side panel on desktop.
 * Thread on top, composer pinned to the bottom, Esc or the cross
 * closes. Only the latest reply shows follow-up chips. It fills what
 * the phone shows (ViewportOverlay): with the keys up on iOS or in an
 * in-app browser, the composer sits right above them and the header
 * stays at the top, as Android's resizes-content already does.
 */
export function AskPanel() {
  const { open, closePanel, turns, busy, send, retry, reset, requestLocation, locating, pageContext, draft, setDraft, signedIn, pending, freeLeft, signIn } = useAsk();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [welcome, setWelcome] = useState<string[]>(WELCOME_CHIPS);
  const fresh = turns.length === 0;
  const onArticle = !!pageContext.blog;

  // Opening chips follow the city on screen (or the visitor's city):
  // its own area and turfs, and a games chip only when it has open games.
  // An article opens with its own questions instead.
  useEffect(() => {
    if (!open || !fresh || onArticle) return;
    const city = pageContext.city ?? getCityPref();
    let live = true;
    fetch(`/api/ask/chips${city ? `?city=${encodeURIComponent(city)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { chips?: unknown } | null) => {
        if (live && Array.isArray(j?.chips) && j.chips.length) setWelcome(j.chips.filter((c): c is string => typeof c === "string"));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, fresh, onArticle, pageContext.city]);

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

  // Scroll the thread itself, never the page behind it: scrollIntoView
  // on a fixed sheet nudges the window on phones and jolts the layout.
  // Aim at the newest turn's top (the browser stops at the bottom when it
  // fits), so a tall result never pushes the reply typing in off screen.
  // A parked message goes to the sign-in card at the bottom instead.
  // Placeholder cards scroll it there too, so the answer's space is in view.
  const toNewest = useCallback(
    (smooth: boolean) => {
      const el = threadRef.current;
      if (!el) return;
      const all = el.querySelectorAll<HTMLElement>("[data-turn]");
      const turn = pending ? null : all[all.length - 1];
      const top = turn ? turn.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 16 : el.scrollHeight;
      el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    },
    [pending],
  );
  useEffect(() => {
    if (open) toNewest(turns.length > 1);
  }, [open, turns, busy, freeLeft, toNewest]);

  // Close when navigating away from the page the chat was opened on? No:
  // the thread follows the player. Only hide on admin and login.
  if (!open || pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;

  const last = turns.length ? turns[turns.length - 1] : null;
  const where = pageContext.turf ? pageContext.turf.name : null;
  // On an article: the short version is on offer until this thread has it
  // (an answer to a question about it doesn't count; no mode is an old summary).
  const blog = pageContext.blog ?? null;
  const offerSummary = !!blog && !turns.some((t) => t.res?.blog?.slug === blog.slug && t.res.blog.mode !== "answer");
  // On a turf page the chat opens with what players say about it.
  const next = last?.res?.followups?.length ? last.res.followups : fresh ? openingChips(welcome, !!where) : [];
  const chips = offerSummary && !fresh ? [SUMMARY_CHIP, ...next.filter((c) => c !== SUMMARY_CHIP)] : next;
  // Signed out with no free answers left: Try again would be refused, so the sign-in card stands in.
  const gated = !signedIn && freeLeft === 0;

  return (
    <ViewportOverlay className="z-50 flex md:justify-end" role="presentation">
      {/* Desktop: dim the page behind the side panel. Phones get a full screen, white to the edges while the panel follows the keys. */}
      <button type="button" aria-label="Close" onClick={closePanel} className="hidden md:block fixed inset-0 bg-primary-900/30 cursor-pointer" />
      <div className="md:hidden fixed inset-0 bg-white animate-lightbox" aria-hidden />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ask TapTurf"
        className="relative flex flex-col w-full md:w-[480px] h-[var(--vv-h,100dvh)] bg-white md:shadow-elevated ask-screen-in md:ask-panel-in overflow-hidden"
      >
        {/* Header: back on phones, close on desktop. */}
        <header className="shrink-0 flex items-center gap-1 h-14 px-1.5 border-b border-primary-100">
          <button
            type="button"
            onClick={closePanel}
            className="md:hidden h-11 w-11 inline-flex items-center justify-center rounded-full text-primary-900 hover:bg-primary-100 cursor-pointer transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1 px-1 md:px-2.5">
            <p className="font-display text-[17px] text-primary-900 leading-tight">Ask TapTurf</p>
            <p className="text-[12px] text-primary-500 truncate">{where ? `About ${where}` : blog ? "About this article" : "Turfs, games, prices and comparisons"}</p>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium text-primary-600 hover:text-primary-900 hover:bg-primary-100 cursor-pointer transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden min-[380px]:inline">New</span>
            </button>
          )}
          <button
            type="button"
            onClick={closePanel}
            className="hidden md:inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-500 hover:text-primary-900 hover:bg-primary-100 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Thread */}
        <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain" aria-live="polite">
          {/* A parked message shows its sign-in card even when the thread is empty. */}
          {turns.length === 0 && !(gated && pending) ? (
            <Welcome where={where} article={where ? null : blog} chips={chips} onPick={(c) => void send(c)} />
          ) : (
            <div className="px-4 py-5 space-y-7">
              {turns.map((t, i) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  isLast={i === turns.length - 1}
                  onUseLocation={() => void requestLocation()}
                  locating={locating}
                  onRetry={
                    t.retry && i === turns.length - 1 && !busy && !gated
                      ? (e) => {
                          retry(t.id);
                          // The button goes with the error, so keep focus in the chat. Touch screens keep their keyboard down.
                          if (e.detail === 0 || window.matchMedia("(hover: hover)").matches) inputRef.current?.focus({ preventScroll: true });
                        }
                      : undefined
                  }
                  onCards={() => toNewest(true)}
                />
              ))}
              {gated && <SignInCard pending={pending} onSignIn={signIn} />}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 bg-white px-3 pt-2 pb-[max(0.75rem,var(--safe-b,env(safe-area-inset-bottom)))]">
          {turns.length > 0 && chips.length > 0 && !busy && (
            <div className="-mx-3 px-3 mb-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void send(c)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] font-medium text-primary-800 whitespace-nowrap cursor-pointer transition-colors"
                >
                  {c === SUMMARY_CHIP && <Sparkles className="w-3.5 h-3.5 text-accent-600" strokeWidth={2.25} aria-hidden />}
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
            className="relative"
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
              onFocus={(e) => {
                // iOS scrolls the page to the focused field; the screen is fixed, so keep the page put.
                const y = window.scrollY;
                setTimeout(() => window.scrollTo(0, y), 50);
                e.currentTarget.scrollIntoView({ block: "nearest" });
              }}
              autoComplete="off"
              placeholder={!signedIn && freeLeft === 0 ? "Sign in to keep going" : blog ? "Ask anything about this article" : turns.length ? "Ask a follow-up" : "Ask for a turf, a game, or compare two"}
              className="w-full h-12 pl-4 pr-14 rounded-full border border-primary-200 bg-white shadow-soft text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus-visible:outline-none focus:border-primary-400 transition-colors"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length < 1}
              aria-label="Send"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-primary-900 text-white hover:bg-accent-600 disabled:bg-primary-200 disabled:text-primary-400 cursor-pointer transition-colors"
            >
              {/* Busy: dimmed like an empty box. The ball in the thread shows the wait. */}
              <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </section>
    </ViewportOverlay>
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

/** Chips on an article's opening screen, after its own FAQ questions. */
const CHART_CHIP = "Chart the key numbers";
const DIAGRAM_CHIP = "Explain it with a diagram";

/**
 * Empty chat: a greeting in the middle and the city's suggestions as a
 * grid. On an article: the short version first, then questions it can
 * answer (its own FAQ, a chart when it has numbers, a diagram), one per
 * row so a whole question fits.
 */
function Welcome({ where, article, chips, onPick }: { where: string | null; article: PageContext["blog"]; chips: string[]; onPick: (c: string) => void }) {
  const asks = article ? [...(article.questions ?? []).slice(0, 3), ...(article.charts ? [CHART_CHIP] : []), DIAGRAM_CHIP] : [];
  return (
    <div className="min-h-full flex flex-col justify-center px-5 py-8 ask-message-in">
      <Orb size={44} />
      <h2 className="mt-4 font-display text-[26px] leading-tight text-primary-900">
        {where ? <>Ask about {where}</> : article ? <>Short on time?</> : <>What are you playing today?</>}
      </h2>
      <p className="mt-1.5 text-[15px] leading-snug text-primary-500">
        {where
          ? "What players say, prices, timings, facilities, or how it compares with another turf."
          : article
            ? articleWelcome(!!article.charts)
            : "Turfs, open games, prices and comparisons. Hinglish chalega."}
      </p>
      {article ? (
        <>
          <button
            type="button"
            onClick={() => onPick(SUMMARY_CHIP)}
            className="press-tight mt-6 w-full min-h-[56px] flex items-center gap-2.5 px-4 rounded-2xl bg-primary-900 hover:bg-accent-600 text-white text-[15px] font-semibold text-left cursor-pointer transition-colors"
          >
            <Sparkles className="w-4 h-4 shrink-0 text-accent-400" strokeWidth={2.25} aria-hidden />
            {SUMMARY_CHIP}
            <ArrowRight className="ml-auto w-4 h-4 shrink-0 text-white/70" aria-hidden />
          </button>
          <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary-400">Or ask</p>
          <div className="grid grid-cols-1 gap-2">
            {[...new Set(asks)].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPick(c)}
                className="min-h-[48px] text-left px-3.5 py-2.5 rounded-2xl border border-primary-200 bg-white hover:border-primary-400 hover:bg-primary-50 text-[14px] leading-snug font-medium text-primary-800 cursor-pointer transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : (
        chips.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPick(c)}
                className="min-h-[56px] text-left px-3.5 py-2.5 rounded-2xl border border-primary-200 bg-white hover:border-primary-400 hover:bg-primary-50 text-[14px] leading-snug font-medium text-primary-800 cursor-pointer transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/** Small label above each reply, in place of an avatar per bubble. */
function From() {
  return (
    <p className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary-500">
      <Sparkles className="w-3.5 h-3.5 text-accent-500" strokeWidth={2.25} /> TapTurf
    </p>
  );
}

/** Inline sign-in step: the thread stays, the parked message goes once they're in. */
function SignInCard({ pending, onSignIn }: { pending: string | null; onSignIn: () => void }) {
  return (
    <div className="ask-message-in rounded-2xl bg-primary-900 text-white px-4 py-4">
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
  );
}

/** The card layout a reply shows first under its text, when placeholders can stand in for it. */
function cardsOf(res: AskResponse): CardsKind | null {
  if (res.intent === "compare") return res.compare && (res.turfs?.length ?? 0) >= 2 ? "compare" : null;
  if (res.intent === "find_game" && res.games?.length) return "game";
  if ((res.intent === "find_turf" || res.intent === "find_game") && res.turfs?.length) return "turf";
  return null;
}

function TurnView({
  turn,
  isLast,
  onUseLocation,
  locating,
  onRetry,
  onCards,
}: {
  turn: Turn;
  isLast: boolean;
  onUseLocation: () => void;
  locating: boolean;
  onRetry?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Placeholder cards just appeared under this turn. */
  onCards: () => void;
}) {
  // Only a reply that lands while this turn is on screen types in, and only
  // once. Restored history and a reopened panel show plain text.
  const [fresh] = useState(() => !turn.res && !prefersReducedMotion());
  const [typed, setTyped] = useState(false);
  const [shown, setShown] = useState(false);
  // Placeholder cards were on screen for this ask (a Try again starts a
  // new one): they stay where the real cards go and hand over to them as
  // the reply reveals them.
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  // Where the loader's placeholders sat, from the top of the reply text.
  const skelAt = useRef<number | null>(null);
  const live = fresh && !typed && !!turn.res && !turn.res.failed && turn.res.reply.trim() !== "";
  // A newer message went out before it finished: settle now, never replay.
  if (live && !isLast) setTyped(true);
  const typing = live && isLast;
  // Subline and cards are in the page from the start (no jump, screen
  // readers get them at once) and fade in two thirds of the way through.
  const settle = !fresh || !turn.res ? "" : typing && !shown ? "ask-held" : "ask-reveal";
  const ghost = fresh && heldAt === turn.at && !gone && turn.res ? cardsOf(turn.res) : null;
  // The reply text opens up above the placeholders as it lands: they glide
  // down from where they were to where the real cards go, never jump.
  useLayoutEffect(() => {
    const box = textRef.current;
    const el = ghostRef.current;
    const skel = el?.querySelector<HTMLElement>("[data-skel]");
    if (!ghost || !box || !el || !skel || skelAt.current == null) return;
    const dy = skelAt.current - (skel.getBoundingClientRect().top - box.getBoundingClientRect().top);
    if (Math.abs(dy) >= 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" });
  }, [ghost]);
  return (
    <div data-turn className="space-y-4 ask-message-in">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[20px] rounded-br-md bg-primary-900 text-white text-[15px] px-4 py-2.5 leading-snug">{turn.user}</p>
      </div>
      <div>
        <From />
        <div ref={textRef} className="text-[15px] text-primary-900 leading-relaxed">
          {turn.error ? (
            <>
              <span className="text-hot-600">{turn.error}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2.5 flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary-900 hover:bg-accent-600 text-white text-[13px] font-semibold cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.5} /> Try again
                </button>
              )}
            </>
          ) : turn.res ? (
            <>
              <TypingReply text={turn.res.reply} play={typing} onReveal={() => setShown(true)} onDone={() => setTyped(true)} />
              <Subline res={turn.res} className={settle} />
            </>
          ) : (
            <AskThinking
              key={turn.at}
              text={turn.user}
              since={turn.at}
              retry={!!turn.tries}
              onCards={() => {
                // offsetTop: the placeholders are still rising in, and the layout spot is what counts.
                const skel = textRef.current?.querySelector<HTMLElement>("[data-skel]");
                if (skel && textRef.current) skelAt.current = skel.offsetTop - textRef.current.offsetTop;
                setHeldAt(turn.at);
                onCards();
              }}
            />
          )}
        </div>
        {turn.res && (isLast || turn.res.intent !== "other") && (
          <div className="relative">
            <div className={settle}>
              <AskResultBody res={turn.res} onUseLocation={onUseLocation} locating={locating} />
            </div>
            {ghost && (
              // -top-2.5: the body's top margin collapses out of this box; the placeholder keeps its own.
              <div
                ref={ghostRef}
                className={`absolute inset-x-0 -top-2.5 pointer-events-none ${typing && !shown ? "" : "ask-ghost-out"}`}
                onAnimationEnd={(e) => e.target === e.currentTarget && setGone(true)}
              >
                <AskSkeleton kind={ghost} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Subline({ res, className = "" }: { res: Turn["res"] & object; className?: string }) {
  let text = "";
  if (res.failed) text = "Something went wrong on our side. Try again in a moment.";
  else
    switch (res.intent) {
      case "find_turf":
        // Headed rows (the closest names, then the venue named): the headings say what each row is, and a
        // count over them would read as the closest cards' ("1 match." over three that are no match).
        if (res.rows?.length) break;
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
  return <span className={`block mt-1 text-[13px] text-primary-500 ${className}`}>{text}</span>;
}

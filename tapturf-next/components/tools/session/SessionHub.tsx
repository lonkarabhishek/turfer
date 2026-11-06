"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Keyboard, Link2, Loader2, LogIn, Play, Radio, Share2, Users } from "lucide-react";
import { dayLabel } from "@/lib/turfSession/plan";
import { extrasText, leadText, matchLine, tally } from "@/lib/turfSession/tally";
import type { LivePhase } from "./useSessionSync";
import type { Session, SessionMatch } from "@/lib/turfSession/types";
import { Sheet } from "../scorer/ui";
import { ConfirmSheet } from "../scorer/ShareSheet";

export type HubLive = { phase: LivePhase; waiting: number; ready: boolean; url: string | null; onStart: () => void; onRetry: () => void; onLogin: () => void };

/**
 * S3, the session at a glance between matches (or from scoring's X): the
 * running result, the one thing to do next, every match so far, the live
 * link and the end.
 */
export function SessionHub({
  session,
  progress,
  nextFirst,
  storageOk,
  live,
  onContinue,
  onStartNext,
  onSwap,
  onTypeFinal,
  onTeams,
  onOpenMatch,
  onEditFinal,
  onRemove,
  onEnd,
  scoreKept,
}: {
  session: Session;
  /** The match in progress as the scorer has it: "Strikers 23/1 (2.3 ov)", or null before a ball. */
  progress: string | null;
  /** Who bats first in the next match (alternating, or swapped). */
  nextFirst: "a" | "b";
  storageOk: boolean;
  live: HubLive;
  onContinue: () => void;
  onStartNext: () => void;
  onSwap: () => void;
  onTypeFinal: () => void;
  onTeams: () => void;
  onOpenMatch: (m: SessionMatch) => void;
  onEditFinal: (m: SessionMatch) => void;
  onRemove: (m: SessionMatch) => void;
  onEnd: () => void;
  /** Whether a scored match's ball-by-ball scorecard is still on this phone. */
  scoreKept: (m: SessionMatch) => boolean;
}) {
  const [row, setRow] = useState<SessionMatch | null>(null);
  const [removing, setRemoving] = useState<SessionMatch | null>(null);
  const t = tally(session);
  const names = { a: session.sides.a.name, b: session.sides.b.name };
  const cur = session.matches[session.matches.length - 1];
  const inProgress = cur && cur.kind === "balls" && !cur.result ? cur : null;
  const nextN = inProgress ? inProgress.n : session.matches.length + 1;
  const eyebrow = ["Turf session", dayLabel(session.day), session.venue].filter(Boolean).join(" · ").toUpperCase();
  const extras = extrasText(t);

  return (
    <div className="space-y-5">
      {!storageOk && (
        <p role="alert" className="sticky top-16 z-10 rounded-2xl bg-amber-300 text-amber-950 px-4 py-3 text-[14px] font-semibold">
          This browser isn&apos;t saving. Keep this tab open until you share the summary.
        </p>
      )}

      <section className="rounded-3xl bg-primary-900 text-white p-5" aria-label="Session result">
        <p className="text-[12px] font-bold tracking-wide text-accent-300 truncate">{eyebrow}</p>
        <p className="mt-2 font-display text-[30px] sm:text-[36px] leading-tight tracking-tight">
          <span className="break-words">{names.a}</span> <span className="tabular-nums whitespace-nowrap">{t.a} – {t.b}</span> <span className="break-words">{names.b}</span>
        </p>
        {extras && <p className="text-[14px] text-white/80">{extras}</p>}
        <p className="mt-1 text-[16px] font-semibold text-white/90">{leadText(session)}</p>
      </section>

      <div className="space-y-2">
        {inProgress ? (
          <>
            <button type="button" onClick={onContinue} className="press-tight w-full inline-flex items-center justify-center gap-2 h-14 px-6 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
              <Play className="w-5 h-5" aria-hidden /> Continue scoring
            </button>
            <p className="text-center text-[14px] text-primary-700">{progress ? `Match ${inProgress.n} in progress: ${progress}` : `Match ${inProgress.n}: ${names[inProgress.battedFirst]} bat first`}</p>
            {!inProgress.balls && (
              <button type="button" onClick={onSwap} className="mx-auto flex min-h-11 items-center gap-1.5 px-3 text-[14px] font-bold text-accent-700">
                <ArrowLeftRight className="w-4 h-4" aria-hidden /> Swap who bats first
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={onStartNext} className="press-tight w-full inline-flex items-center justify-center gap-2 h-14 px-6 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
              <Play className="w-5 h-5" aria-hidden /> Start match {nextN}
            </button>
            <p className="text-center text-[14px] text-primary-700">
              {names[nextFirst]} bat first ·{" "}
              <button type="button" onClick={onSwap} className="min-h-11 px-1 font-bold text-accent-700 underline underline-offset-2">
                Swap
              </button>
            </p>
          </>
        )}
        {(!inProgress || !inProgress.balls) && (
          <button type="button" onClick={onTypeFinal} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800 hover:border-accent-500">
            <Keyboard className="w-4 h-4" aria-hidden /> Enter match {nextN}&apos;s final score
          </button>
        )}
        <button type="button" onClick={onTeams} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold text-primary-800 hover:bg-primary-50">
          <Users className="w-4 h-4" aria-hidden /> Change teams or overs
        </button>
      </div>

      <section aria-labelledby="hub-matches">
        <h2 id="hub-matches" className="text-[16px] font-bold text-primary-900 mb-2">
          Matches
        </h2>
        {session.matches.length ? (
          <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200 overflow-hidden">
            {session.matches.map((m) => (
              <li key={m.n}>
                <button type="button" onClick={() => setRow(m)} className="w-full min-h-14 px-4 py-2.5 text-left hover:bg-primary-50 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-primary-900 truncate">
                      {m.n} · {m.result ? matchLine(m, names) : m === inProgress ? "In progress" : "Not finished"}
                    </span>
                    <span className="block text-[13px] text-primary-600 truncate">{m.result ? m.result.text : `${names[m.battedFirst]} batting first`}</span>
                  </span>
                  {m.kind === "final" && <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-bold text-primary-700">Typed</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-primary-300 px-4 py-4 text-[14px] text-primary-600">No matches yet. Start match 1, or type its final score.</p>
        )}
      </section>

      {live.ready && <LiveBlock session={session} live={live} />}

      <div className="pt-1">
        <button type="button" onClick={onEnd} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-300 bg-white text-[15px] font-bold text-primary-900 hover:border-primary-500">
          End session
        </button>
        <p className="mt-2 text-[12px] text-primary-600 text-center">
          Kept on this phone. Clearing your browser&apos;s site data removes it.{session.live.code ? " The live page keeps the team names and results." : ""}
        </p>
      </div>

      {row && (
        <Sheet title={`Match ${row.n}`} subtitle={row.result ? row.result.text : "Not finished"} onClose={() => setRow(null)}>
          <div className="space-y-2">
            {row.kind === "balls" ? (
              scoreKept(row) ? (
                <button
                  type="button"
                  onClick={() => {
                    setRow(null);
                    onOpenMatch(row);
                  }}
                  className="press-tight w-full h-14 rounded-full bg-primary-900 text-white text-[16px] font-bold"
                >
                  Open scorecard
                </button>
              ) : (
                <p className="rounded-2xl bg-primary-50 px-4 py-3 text-[14px] text-primary-700">Its ball-by-ball scorecard is no longer on this phone; the score is kept.</p>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRow(null);
                  onEditFinal(row);
                }}
                className="press-tight w-full h-14 rounded-full bg-primary-900 text-white text-[16px] font-bold"
              >
                Edit score
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setRemoving(row);
                setRow(null);
              }}
              className="press-tight w-full h-12 rounded-full text-[15px] font-bold text-red-700 hover:bg-red-50"
            >
              Remove from session
            </button>
          </div>
        </Sheet>
      )}
      {removing && (
        <ConfirmSheet
          title={`Remove match ${removing.n} from the session?`}
          body={`Its score stops counting.${session.live.code ? " It comes off the live link too." : ""}`}
          confirm="Remove"
          danger
          onConfirm={() => {
            onRemove(removing);
            setRemoving(null);
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

const shortLink = (url: string) => {
  const u = url.replace(/^https?:\/\/(www\.)?/, "");
  return u.length > 30 ? `${u.slice(0, 29)}…` : u;
};

/** The live link, in each of its states (spec S3). */
function LiveBlock({ session, live }: { session: Session; live: HubLive }) {
  const [copied, setCopied] = useState(false);
  const box = "rounded-2xl border-2 border-primary-200 p-4";
  const err = session.live.error;
  const fromGame = !!session.game;
  const heading = (
    <h2 className="flex items-center gap-2 text-[16px] font-bold text-primary-900">
      <Radio className="w-4 h-4 text-accent-700" aria-hidden /> Live link
    </h2>
  );
  const btn = "press-tight mt-3 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary-900 text-white text-[15px] font-bold";

  if (err === "taken") {
    return (
      <section className={box}>
        {heading}
        <p className="mt-1 text-[14px] leading-snug text-primary-800">Another phone is already putting this game&apos;s score on the game page. Your session stays on this phone.</p>
        {session.live.follow && (
          <Link href={`/tournament/${session.live.follow}`} className={btn}>
            Follow the score
          </Link>
        )}
      </section>
    );
  }
  if (err === "login") {
    return (
      <section className={box}>
        {heading}
        <p className="mt-1 text-[14px] leading-snug text-primary-800">Log in again to show this on the game page.</p>
        <button type="button" onClick={live.onLogin} className={btn}>
          <LogIn className="w-4 h-4" aria-hidden /> Log in
        </button>
      </section>
    );
  }
  if (err === "not_in_game") {
    return (
      <section className={box}>
        {heading}
        <p className="mt-1 text-[14px] leading-snug text-primary-800">Only the host and players in the game can show it on the game page.</p>
      </section>
    );
  }
  if (err === "stopped") {
    return (
      <section className={box}>
        {heading}
        <p className="mt-1 text-[14px] leading-snug text-primary-800">Live link stopped. Your session is still saved here.</p>
      </section>
    );
  }
  if (err === "limit" || err === "busy" || err === "failed") {
    return (
      <section className={box}>
        {heading}
        <p role="status" className="mt-1 text-[14px] leading-snug text-primary-800">
          {err === "failed" ? "The live link couldn't take that change. Your session is saved here; try again." : "Too many live links from this network right now. Your session is saved here; try again later."}
        </p>
        <button type="button" onClick={live.onRetry} className={btn}>
          Try again
        </button>
      </section>
    );
  }
  if (live.phase === "creating") {
    return (
      <section className={box} aria-busy="true">
        {heading}
        <p role="status" className="mt-2 min-h-11 flex items-center gap-2 text-[15px] font-semibold text-primary-800">
          <Loader2 className="w-5 h-5 text-accent-600 animate-spin" aria-hidden /> Getting your link…
        </p>
      </section>
    );
  }
  if (!session.live.code || !live.url) {
    return (
      <section className={box}>
        {heading}
        <p className="mt-1 text-[14px] leading-snug text-primary-800">{fromGame ? "Shows on the game page once match 1 is over." : "Let friends follow: one link with the running result and every match. No app needed."}</p>
        <button type="button" onClick={live.onStart} className={btn}>
          <Radio className="w-4 h-4" aria-hidden /> {fromGame ? "Share a live link now" : "Share a live link"}
        </button>
        <p className="mt-2 text-[12px] leading-snug text-primary-600">
          The team names and results go on a page anyone with the link can see; player names stay on this phone.{" "}
          <a href="/privacy#live-tournaments" target="_blank" rel="noopener" className="font-semibold text-accent-700 underline underline-offset-2">
            Privacy
          </a>
        </p>
      </section>
    );
  }
  const url = live.url;
  const share = async () => {
    const text = `Follow ${session.sides.a.name} v ${session.sides.b.name}, every match: ${url}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
    } catch {
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className={box}>
      {heading}
      <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-primary-900">
        <span className={`w-2 h-2 rounded-full shrink-0 ${live.phase === "waiting" ? "bg-amber-400" : "bg-green-500"}`} aria-hidden />
        <span className="min-w-0 truncate">Live link on · {shortLink(url)}</span>
      </p>
      {fromGame && <p className="mt-0.5 pl-4 text-[13px] text-primary-600">Also on the game page.</p>}
      {live.phase === "waiting" && live.waiting > 0 && (
        <p role="status" className="mt-2 text-[14px] font-semibold text-amber-800">
          Not sent yet: {live.waiting} result{live.waiting === 1 ? "" : "s"}. They go when you&apos;re back online.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={share} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full bg-accent-500 text-white text-[15px] font-bold hover:bg-accent-600">
          <Share2 className="w-4 h-4" aria-hidden /> Share
        </button>
        <button type="button" onClick={copy} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Link2 className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </section>
  );
}

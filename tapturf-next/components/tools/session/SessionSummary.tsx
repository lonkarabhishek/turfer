"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, ImageIcon, MessageCircle, Plus, RotateCcw } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";
import { dayLabel } from "@/lib/turfSession/plan";
import { cardLines, summaryText } from "@/lib/turfSession/share";
import { batText, bowlText, hasNames, topBatters, topBowlers } from "@/lib/turfSession/stats";
import { extrasText, matchLine, tally, verdict } from "@/lib/turfSession/tally";
import type { Session, SessionMatch } from "@/lib/turfSession/types";
import { ShareSheet } from "../scorer/ShareSheet";
import { ToolCta } from "../ToolCta";
import { cardBlob, drawSessionCard } from "./drawSessionCard";

export const SESSION_TOOL = "turf_session";

/**
 * S7: the session's end. The result huge, every match, the stars when
 * players were named, and the picture and text to send the group.
 */
export function SessionSummary({
  session,
  liveUrl,
  cta,
  onNew,
  onReopen,
  onOpenMatch,
  scoreKept,
}: {
  session: Session;
  liveUrl: string | null;
  cta: { label: string; href: string };
  onNew: () => void;
  onReopen: () => void;
  onOpenMatch: (m: SessionMatch) => void;
  scoreKept: (m: SessionMatch) => boolean;
}) {
  const t = tally(session);
  const names = { a: session.sides.a.name, b: session.sides.b.name };
  const done = session.matches.filter((m) => !!m.result);
  const named = hasNames(session);
  const bats = topBatters(session);
  const bowls = topBowlers(session);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState(false);
  const [note, setNote] = useState("");
  const eyebrow = ["Final", dayLabel(session.day), session.venue].filter(Boolean).join(" · ").toUpperCase();

  useEffect(() => {
    if (canvas.current) drawSessionCard(canvas.current, cardLines(session));
  }, [session]);

  const sharePicture = async () => {
    const cv = canvas.current;
    if (!cv) return;
    drawSessionCard(cv, cardLines(session));
    const blob = await cardBlob(cv);
    if (!blob) return;
    trackTool("tool_result_generated", SESSION_TOOL, { action: "share_card", matches: done.length });
    const file = new File([blob], `turf-session-${session.day}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: `${t.line}${liveUrl ? `\n${liveUrl}` : ""}` });
      } catch {
        /* closed the share sheet */
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setNote("Saved the picture. Send it from your gallery.");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-primary-900 text-white p-5 text-center" aria-label="Session result">
        <p className="text-[12px] font-bold tracking-wide text-accent-300">{eyebrow}</p>
        <h2 className="mt-2 text-[22px] font-bold">{verdict(session)}</h2>
        <p className="mt-2 font-display text-[64px] leading-none tabular-nums whitespace-nowrap" aria-label={t.line}>
          {t.a} – {t.b}
        </p>
        {/* The names under their own score: side by side, each cut to its half, never broken mid-word. */}
        <div className="mt-1.5 grid grid-cols-2 gap-3 text-[16px] font-bold" aria-hidden>
          <span className="text-right truncate">{names.a}</span>
          <span className="text-left truncate">{names.b}</span>
        </div>
        {extrasText(t) && <p className="mt-1 text-[14px] text-white/80">{extrasText(t)}</p>}
        <p className="mt-2 text-[14px] text-white/80">
          {done.length} match{done.length === 1 ? "" : "es"} · {session.overs} overs a match
        </p>
      </section>

      <div className="grid gap-2">
        <button type="button" onClick={sharePicture} className="press-tight w-full inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
          <ImageIcon className="w-5 h-5" aria-hidden /> Share the picture
        </button>
        <button type="button" onClick={() => setText(true)} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800">
          <MessageCircle className="w-4 h-4" aria-hidden /> Send as text
        </button>
        {liveUrl && (
          <a href={liveUrl.replace(/^https:\/\/www\.tapturf\.in/, "")} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800">
            <ExternalLink className="w-4 h-4" aria-hidden /> See the live page
          </a>
        )}
        <p className="min-h-5 text-center text-[13px] text-primary-700" aria-live="polite">
          {note}
        </p>
      </div>

      <section aria-labelledby="sum-matches">
        <h3 id="sum-matches" className="text-[16px] font-bold text-primary-900 mb-2">
          Every match
        </h3>
        <ol className="divide-y divide-primary-100 rounded-2xl border border-primary-200 overflow-hidden">
          {done.map((m) => {
            const open = m.kind === "balls" && scoreKept(m);
            const body = (
              <>
                <span className="block text-[15px] font-semibold text-primary-900">
                  {m.n} · {m.result!.text}
                </span>
                <span className="block text-[13px] text-primary-600">{matchLine(m, names)}</span>
              </>
            );
            return (
              <li key={m.n}>
                {open ? (
                  <button type="button" onClick={() => onOpenMatch(m)} className="w-full min-h-14 px-4 py-2.5 text-left hover:bg-primary-50">
                    {body}
                  </button>
                ) : (
                  <div className="px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
          {!done.length && <li className="px-4 py-3 text-[14px] text-primary-600">No match finished.</li>}
        </ol>
      </section>

      {named ? (
        <section aria-labelledby="sum-stars" className="grid sm:grid-cols-2 gap-3">
          <h3 id="sum-stars" className="sr-only">
            Stars
          </h3>
          <div className="rounded-2xl bg-primary-50 p-4">
            <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">Top run scorers</p>
            <ol className="mt-1 space-y-1">
              {bats.map((b) => (
                <li key={b.name} className="text-[15px] font-semibold text-primary-900">
                  {batText(b)}
                </li>
              ))}
              {!bats.length && <li className="text-[14px] text-primary-600">No runs scored ball by ball.</li>}
            </ol>
          </div>
          <div className="rounded-2xl bg-primary-50 p-4">
            <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">Top wicket takers</p>
            <ol className="mt-1 space-y-1">
              {bowls.map((b) => (
                <li key={b.name} className="text-[15px] font-semibold text-primary-900">
                  {bowlText(b)}
                </li>
              ))}
              {!bowls.length && <li className="text-[14px] text-primary-600">No wickets yet.</li>}
            </ol>
          </div>
          <p className="sm:col-span-2 text-[12px] text-primary-600">From the matches scored ball by ball.</p>
        </section>
      ) : (
        <p className="text-[14px] text-primary-600">Name players next time to see the top scorers.</p>
      )}

      <div className="grid gap-2">
        <button type="button" onClick={onNew} className="press-tight w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary-900 text-white text-[15px] font-bold">
          <Plus className="w-4 h-4" aria-hidden /> Start a new session
        </button>
        <button type="button" onClick={onReopen} className="mx-auto inline-flex min-h-11 items-center gap-1.5 px-3 text-[14px] font-bold text-accent-700">
          <RotateCcw className="w-4 h-4" aria-hidden /> Reopen the session
        </button>
      </div>

      <figure className="rounded-2xl border border-primary-200 bg-primary-50 p-3">
        <canvas ref={canvas} width={1080} height={1350} className="block w-full h-auto rounded-xl" aria-label={`Picture: ${t.line}, ${verdict(session)}`} role="img" />
        <figcaption className="mt-2 text-center text-[12px] text-primary-600">The picture Share sends</figcaption>
      </figure>

      {session.turf ? (
        <div className="mt-2">
          <Link href={`/game/create?turf=${encodeURIComponent(session.turf.id)}&turfName=${encodeURIComponent(session.turf.name)}`} onClick={() => trackTool("tool_cta_clicked", SESSION_TOOL, { href: "/game/create" })} className="press-tight inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-semibold hover:bg-accent-600 transition-colors">
            Play here again? Host your next game
          </Link>
        </div>
      ) : (
        <ToolCta tool={SESSION_TOOL} label={cta.label} href={cta.href} />
      )}

      {text && (
        <ShareSheet
          text={summaryText(session, liveUrl)}
          title="Share the result"
          onShared={(how) => trackTool("tool_cta_clicked", SESSION_TOOL, { href: "share", how })}
          onClose={() => setText(false)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { Lock, Plus } from "lucide-react";
import { PLAY_AGAIN, type Score } from "@/lib/reviews/catalog";
import { contactProblem, NOTE_MAX, TIP_COUNTER_FROM, TIP_MAX } from "@/lib/reviews/screen";
import { rupees, type PriceChip } from "@/lib/reviews/sheet";
import { Pill, ScorePill } from "../ui";

export const CONTACT_MESSAGE = "Please take out phone numbers, emails and links. The turf's contact is already on this page.";

/**
 * Screen 3, "Last bit", all optional: would they play here again, what they
 * paid (only while the turf has fewer than 3 player prices), a one-line tip
 * for the next team, and a private note for the owner. The note sits in the
 * same place at every star rating and is never offered instead of the
 * public report.
 */
export function WrapUp({
  playAgain,
  onPlayAgain,
  price,
  onPrice,
  priceOther,
  onPriceOther,
  priceAsk,
  comment,
  onComment,
  prompt,
  noteOpen,
  onNoteOpen,
  note,
  onNote,
  showName,
  onShowName,
  claimed,
  userName,
  flagged,
}: {
  playAgain: Score | null;
  onPlayAgain: (v: Score | null) => void;
  price: number | null;
  onPrice: (v: number | null) => void;
  priceOther: string;
  onPriceOther: (v: string) => void;
  /** null: don't ask. mine: the price they shared before, marked. */
  priceAsk: { chips: PriceChip[]; mine: number | null } | null;
  comment: string;
  onComment: (v: string) => void;
  /** What to write about, from their taps ("You flagged the lights. ..."): shown above the box, not as a faint placeholder. */
  prompt: string;
  noteOpen: boolean;
  onNoteOpen: () => void;
  note: string;
  onNote: (v: string) => void;
  showName: boolean;
  onShowName: (v: boolean) => void;
  claimed: boolean;
  userName: string | null;
  /** The server refused this field for contact details. */
  flagged: "comment" | "note" | null;
}) {
  const tipRef = useRef<HTMLTextAreaElement>(null);
  // The tip grows from one line to four as they type.
  useEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 4 * 24 + 22)}px`;
  }, [comment]);

  const tipBad = flagged === "comment" || !!contactProblem(comment);
  const noteBad = flagged === "note" || !!contactProblem(note);
  const chips = priceAsk ? withMine(priceAsk.chips, priceAsk.mine) : [];
  const otherOn = price === null && priceOther !== "";

  return (
    <div className="pt-1 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold text-primary-900 leading-tight">Last bit</h2>
        <span className="text-[13px] text-primary-500">All optional.</span>
      </div>

      <section className="mt-4">
        <p className="text-[14px] font-semibold text-primary-900 mb-2">Would you play here again?</p>
        <div className="flex gap-2">
          {PLAY_AGAIN.map((p) => (
            <ScorePill key={p.id} score={p.id} on={playAgain === p.id} onClick={() => onPlayAgain(playAgain === p.id ? null : p.id)}>
              {p.label}
            </ScorePill>
          ))}
        </div>
      </section>

      {priceAsk && (
        <section className="mt-5">
          <p className="text-[14px] font-semibold text-primary-900">What did you pay for an hour?</p>
          <p className="text-[12px] text-primary-500 mb-2">For the whole turf. Shows under From players prices.</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Pill key={c.amount} on={price === c.amount} onClick={() => { onPriceOther(""); onPrice(price === c.amount ? null : c.amount); }}>
                {rupees(c.amount)}
                {c.listed && <span className={`text-[11px] font-medium ${price === c.amount ? "text-white/70" : "text-primary-500"}`}>listed</span>}
                {c.yours && <span className={`text-[11px] font-medium ${price === c.amount ? "text-white/70" : "text-primary-500"}`}>(you shared this)</span>}
              </Pill>
            ))}
            <Pill on={otherOn} onClick={() => { onPrice(null); onPriceOther(otherOn ? "" : " "); }}>
              Other
            </Pill>
          </div>
          {otherOn && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-[15px] text-primary-800">
                <span>₹</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={priceOther.trim()}
                  // A space keeps "Other" open while the box is empty.
                  onChange={(e) => onPriceOther(e.target.value.replace(/\D/g, "").slice(0, 5) || " ")}
                  placeholder="____"
                  aria-label="Rupees per hour"
                  className="w-28 h-11 rounded-xl bg-primary-100 px-3 text-[16px] text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                />
                <span className="text-primary-500">per hour</span>
              </label>
              {priceOther.trim() !== "" && otherPrice(priceOther) === null && (
                <p className="mt-1 text-[12px] text-hot-600">Between ₹100 and ₹20,000 an hour.</p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-5">
        <label htmlFor="report-tip" className="text-[14px] font-semibold text-primary-900">
          Tip for the next team
        </label>
        <p id="report-tip-prompt" className="mt-0.5 text-[13px] text-primary-600">{prompt}</p>
        <textarea
          id="report-tip"
          ref={tipRef}
          rows={1}
          value={comment}
          maxLength={TIP_MAX}
          onChange={(e) => onComment(e.target.value)}
          placeholder="Type here, or leave it"
          aria-invalid={tipBad}
          aria-describedby="report-tip-prompt report-tip-help"
          className={`mt-2 w-full resize-none rounded-xl bg-primary-100 px-4 py-3 text-[16px] leading-6 text-primary-900 placeholder:text-primary-500 focus:outline-none focus:ring-2 ${
            tipBad ? "ring-2 ring-hot-500 focus:ring-hot-500" : "focus:ring-accent-500/40"
          }`}
        />
        <div id="report-tip-help" className="mt-1 flex items-start justify-between gap-3 text-[12px]">
          <span className={tipBad ? "text-hot-600" : "text-primary-500"}>{tipBad ? CONTACT_MESSAGE : "English, Hindi, Marathi or Hinglish. No phone numbers or links."}</span>
          {comment.length >= TIP_COUNTER_FROM && <span className="shrink-0 tabular-nums text-primary-500">{comment.length}/{TIP_MAX}</span>}
        </div>
      </section>

      <section className="mt-5">
        {!noteOpen ? (
          <button type="button" onClick={onNoteOpen} className="press-tight min-h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-700 hover:text-accent-800">
            <Plus className="w-4 h-4" aria-hidden /> Private note for the owner
          </button>
        ) : (
          <div className="rounded-2xl border border-primary-200 p-4 report-chips-in">
            <label htmlFor="report-note" className="flex items-center gap-1.5 text-[14px] font-semibold text-primary-900">
              <Lock className="w-4 h-4 text-primary-500" aria-hidden /> Private note for the owner
            </label>
            <textarea
              id="report-note"
              rows={3}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => onNote(e.target.value)}
              placeholder="Something you'd tell the owner, not everyone. e.g. The light near the gate is off."
              aria-invalid={noteBad}
              className={`mt-2 w-full resize-none rounded-xl bg-primary-100 px-4 py-3 text-[16px] leading-6 text-primary-900 placeholder:text-primary-500 focus:outline-none focus:ring-2 ${
                noteBad ? "ring-2 ring-hot-500 focus:ring-hot-500" : "focus:ring-accent-500/40"
              }`}
            />
            <p className={`mt-1 text-[12px] ${noteBad ? "text-hot-600" : "text-primary-500"}`}>
              {noteBad ? CONTACT_MESSAGE : "Only the turf's owner and TapTurf see this. It never shows on the page."}
            </p>
            {!claimed && <p className="mt-1 text-[12px] text-primary-500">This turf&apos;s owner isn&apos;t on TapTurf yet. We&apos;ll keep your note for when they join.</p>}
            <label className="mt-3 flex items-center justify-between gap-3 min-h-11 cursor-pointer">
              <span className="text-[14px] text-primary-800">Show my name to the owner</span>
              <input
                type="checkbox"
                role="switch"
                checked={showName}
                aria-checked={showName}
                onChange={(e) => onShowName(e.target.checked)}
                className="peer sr-only"
              />
              <span aria-hidden className={`relative w-11 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/50 ${showName ? "bg-accent-500" : "bg-primary-300"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showName ? "translate-x-5" : ""}`} />
              </span>
            </label>
            {!showName && (
              <p className="text-[12px] text-primary-500">
                They&apos;ll see &ldquo;A player&rdquo;. Notes without a name reach the owner only in batches of three or more, so the timing doesn&apos;t give you away. What you write still might.
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-5 text-[12px] text-primary-500 leading-snug">
        {userName ? `Posting as ${userName}. ` : ""}Your name, stars, taps and tip are public. The private note never is.
      </p>
    </div>
  );
}

/** The rupees typed after Other, when it is a sensible hourly rate. */
export function otherPrice(typed: string): number | null {
  const n = Number(typed.trim());
  return Number.isInteger(n) && n >= 100 && n <= 20_000 ? n : null;
}

/** The chips, with the price they shared before marked (added first when it isn't one of them). */
function withMine(chips: PriceChip[], mine: number | null): (PriceChip & { yours?: boolean })[] {
  if (!mine) return chips;
  if (chips.some((c) => c.amount === mine)) return chips.map((c) => (c.amount === mine ? { ...c, yours: true } : c));
  return [{ amount: mine, yours: true }, ...chips];
}

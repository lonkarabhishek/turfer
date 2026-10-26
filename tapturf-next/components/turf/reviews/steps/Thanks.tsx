"use client";

import { Send } from "lucide-react";
import { dayWords, shareText } from "@/lib/reviews/sheet";
import type { ReviewWithUser } from "@/types/review";
import { ReviewRow } from "../ReviewRow";
import { monthYear } from "../ui";

/**
 * Screen 4: posted. The row exactly as the page will show it, one line on
 * what the report just changed (lib/reviews/unlock.ts), when the note
 * reaches the owner, and "Send to your team" with the 20-second link.
 * Recognition only: no points, no rewards.
 */
export function Thanks({
  firstName,
  edited,
  held,
  preview,
  turfSports,
  unlock,
  note,
  turfName,
  slug,
  onDone,
}: {
  firstName: string;
  /** An edit, not a new report or one posted again. */
  edited: boolean;
  /** Waiting for a check before it shows (status held). */
  held: boolean;
  preview: ReviewWithUser;
  turfSports: readonly string[];
  unlock: string;
  note: { delivers: "tomorrow" | "batch" | "on_claim"; at: string | null } | null;
  turfName: string;
  slug: string;
  onDone: () => void;
}) {
  const share = async () => {
    const { text, url, message } = shareText(turfName, slug);
    try {
      if (navigator.share) {
        // The link goes in url only: the share sheet adds it after the text itself.
        await navigator.share({ title: turfName, text, url });
        return;
      }
    } catch {
      return; // they closed the share sheet
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };
  const noteLine = !note
    ? null
    : note.delivers === "on_claim"
      ? "We'll keep your note for the owner."
      : note.delivers === "batch" || !note.at
        ? "Your note goes to the owner together with other players' notes, so it can't be traced to you."
        : dayWords(note.at, new Date(), false) === "today"
          ? "Your note reaches the owner at 9 this morning."
          : "Your note reaches the owner tomorrow morning.";

  return (
    <div className="pt-4 pb-4" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <div className="report-pop w-16 h-16 rounded-full bg-accent-500 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-8 h-8" aria-hidden>
            <path className="report-tick" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-4 text-[22px] font-bold text-primary-900">
          {held ? `Thanks${firstName ? `, ${firstName}` : ""}. We'll check it first.` : edited ? "Saved." : `Posted. Thanks${firstName ? `, ${firstName}` : ""}!`}
        </h2>
        <p className="mt-1 text-[15px] text-primary-500">
          {held
            ? "Reports from turf owners, and many at once on one turf, are checked before they show. Yours goes on the page once it's through."
            : edited
              ? preview.edited_at
                ? `Your report now shows Updated ${monthYear(preview.edited_at)}.`
                : "Your report is up to date."
              : "That helps the next team pick right."}
        </p>
      </div>

      <div className="mt-5">
        <ReviewRow r={preview} turfSports={turfSports} hydrated mine preview />
      </div>

      {!edited && !held && <p className="mt-4 rounded-2xl bg-accent-50 px-4 py-3 text-[14px] font-medium text-accent-800">{unlock}</p>}
      {noteLine && <p className="mt-3 text-[13px] text-primary-600">{noteLine}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={share}
          className="press-tight flex-1 min-h-12 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" aria-hidden /> Send to your team
        </button>
        <button type="button" onClick={onDone} className="press-tight min-h-12 px-6 rounded-full bg-primary-100 hover:bg-primary-200 text-primary-900 text-[15px] font-semibold">
          Done
        </button>
      </div>
    </div>
  );
}

"use client";

import { BadgeCheck, ChevronUp, ExternalLink, User } from "lucide-react";
import { playAgainWords, SHOW_GAME_BADGE, starWord } from "@/lib/reviews/catalog";
import type { ReviewWithUser } from "@/types/review";
import { monthYear, playedLine, ReportChips, StarsShown } from "./ui";

/**
 * One review on the turf page. A TapTurf report reads as its stars and
 * word, what and when they played, the parts they rated as chips, whether
 * they'd play again and their tip: a report with taps and no text still
 * says something. The 14 reviews from before game reports have none of
 * that and show as they always did. Google rows are unchanged.
 */
export function ReviewRow({
  r,
  turfSports,
  hydrated,
  mine,
  voted,
  onVote,
  footer,
  preview,
}: {
  r: ReviewWithUser;
  turfSports: readonly string[];
  /** Dates read the visitor's clock: only after hydration. */
  hydrated: boolean;
  /** The viewer's own report: no Helpful button. */
  mine?: boolean;
  voted?: boolean;
  onVote?: (id: string) => void;
  /** Edit and Remove, on the viewer's own report. */
  footer?: React.ReactNode;
  /** The thank-you screen's preview: no Helpful row. */
  preview?: boolean;
}) {
  const google = !!r.source;
  const played = google ? "" : playedLine(r.sport, r.played_when);
  const date = google ? r.source_date_label || "on Google" : hydrated ? (r.edited_at ? `Updated ${monthYear(r.edited_at)}` : monthYear(r.created_at)) : " ";
  const again = google ? null : playAgainWords(r.play_again);

  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-4">
      <div className="flex items-center gap-3">
        {r.user_avatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={r.user_avatar} alt="" className="w-9 h-9 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
            <User className="w-4 h-4 text-primary-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary-800 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{google ? r.author_name || "Google user" : r.user_name || "TapTurf player"}</span>
            {google && <GoogleBadge href={r.author_url || r.source_url} />}
            {!google && SHOW_GAME_BADGE && r.verified_via === "game" && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Played in a TapTurf game
              </span>
            )}
          </p>
          <p className="text-[12px] text-primary-500 flex flex-wrap items-center gap-x-1.5">
            <StarsShown n={r.rating} size="w-3.5 h-3.5" />
            {!google && <span className="font-semibold text-primary-700">{starWord(r.rating)}</span>}
            {played && <span>· {played}</span>}
            <span className="text-primary-400">· {date}</span>
          </p>
        </div>
      </div>

      {!google && <ReportChips aspects={r.aspects} sport={r.sport} turfSports={turfSports} />}
      {again && <p className={`mt-2 text-[13px] font-medium ${r.play_again === -1 ? "text-hot-600" : "text-primary-700"}`}>{again}</p>}
      {r.comment && <p className="mt-2 text-[15px] leading-snug text-primary-700 whitespace-pre-line">{r.comment}</p>}

      {!google && !mine && !preview && onVote && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onVote(r.id)}
            aria-pressed={!!voted}
            aria-label={voted ? "Remove your Helpful vote" : "Mark this report helpful"}
            className={`press-tight inline-flex items-center gap-1.5 rounded-full border px-3.5 min-h-11 text-xs font-bold transition-colors ${
              voted ? "bg-accent-500 border-accent-500 text-white hover:bg-accent-600" : "bg-white border-primary-200 text-primary-700 hover:border-accent-400 hover:text-accent-700"
            }`}
          >
            <ChevronUp className="w-4 h-4" strokeWidth={voted ? 3 : 2.5} />
            <span>Helpful</span>
            {r.upvotes > 0 && <span className={`tabular-nums ${voted ? "text-white" : "text-primary-500"}`}>· {r.upvotes}</span>}
          </button>
        </div>
      )}
      {footer}
    </div>
  );
}

/** Small "Google" tag next to an imported reviewer's name, linking out when we have a URL. */
function GoogleBadge({ href }: { href: string | null | undefined }) {
  const cls = "shrink-0 inline-flex items-center gap-0.5 rounded-full border border-primary-200 bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-500";
  if (!href) return <span className={cls}>Google</span>;
  return (
    <a href={href} target="_blank" rel="noopener nofollow" className={`${cls} hover:border-accent-400 hover:text-accent-700`} onClick={(e) => e.stopPropagation()}>
      Google <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

"use client";

import { useState } from "react";
import { BadgeCheck, ChevronUp, ExternalLink, Flag } from "lucide-react";
import { playAgainWords, SHOW_GAME_BADGE, starWord } from "@/lib/reviews/catalog";
import { reviewPhotoUrl } from "@/lib/reviews/photos";
import type { ReviewWithUser } from "@/types/review";
import { monthYear, playedLine, ReportChips, StarsShown } from "./ui";
import { PhotoViewer } from "./PhotoViewer";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { UserAvatar } from "@/components/account/UserAvatar";

/** What Played here (verified) means, on the badge and when it is tapped. */
export const PLAYED_HERE_HELP = "Played a TapTurf game here";

/**
 * One review on the turf page. A TapTurf report reads as its stars and
 * word, what and when they played, a Community review line (with Played
 * here (verified) when its author played a TapTurf game here), the parts
 * they rated as chips, whether they'd play again, their tip and photos
 * from the game: a report with taps and no text still says something. The
 * 14 reviews from before game reports have none of that and show as they
 * always did. Google rows are unchanged.
 */
export function ReviewRow({
  r,
  turfSports,
  hydrated,
  mine,
  voted,
  onVote,
  onFlag,
  flagged,
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
  /** Report this review: on someone else's TapTurf report, where the database takes reports. */
  onFlag?: (r: ReviewWithUser) => void;
  /** This viewer reported it. */
  flagged?: boolean;
  /** Edit and Remove, on the viewer's own report. */
  footer?: React.ReactNode;
  /** The thank-you screen's preview: no Helpful row. */
  preview?: boolean;
}) {
  const [help, setHelp] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const google = !!r.source;
  const name = google ? r.author_name || "Google user" : r.user_name || "TapTurf player";
  const played = google ? "" : playedLine(r.sport, r.played_when);
  const date = google ? r.source_date_label || "on Google" : hydrated ? (r.edited_at ? `Updated ${monthYear(r.edited_at)}` : monthYear(r.created_at)) : " ";
  const again = google ? null : playAgainWords(r.play_again);
  const photos = !google && Array.isArray(r.photos) ? r.photos : [];
  const showVote = !google && !mine && !preview && !!onVote;
  const showFlag = !google && !mine && !preview && !!onFlag;

  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-4">
      <div className="flex items-center gap-3">
        <UserAvatar src={r.user_avatar} name={name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary-800 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{name}</span>
            {/* Read after hydration, never baked into the cached turf page: a tick that ends goes at once. */}
            {!google && <VerifiedTickFor id={r.user_id} />}
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

      {/* Every TapTurf report is a community review; one whose author played a TapTurf game here says so (worked out by the database). */}
      {!google && (
        <div className="mt-2 text-[12px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-primary-500">Community review</span>
            {r.played_here === true && (
              <button
                type="button"
                onClick={() => setHelp((h) => !h)}
                aria-expanded={help}
                title={PLAYED_HERE_HELP}
                className="press-tight relative inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 font-semibold text-accent-700 hover:bg-accent-100 after:absolute after:-inset-2 after:content-['']"
              >
                <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Played here (verified)
              </button>
            )}
          </p>
          {help && r.played_here === true && <p className="mt-1 text-primary-600">{PLAYED_HERE_HELP}, before writing this.</p>}
        </div>
      )}

      {!google && <ReportChips aspects={r.aspects} sport={r.sport} turfSports={turfSports} />}
      {again && <p className={`mt-2 text-[13px] font-medium ${r.play_again === -1 ? "text-hot-600" : "text-primary-700"}`}>{again}</p>}
      {r.comment && <p className="mt-2 text-[15px] leading-snug text-primary-700 whitespace-pre-line">{r.comment}</p>}

      {photos.length > 0 && (
        <ul className="mt-3 flex gap-2" aria-label="Photos from the game">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setViewing(i)}
                aria-label={`Open photo ${i + 1} of ${photos.length}`}
                className="press-tight block w-16 h-16 rounded-xl overflow-hidden bg-primary-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reviewPhotoUrl(p.thumb)} alt="" width={64} height={64} loading="lazy" decoding="async" className="w-16 h-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing !== null && <PhotoViewer photos={photos} start={viewing} who={name} onClose={() => setViewing(null)} />}

      {(showVote || showFlag) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {showVote ? (
            <button
              type="button"
              onClick={() => onVote!(r.id)}
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
          ) : (
            <span />
          )}
          {showFlag &&
            (flagged ? (
              <span className="inline-flex min-h-11 items-center gap-1 px-2 text-[12px] font-semibold text-primary-500">
                <Flag className="w-3.5 h-3.5" aria-hidden /> Reported
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onFlag!(r)}
                aria-label="Report this review"
                className="press-tight inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-primary-500 hover:text-hot-600"
              >
                <Flag className="w-3.5 h-3.5" aria-hidden /> Report
              </button>
            ))}
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

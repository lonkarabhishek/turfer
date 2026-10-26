import { ExternalLink, Star } from "lucide-react";

export type PlayersSay = { summary: string; likes: string[]; gripes: string[]; based_on: number; sources: string[] };

/** What players say: two sentences from the written reviews we hold (Google and TapTurf), made by the admin pass. */
export function PlayersSayCard({ playersSay }: { playersSay: PlayersSay }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500 mb-1.5">What players say</p>
      {playersSay.summary && <p className="text-[15px] text-primary-900 leading-snug">{playersSay.summary}</p>}
      {(playersSay.likes.length > 0 || playersSay.gripes.length > 0) && (
        <div className={`${playersSay.summary ? "mt-3" : ""} grid sm:grid-cols-2 gap-3`}>
          {playersSay.likes.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-accent-700 mb-1">What players like</p>
              <ul className="space-y-1">
                {playersSay.likes.map((l) => (
                  <li key={`l-${l}`} className="flex gap-1.5 text-[14px] text-primary-800 leading-snug">
                    <span aria-hidden className="text-accent-600">+</span> {l}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {playersSay.gripes.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-amber-800 mb-1">Common complaints</p>
              <ul className="space-y-1">
                {playersSay.gripes.map((g) => (
                  <li key={`g-${g}`} className="flex gap-1.5 text-[14px] text-primary-800 leading-snug">
                    <span aria-hidden className="text-amber-700">&minus;</span> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-2.5 text-[11px] text-primary-400">
        {playersSay.based_on > 0
          ? `Summarised by TapTurf from ${playersSay.based_on} written ${playersSay.sources.join(" and ")} review${playersSay.based_on === 1 ? "" : "s"}.`
          : `Summarised by TapTurf from ${playersSay.sources.join(" and ")} reviews.`}
      </p>
    </div>
  );
}

/**
 * Google's public rating, shown whatever TapTurf reports there are: the
 * fastest social proof on any turf page. A score without a review count is
 * still a score (14 Pune turfs); only the count line is hidden then.
 */
export function GoogleCard({ rating, count, url }: { rating: number; count: number | null | undefined; url: string | null | undefined }) {
  const hasCount = typeof count === "number" && count > 0;
  return (
    <a
      href={url || undefined}
      target={url ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={`press-tight flex items-center gap-4 rounded-2xl border border-primary-200 bg-white p-4 mt-4 ${url ? "hover:border-accent-400 hover:bg-accent-50/30" : ""} transition-colors`}
    >
      <div className="flex flex-col items-center justify-center rounded-xl bg-accent-50 border border-accent-200 px-4 py-3 min-w-[68px]">
        <span className="font-display text-2xl leading-none text-accent-700">{Number(rating).toFixed(1)}</span>
        <div className="flex items-center gap-0.5 mt-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className={`w-3 h-3 ${i < Math.round(rating || 0) ? "fill-accent-500 text-accent-500" : "fill-none text-accent-300"}`} />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-primary-500">Rated on Google</p>
        <p className="text-primary-800 font-semibold leading-tight">
          {hasCount ? `${count!.toLocaleString("en-IN")} Google review${count === 1 ? "" : "s"}` : "Google rating"}
        </p>
        {url && (
          <p className="text-xs text-accent-600 font-semibold mt-0.5 inline-flex items-center gap-1">
            Read them on Google
            <ExternalLink className="w-3 h-3" />
          </p>
        )}
      </div>
    </a>
  );
}

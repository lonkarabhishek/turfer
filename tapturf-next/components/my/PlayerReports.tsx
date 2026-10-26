"use client";

import { Lock, Star, Wrench } from "lucide-react";
import { ASPECT_ORDER, aspectShort, playAgainWords, tagLabel } from "@/lib/reviews/catalog";
import { BAR_MIN, playAgainLine } from "@/lib/reviews/insights";
import type { OwnerReviews } from "@/lib/my/client";
import { playedLine, ReportChips } from "@/components/turf/reviews/ui";

/**
 * "Player reports" on /my › a turf: what TapTurf players said in the last
 * 90 days, from owner_dashboard (no new call, no new way in). What to fix
 * first works from the very first report, since every report is public
 * anyway; private notes are anonymous unless the player chose otherwise,
 * arrive at the next 09:00 and never link to a report. Owners can't hide,
 * edit or remove a report, and TapTurf never removes one for being negative.
 */
export function PlayerReports({ reviews, turfSports }: { reviews: OwnerReviews; turfSports: readonly string[] }) {
  const knows = typeof reviews.n === "number";
  const n = reviews.n ?? 0;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const label = (a: Parameters<typeof aspectShort>[0]) => aspectShort(a, null, turfSports);
  const again = reviews.play_again ? playAgainLine([reviews.play_again.no, reviews.play_again.maybe, reviews.play_again.yes]) : null;
  const pulse = [
    `${n} report${n === 1 ? "" : "s"}`,
    n > 0 && reviews.average != null ? `${Number(reviews.average).toFixed(1)} average` : null,
    again,
    reviews.verified ? `${reviews.verified} played in a TapTurf game` : null,
  ].filter(Boolean);
  const aspects = ASPECT_ORDER.map((a) => reviews.aspects?.find((x) => x.aspect === a)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <section className="mt-10" aria-labelledby="player-reports">
      <h2 id="player-reports" className="font-display text-[22px] text-primary-900">Player reports</h2>
      <p className="mt-0.5 text-[14px] text-primary-500">What players told you on TapTurf in the last 90 days. Google reviews are separate.</p>

      {knows && (
        <>
          <p className="mt-3 text-[15px] font-semibold text-primary-900">{n > 0 ? pulse.join(" · ") : "No TapTurf reports in the last 90 days yet."}</p>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-primary-200 bg-white p-4">
              <h3 className="text-[15px] font-bold text-primary-900 inline-flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-hot-600" aria-hidden /> Fix these first
              </h3>
              {reviews.fix_first?.length ? (
                <ul className="mt-2 space-y-2">
                  {reviews.fix_first.map((f) => (
                    <li key={`${f.aspect}:${f.tag}`} className="text-[14px] text-primary-800 leading-snug">
                      <span className="font-semibold">{label(f.aspect)}</span> · {tagLabel(f.aspect, f.tag)}
                      <span className="text-primary-500"> · {f.n} player{f.n === 1 ? "" : "s"} · last on {day(f.last_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14px] text-primary-600">Nothing flagged in the last 90 days.</p>
              )}
              <p className="mt-2 text-[11px] text-primary-400">From players&apos; Needs work taps.</p>
            </div>

            <div className="rounded-2xl border border-primary-200 bg-white p-4">
              <h3 className="text-[15px] font-bold text-primary-900">Scorecard</h3>
              {aspects.length ? (
                <ul className="mt-2 space-y-2.5">
                  {aspects.map((a) => (
                    <li key={a.aspect}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="font-semibold text-primary-800">{label(a.aspect)}</span>
                        <span className="text-primary-500 tabular-nums">
                          {a.n < BAR_MIN ? `${a.n} rating${a.n === 1 ? "" : "s"} so far` : `Great ${a.great} · Okay ${a.okay} · Needs work ${a.needs_work}`}
                        </span>
                      </div>
                      <div className="mt-1 flex h-2 rounded-full overflow-hidden bg-primary-100" aria-hidden>
                        <span className="h-full bg-accent-500" style={{ width: `${(a.great / a.n) * 100}%` }} />
                        <span className="h-full bg-primary-300" style={{ width: `${(a.okay / a.n) * 100}%` }} />
                        <span className="h-full bg-hot-400" style={{ width: `${(a.needs_work / a.n) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14px] text-primary-600">No parts rated yet.</p>
              )}
              {reviews.love && reviews.love.length > 0 && (
                <>
                  <h3 className="mt-4 text-[13px] font-bold text-primary-900">What players love</h3>
                  <p className="mt-1 text-[13px] text-accent-800">{reviews.love.map((l) => `${tagLabel(l.aspect, l.tag)} ×${l.n}`).join(" · ")}</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-primary-200 bg-primary-50 p-4">
            <h3 className="text-[15px] font-bold text-primary-900 inline-flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-primary-500" aria-hidden /> Private notes
            </h3>
            <p className="text-[12px] text-primary-500">Only you see these. Players choose whether to show their name.</p>
            {reviews.notes?.length ? (
              <ul className="mt-3 space-y-2">
                {reviews.notes.map((x, i) => (
                  <li key={i} className="rounded-xl bg-white border border-primary-100 p-3">
                    <p className="text-[12px] text-primary-500">
                      {x.name ? `${x.name} · ${x.month}${x.rating_word ? ` · rated ${x.rating_word}` : ""}` : `${x.context ?? "A player"} · ${x.month}`}
                    </p>
                    <p className="mt-1 text-[14px] text-primary-900 leading-snug whitespace-pre-line">{x.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-primary-600">No private notes yet. Players can leave you one when they rate your turf.</p>
            )}
          </div>
        </>
      )}

      {reviews.recent.length > 0 && (
        <>
          <h3 className="mt-6 text-[17px] font-bold text-primary-900">Latest reports</h3>
          <ul className="mt-3 space-y-2">
            {reviews.recent.map((r, i) => {
              const tap = r.source !== "google";
              const played = tap ? playedLine(r.sport, r.played_when) : "";
              const answer = tap ? playAgainWords(r.play_again) : null;
              return (
                <li key={r.id ?? i} className="rounded-2xl border border-primary-200 bg-white p-4">
                  <p className="text-[13px] text-primary-500 flex flex-wrap items-center gap-x-1.5">
                    <span className="font-semibold text-primary-900">{r.author}</span>
                    <span className="inline-flex items-center gap-0.5 text-primary-800">
                      {Math.max(0, Math.min(5, r.rating))} <Star className="w-3.5 h-3.5 fill-current text-accent-500" aria-hidden />
                    </span>
                    <span>· {tap ? "TapTurf" : "Google"}</span>
                    {played && <span>· {played}</span>}
                    {r.verified_via === "game" && <span className="text-accent-700 font-semibold">· Played in a TapTurf game</span>}
                  </p>
                  {tap && <ReportChips aspects={r.aspects} sport={r.sport} turfSports={turfSports} />}
                  {answer && <p className="mt-1.5 text-[13px] font-medium text-primary-700">{answer}</p>}
                  {r.comment && <p className="mt-1 text-[14px] text-primary-800 leading-snug whitespace-pre-line">{r.comment}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-3 text-[12px] text-primary-500">You can&apos;t hide, edit or remove players&apos; reports, and TapTurf never removes one for being negative.</p>
    </section>
  );
}

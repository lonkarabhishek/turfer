"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ASPECTS, aspectLabel, MAX_TAGS, rowsFor, SCORE_WORDS, tagLabel, WHEN, type AspectId, type PlayedWhen, type Score } from "@/lib/reviews/catalog";
import type { AspectRating, Aspects } from "@/lib/reviews/types";
import { chipTone, Pill, ReasonChip, ScorePill } from "../ui";

const SPORTS_SHOWN = 4;

/**
 * Screen 2, "Quick scorecard": what they played and when, then one tap per
 * part they noticed. Reason chips slide in under a part after Great or
 * Needs work; once the next part is tapped, the finished one folds into a
 * single chip ("Pitch · Great · True bounce"), so the sheet stays short and
 * visibly fills in. A part never touched means "didn't notice".
 */
export function QuickScorecard({
  turfSports,
  sport,
  when,
  aspects,
  onSport,
  onWhen,
  onAspects,
}: {
  turfSports: readonly string[];
  sport: string | null;
  when: PlayedWhen | null;
  aspects: Aspects;
  onSport: (s: string | null) => void;
  onWhen: (w: PlayedWhen | null) => void;
  onAspects: (a: Aspects) => void;
}) {
  const [active, setActive] = useState<AspectId | null>(null);
  const [allSports, setAllSports] = useState(false);
  const rows = rowsFor(sport, when);
  const rated = rows.filter((a) => aspects[a]).length;
  const sports = allSports ? turfSports : turfSports.slice(0, SPORTS_SHOWN);

  const setScore = (a: AspectId, s: Score) => {
    const cur = aspects[a];
    const next = { ...aspects };
    if (cur?.score === s) delete next[a];
    else next[a] = { score: s };
    onAspects(next);
    setActive(a);
  };
  const toggleTag = (a: AspectId, tag: string) => {
    const cur = aspects[a];
    if (!cur) return;
    const tags = cur.tags ?? [];
    const nextTags = tags.includes(tag) ? tags.filter((t) => t !== tag) : tags.length < MAX_TAGS ? [...tags, tag] : tags;
    onAspects({ ...aspects, [a]: nextTags.length ? { score: cur.score, tags: nextTags } : { score: cur.score } });
  };

  return (
    <div className="pt-1 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[22px] font-bold text-primary-900 leading-tight">Quick scorecard</h2>
        <span className="text-[13px] font-semibold text-primary-500 tabular-nums" aria-live="polite">
          {rated} of {rows.length} rated
        </span>
      </div>
      <p className="mt-1 text-[14px] text-primary-500">Tap what you noticed. Skip the rest.</p>

      {turfSports.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-primary-700 mb-2">You played</p>
          <div className="flex flex-wrap gap-2">
            {sports.map((s) => (
              <Pill key={s} on={sport === s} onClick={() => onSport(sport === s ? null : s)}>
                {s}
              </Pill>
            ))}
            {!allSports && turfSports.length > SPORTS_SHOWN && (
              <Pill on={false} onClick={() => setAllSports(true)}>
                More
              </Pill>
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[13px] font-semibold text-primary-700 mb-2">When</p>
        <div className="grid grid-cols-4 gap-2">
          {WHEN.map((w) => (
            <Pill key={w.id} on={when === w.id} onClick={() => onWhen(when === w.id ? null : w.id)} className="px-1 text-[13px] min-w-0" label={`${w.label}, ${w.hint}`}>
              {w.label}
            </Pill>
          ))}
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {rows.map((a) => (
          <li key={a}>
            <AspectRow
              aspect={a}
              label={aspectLabel(a, sport, turfSports)}
              rating={aspects[a]}
              open={active === a || !aspects[a]}
              showChips={active === a}
              onScore={(s) => setScore(a, s)}
              onTag={(t) => toggleTag(a, t)}
              onOpen={() => setActive(a)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AspectRow({
  aspect,
  label,
  rating,
  open,
  showChips,
  onScore,
  onTag,
  onOpen,
}: {
  aspect: AspectId;
  label: string;
  rating: AspectRating | undefined;
  open: boolean;
  showChips: boolean;
  onScore: (s: Score) => void;
  onTag: (tag: string) => void;
  onOpen: () => void;
}) {
  if (rating && !open) {
    const tags = (rating.tags ?? []).map((t) => tagLabel(aspect, t));
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}: ${SCORE_WORDS[rating.score]}${tags.length ? `, ${tags.join(", ")}` : ""}. Change`}
        className={`press-tight report-chips-in w-full min-h-11 rounded-full border px-4 py-2 text-left text-[14px] font-semibold flex items-center gap-2 ${chipTone(rating.score)}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {label} · {SCORE_WORDS[rating.score]}
          {tags.length > 0 && <span className="font-normal"> · {tags.join(", ")}</span>}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 opacity-60" aria-hidden />
      </button>
    );
  }
  const def = ASPECTS[aspect];
  const tags = rating?.score === 1 ? def.great : rating?.score === -1 ? def.needs : [];
  const picked = rating?.tags ?? [];
  return (
    <div role="group" aria-label={label}>
      <p className="text-[14px] font-semibold text-primary-900 mb-1.5">{label}</p>
      <div className="flex gap-2">
        {([-1, 0, 1] as Score[]).map((s) => (
          <ScorePill key={s} score={s} on={rating?.score === s} onClick={() => onScore(s)} label={`${label}: ${SCORE_WORDS[s]}`}>
            {SCORE_WORDS[s]}
          </ScorePill>
        ))}
      </div>
      {showChips && rating && rating.score !== 0 && (
        <div className="report-chips-in mt-2.5 rounded-2xl bg-primary-50 p-3">
          <p className="text-[12px] font-semibold text-primary-600 mb-2">{rating.score === 1 ? "What stood out?" : "What went wrong?"}</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <ReasonChip
                key={t.id}
                on={picked.includes(t.id)}
                sign={rating.score === 1 ? 1 : -1}
                disabled={!picked.includes(t.id) && picked.length >= MAX_TAGS}
                onClick={() => onTag(t.id)}
              >
                {t.label}
              </ReasonChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

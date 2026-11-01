"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Award, ChevronDown, Gamepad2, Loader2, MessageSquareText, PenLine, RefreshCw, Stamp, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPassport } from "@/lib/profile/client";
import { keepPlayed } from "@/lib/profile/playedStore";
import { shortDay } from "@/lib/profile/history";
import { bestFirst, lockedShortlist, toGo, type Medal } from "@/lib/profile/medals";
import { STREAK_WEEKS_SHOWN } from "@/lib/profile/streak";
import { turfPath } from "@/lib/utils/turfPath";
import type { PassportResponse } from "@/lib/profile/types";
import { MedalArt } from "./MedalArt";
import { MedalTile, PassportNumbers, ReviewedList } from "./PassportParts";
import { PlayedWithList, WhatsAppSwitch } from "./PlayedWith";
import { ShareProfile } from "./ShareProfile";
import { RoundStamps, StampPage, TurfStamps } from "./Stamps";
import { StreakLine } from "./StreakNudge";

/**
 * The Me tab's Passport: the numbers, the weekly streak, medals, a stamp
 * for every turf, city and sport played, the turfs reviewed, the ones to
 * review, and the people played with (and the WhatsApp switch). Only the
 * signed-in person's own (GET /api/me/passport); only real games count:
 * one that hasn't happened yet or was cancelled counts for nothing.
 * onLoaded: the Me card shows the same numbers while this tab is open, and
 * the played summary it brings refreshes every badge and tile.
 */
export function PassportTab({ onLoaded }: { onLoaded?: (r: PassportResponse) => void }) {
  const { user, getToken } = useAuth();
  const [data, setData] = useState<{ for: string; r: PassportResponse } | { for: string; failed: true } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      const tok = await getToken();
      if (!alive) return;
      if (!("token" in tok)) return setData({ for: userId, failed: true });
      const a = await getPassport(tok.token);
      if (!alive) return;
      setData("ok" in a ? { for: userId, r: a.ok } : { for: userId, failed: true });
      if ("ok" in a) {
        if (a.ok.played) keepPlayed(userId, a.ok.played);
        onLoaded?.(a.ok);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = data && data.for === userId ? data : null;

  // A link to a part (the home's Squad tile: #played-with) lands on it once it is drawn.
  const ready = !!mine && "r" in mine;
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (!mine) {
    return (
      <div className="py-16 text-center" role="status">
        <Loader2 className="w-6 h-6 text-accent-500 animate-spin mx-auto mb-3" aria-hidden />
        <p className="text-sm text-primary-500">Opening your passport…</p>
      </div>
    );
  }
  if ("failed" in mine) {
    return (
      <div className="rounded-2xl border border-primary-200 bg-white px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-primary-900">Couldn&rsquo;t load your passport</p>
        <p className="mt-1 text-[14px] text-primary-500">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => {
            setData(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-4 inline-flex items-center gap-2 min-h-[44px] rounded-full border border-primary-200 bg-white px-5 text-[14px] font-semibold text-primary-800 hover:border-accent-500 focus-neon"
        >
          <RefreshCw className="w-4 h-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }
  return <Passport r={mine.r} />;
}

// The aside goes under the title when both don't fit on one line (a 320 px phone).
function Heading({ id, icon, title, aside }: { id: string; icon: React.ReactNode; title: string; aside?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5 mb-3">
      <h2 id={id} className="flex items-center gap-2 font-display text-[20px] font-semibold text-primary-900 leading-tight whitespace-nowrap">
        <span className="text-accent-600" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {aside && <p className="text-[13px] text-primary-500 tabular-nums">{aside}</p>}
    </div>
  );
}

/** "Sep 2026". */
function sinceWords(iso: string | null): string | null {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// Two medals a row on the narrowest phones, three from 360 px, four on a wider screen.
const MEDAL_GRID = "grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-4 gap-2";

function LockedTile({ m }: { m: Medal }) {
  return <MedalTile art={m.art} name={m.name} line={toGo(m) ?? m.blurb} locked progress={m.progress} />;
}

/**
 * Earned medals (what each was for, and when), then "Next up", then the
 * three locked ones closest to done; the rest behind "See all". Before a
 * first game: the three starters.
 */
function Medals({ medals, games, now }: { medals: Medal[]; games: number; now: number }) {
  const [all, setAll] = useState(false);
  const restId = useId();
  const earned = bestFirst(medals.filter((m) => m.earned));
  const { next, shown, rest } = lockedShortlist(medals, games);
  return (
    <>
      {earned.length > 0 && (
        <ul className={MEDAL_GRID} aria-label="Earned">
          {earned.map((m) => (
            <li key={m.id}>
              <MedalTile art={m.art} name={m.name} line={m.blurb} date={m.earnedOn ? shortDay(m.earnedOn, now) : null} />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-primary-900 px-4 py-3 text-white">
          <MedalArt art={next.art} size={44} />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-white/70">Next up</p>
            <p className="text-[14px] font-semibold leading-snug text-balance">{next.need}</p>
          </div>
        </div>
      )}
      {shown.length > 0 && (
        <ul className={`${MEDAL_GRID} mt-3`} aria-label={games === 0 ? "Your first medals to earn" : "Closest to done"}>
          {shown.map((m) => (
            <li key={m.id}>
              <LockedTile m={m} />
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <>
          <ul id={restId} hidden={!all} className={all ? `${MEDAL_GRID} mt-2` : "hidden"} aria-label="Still to earn">
            {rest.map((m) => (
              <li key={m.id}>
                <LockedTile m={m} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-expanded={all}
            aria-controls={restId}
            onClick={() => setAll((v) => !v)}
            className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-1 text-[14px] font-semibold text-accent-700 hover:text-accent-800 focus-neon rounded-lg"
          >
            {all ? "Show fewer" : `See all ${medals.length} medals`}
            <ChevronDown className={`w-4 h-4 transition-transform ${all ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </>
      )}
    </>
  );
}

function Passport({ r }: { r: PassportResponse }) {
  const [now] = useState(() => Date.now());
  const { passport: p, playedWith, whatsapp } = r;
  const n = p.numbers;
  const earned = p.medals.filter((m) => m.earned);
  const since = sinceWords(n.since);
  const section = "scroll-mt-24 mt-9";

  return (
    <div>
      {/* ─── The numbers ─────────────────────────────────── */}
      <section aria-labelledby="pp-numbers">
        <Heading id="pp-numbers" icon={<Award className="w-5 h-5" />} title="Your numbers" aside={since ? `Since ${since}` : undefined} />
        {/* A wall of zeros says nothing: before a first game, the empty card alone. */}
        {n.games > 0 && (
          <>
            <p className="-mt-1 mb-3 text-[13px] text-primary-500">Only games that have happened count, not ones still to come or cancelled.</p>
            <PassportNumbers
              label="Your numbers"
              items={[
                { label: "Played", value: n.games, href: "/dashboard?tab=games" },
                { label: "Hosted", value: n.hosted, href: "/dashboard?tab=games" },
                { label: "Turfs", value: n.turfs, href: "#stamps" },
                { label: "Cities", value: n.cities, href: "#stamps" },
                { label: "Sports", value: n.sports, href: "#stamps" },
                { label: "Reviews", value: n.reviews, href: "#reviewed" },
                { label: "Streak", value: p.streak.current, href: "#streak", sr: "weeks in a row now" },
                { label: "Best", value: p.streak.best, href: "#streak", sr: "streak, weeks in a row" },
              ]}
            />
          </>
        )}
        {n.games === 0 && (
          <div className="mt-4 rounded-2xl border border-accent-500/30 bg-accent-50 px-4 py-4">
            <p className="text-[15px] font-semibold text-primary-900">Your passport is empty, for now</p>
            <p className="mt-1 text-[14px] text-primary-600">Play a TapTurf game and, once it&rsquo;s over, its turf, city and sport get a stamp here.</p>
            <Link href="/games" className="mt-3 inline-flex items-center gap-2 min-h-[44px] rounded-full bg-primary-900 px-5 text-[14px] font-semibold text-white focus-neon">
              <Gamepad2 className="w-4 h-4" aria-hidden />
              Find a game
            </Link>
          </div>
        )}
        <ShareProfile className="mt-4 w-full sm:w-auto" />
      </section>

      {/* ─── The streak ──────────────────────────────────── */}
      {n.games > 0 && (
        <section id="streak" aria-labelledby="pp-streak" className={section}>
          <h2 id="pp-streak" className="sr-only">
            Weekly streak
          </h2>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4">
            <StreakLine streak={p.streak} games={n.games} />
            {/* The last 12 weeks, this week last. */}
            <ol className="mt-4 flex items-end gap-1" aria-label={`The last ${STREAK_WEEKS_SHOWN} weeks`}>
              {p.streak.weeks.map((played, i) => {
                const last = i === p.streak.weeks.length - 1;
                return (
                  <li key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`block w-full h-6 rounded-md ${played ? "bg-amber-500" : last ? "bg-white border-2 border-dashed border-amber-400" : "bg-amber-100"}`} aria-hidden />
                    <span className="sr-only">
                      {last ? "This week" : `${p.streak.weeks.length - 1 - i} ${p.streak.weeks.length - 1 - i === 1 ? "week" : "weeks"} ago`}: {played ? "played" : "no game"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-1 flex justify-between text-[11px] text-primary-500" aria-hidden>
              <span>12 weeks ago</span>
              <span>This week</span>
            </div>
            <p className="mt-3 text-[12px] text-primary-500">A week runs Monday to Sunday, India time. A game counts once it has happened.</p>
          </div>
        </section>
      )}

      {/* ─── Medals ──────────────────────────────────────── */}
      <section id="medals" aria-labelledby="pp-medals" className={section}>
        <Heading id="pp-medals" icon={<Award className="w-5 h-5" />} title="Medals" aside={`${earned.length} of ${p.medals.length}`} />
        <Medals medals={p.medals} games={n.games} now={now} />
      </section>

      {/* ─── Stamps ──────────────────────────────────────── */}
      <section id="stamps" aria-labelledby="pp-stamps" className={section}>
        <Heading
          id="pp-stamps"
          icon={<Stamp className="w-5 h-5" />}
          title="Passport stamps"
          aside={p.stamps.turfs.length ? `${p.stamps.turfs.length} ${p.stamps.turfs.length === 1 ? "turf" : "turfs"}` : undefined}
        />
        {p.stamps.turfs.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50 px-4 py-5 text-center text-[14px] text-primary-600">
            Every turf you play a TapTurf game at gets a stamp here, with the date of your first game there.
          </p>
        ) : (
          <StampPage>
            <TurfStamps stamps={p.stamps.turfs} now={now} />
            {p.stamps.cities.length > 0 && (
              <>
                <h3 className="mt-6 mb-3 text-[14px] font-semibold text-primary-800">Cities</h3>
                <RoundStamps stamps={p.stamps.cities} now={now} kind="city" />
              </>
            )}
            {p.stamps.sports.length > 0 && (
              <>
                <h3 className="mt-6 mb-3 text-[14px] font-semibold text-primary-800">Sports</h3>
                <RoundStamps stamps={p.stamps.sports} now={now} kind="sport" />
              </>
            )}
          </StampPage>
        )}
      </section>

      {/* ─── Reviewed ────────────────────────────────────── */}
      <section id="reviewed" aria-labelledby="pp-reviewed" className={section}>
        <Heading id="pp-reviewed" icon={<MessageSquareText className="w-5 h-5" />} title="Turfs you reviewed" aside={p.reviewed.length ? String(p.reviewed.length) : undefined} />
        {p.reviewed.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50 px-4 py-5 text-center text-[14px] text-primary-600">
            Your reviews show here, and on your public profile.
          </p>
        ) : (
          <ReviewedList items={p.reviewed.map((x) => ({ ...x, when: x.day ? shortDay(x.day, now) : null }))} />
        )}
      </section>

      {/* ─── Review more ─────────────────────────────────── */}
      {p.reviewMore.length > 0 && (
        <section id="review-more" aria-labelledby="pp-review-more" className={section}>
          <Heading id="pp-review-more" icon={<PenLine className="w-5 h-5" />} title="Review more" />
          <p className="-mt-1 mb-3 text-[13px] text-primary-500">
            You played at these and haven&rsquo;t reviewed them yet. Review only where you actually played; you can post one new review a day.
          </p>
          <ul className="space-y-2">
            {p.reviewMore.map((s) => (
              <li key={s.turfId} className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3">
                <span className="min-w-0 flex-1">
                  <Link href={turfPath({ id: s.turfId, slug: s.slug })} className="block text-[15px] font-semibold text-primary-900 truncate hover:underline underline-offset-2">
                    {s.name}
                  </Link>
                  <span className="block text-[13px] text-primary-500 truncate">
                    {[s.cityLabel, `Last played ${shortDay(s.last, now)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Link
                  href={`${turfPath({ id: s.turfId, slug: s.slug })}?rate=1`}
                  className="shrink-0 inline-flex items-center min-h-[40px] rounded-full bg-accent-500 px-4 text-[13px] font-semibold text-white hover:bg-accent-600 focus-neon"
                  aria-label={`Rate your game at ${s.name}`}
                >
                  Rate it
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Played with ─────────────────────────────────── */}
      <section id="played-with" aria-labelledby="pp-played-with" className={`${section} pb-2`}>
        <Heading id="pp-played-with" icon={<Users className="w-5 h-5" />} title="Played with" aside={playedWith.length ? `${playedWith.length} ${playedWith.length === 1 ? "player" : "players"}` : undefined} />
        <p className="-mt-1 mb-3 text-[13px] text-primary-500">Only you see this list.</p>
        <WhatsAppSwitch initial={whatsapp} />
        <PlayedWithList people={playedWith} now={now} />
      </section>
    </div>
  );
}

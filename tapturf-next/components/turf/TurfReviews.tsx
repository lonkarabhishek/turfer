"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { removeReport, voteReview } from "@/lib/reviews/client";
import { loadDraft } from "@/lib/reviews/draft";
import { PRICE_ASK_BELOW, type ListedPrices } from "@/lib/reviews/sheet";
import type { AspectCount, PlayAgainCounts, VoteResponse } from "@/lib/reviews/types";
import type { ReviewSummary, ReviewWithUser } from "@/types/review";
import { RateInline } from "./reviews/RateInline";
import { ReportSheet, type SavedReport, type SheetOpen } from "./reviews/ReportSheet";
import { ReviewList } from "./reviews/ReviewList";
import { ScoreRow, Scorecard } from "./reviews/Scorecard";
import { GoogleCard, PlayersSayCard, type PlayersSay } from "./reviews/SummaryCards";
import { OPEN_REPORT_EVENT, type OpenReportDetail } from "./reviews/ui";
import { useMyReport } from "./reviews/useMyReport";

const noop = () => () => {};

/**
 * "Player reports" on the turf page. Everything public (the list, stars,
 * scorecard bars, play-again share) comes with the cached page
 * (turf_page); what is the viewer's own (their report and note, their
 * Helpful votes, a hint for the rate card) comes from one GET
 * /api/reviews after hydration, for signed-in viewers only. Every write
 * goes through /api/reviews, so phone and Google sign-ins can both edit
 * and remove their report. The sheet lives in components/turf/reviews.
 */
export function TurfReviews(props: {
  turfId: string;
  turfName: string;
  slug: string;
  sports: string[];
  claimed: boolean;
  /** Latest reviews from the server render, players' own first. */
  initialReviews: ReviewWithUser[];
  /** TapTurf report count, average and histogram from the server render. */
  initialSummary: ReviewSummary;
  reviewAspects: AspectCount[];
  playAgain: PlayAgainCounts | null;
  /** The listed hourly rates (for the price chips), when the turf lists them per hour. */
  listedPrices: ListedPrices | null;
  /** What players shared under From players. */
  playerPrice: { min: number; max: number; count: number } | null;
  playersSay?: PlayersSay | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  googleReviewUrl?: string | null;
}) {
  const { turfId, turfName, sports } = props;
  const { user, login, getToken } = useAuth();
  const me = useMyReport(turfId);
  const [reviews, setReviews] = useState(props.initialReviews);
  const [sheet, setSheet] = useState<SheetOpen | null>(null);
  // Dates and the rate card's day words read the visitor's clock: after hydration only.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(t);
  }, []);

  // Any "Rate your game" button on the page, and /turf/<slug>?rate=1 (the shared link).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenReportDetail>).detail ?? {};
      setSheet({ stars: d.stars, channel: d.channel ?? "turf_page", editing: null });
    };
    window.addEventListener(OPEN_REPORT_EVENT, onOpen);
    const url = new URL(window.location.href);
    if (url.searchParams.get("rate") === "1") {
      url.searchParams.delete("rate");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      const t = setTimeout(() => setSheet({ channel: "link", editing: null }), 0);
      return () => {
        clearTimeout(t);
        window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
      };
    }
    return () => window.removeEventListener(OPEN_REPORT_EVENT, onOpen);
  }, []);

  // Back from the login with a report waiting to post: open the sheet, which posts it.
  useEffect(() => {
    if (!user) return;
    const d = loadDraft(turfId);
    if (!d?.waiting) return;
    const t = setTimeout(() => setSheet({ channel: d.channel, editing: null, autoPost: true }), 0);
    return () => clearTimeout(t);
  }, [user, turfId]);

  // A vote this viewer made counts at least once until the cached page catches up.
  const voted = me.voted;
  const shown = reviews.map((r) => (voted.has(r.id) ? { ...r, viewer_has_upvoted: true, upvotes: Math.max(r.upvotes, 1) } : r));

  const reload = me.reload;
  const onSaved = useCallback(
    (s: SavedReport) => {
      const row: ReviewWithUser = { ...s.review, booking_id: null, updated_at: null, source: null, viewer_has_upvoted: false, upvotes: s.review.upvotes ?? 0 };
      setReviews((prev) => (s.review.status === "live" ? [row, ...prev.filter((r) => r.id !== row.id)] : prev.filter((r) => r.id !== row.id)));
      void reload();
    },
    [reload],
  );

  const onRemove = async () => {
    const t = await getToken();
    if (!("token" in t)) return false;
    const a = await removeReport(t.token, turfId);
    if (a.status !== 200) return false;
    setReviews((prev) => prev.filter((r) => r.id !== me.mine?.id));
    me.setState((s) => ({ ...s, mine: s.mine ? { ...s.mine, status: s.mine.status === "hidden" ? "hidden" : "removed" } : null }));
    return true;
  };

  /** Helpful on or off: at once on screen, then the server's count. Signed out: log in. */
  const onVote = async (id: string) => {
    if (!user) return login();
    const on = !voted.has(id);
    const flip = (want: boolean, upvotes?: number) => {
      me.setState((s) => {
        const v = new Set(s.voted);
        if (want) v.add(id);
        else v.delete(id);
        return { ...s, voted: v };
      });
      setReviews((prev) => prev.map((r) => (r.id !== id ? r : { ...r, upvotes: upvotes ?? Math.max(0, r.upvotes + (want ? 1 : -1)) })));
    };
    flip(on);
    const t = await getToken();
    const a = "token" in t ? await voteReview(t.token, id, on) : null;
    const b = a?.body as VoteResponse | undefined;
    if (b && "r" in b && b.r === "ok") flip(b.on, b.upvotes);
    else flip(!on);
  };

  const tapturfN = props.initialSummary.count;
  const hasGoogle = typeof props.googleRating === "number" && props.googleRating > 0;
  const mine = me.mine && me.mine.status !== "removed" ? me.mine : null;
  const priceAsk = (props.playerPrice?.count ?? 0) < PRICE_ASK_BELOW ? { listed: props.listedPrices, players: props.playerPrice, mine: me.myPrice } : null;

  return (
    <div className="section-divider" id="player-reports">
      <h2 className="text-[22px] font-bold text-primary-800 font-serif">Player reports</h2>
      <p className="mt-1 mb-4 text-[14px] text-primary-500">
        From players signed in on TapTurf.{hasGoogle ? " Google reviews are further down." : ""}
      </p>

      <RateInline
        turfName={turfName}
        hint={me.hint}
        now={now}
        mine={mine}
        blocked={me.blocked}
        onRate={(stars) => setSheet({ stars, channel: "turf_page", editing: null })}
        onEdit={() => mine && setSheet({ channel: "edit", editing: mine })}
      />
      <ScoreRow stats={props.initialSummary} playAgain={props.playAgain} />
      <Scorecard counts={props.reviewAspects} turfSports={sports} reports={tapturfN} />

      {props.playersSay && <PlayersSayCard playersSay={props.playersSay} />}
      {hasGoogle && <GoogleCard rating={props.googleRating!} count={props.googleReviewCount} url={props.googleReviewUrl} />}

      <ReviewList
        reviews={shown}
        mine={me.mine}
        voted={voted}
        hydrated={hydrated}
        turfSports={sports}
        onVote={onVote}
        onEdit={() => mine && setSheet({ channel: "edit", editing: mine })}
        onRemove={onRemove}
      />

      {sheet && (
        <ReportSheet
          turf={{ id: turfId, name: turfName, slug: props.slug, sports, claimed: props.claimed }}
          open={sheet}
          hint={me.hint}
          priceAsk={priceAsk}
          players={props.playerPrice}
          userName={user ? user.name || "a player" : null}
          getToken={getToken}
          login={login}
          onClose={() => setSheet(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

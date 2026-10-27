"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { rowsFor, starWord, type PlayedWhen, type Score } from "@/lib/reviews/catalog";
import { problemOf, saveReport, type SaveProblem } from "@/lib/reviews/client";
import { clearDraft, emptyDraft, hasAnswers, loadDraft, markWaiting, saveDraft, type Draft, type Step } from "@/lib/reviews/draft";
import { contactProblem } from "@/lib/reviews/screen";
import { listedFor, priceChips, tipPlaceholder, type ListedPrices } from "@/lib/reviews/sheet";
import type { Aspects, MineResponse, RateHint, ReportBody, ReportChannel, SaveResponse } from "@/lib/reviews/types";
import { unlockLine } from "@/lib/reviews/unlock";
import type { TokenCheck } from "@/lib/account/client";
import type { ReviewWithUser } from "@/types/review";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { Overall, StarsBar } from "./steps/Overall";
import { QuickScorecard } from "./steps/QuickScorecard";
import { CONTACT_MESSAGE, otherPrice, WrapUp } from "./steps/WrapUp";
import { Thanks } from "./steps/Thanks";
import { monthYear } from "./ui";
import { gaEvent } from "@/lib/analytics/ga";

export type Mine = NonNullable<Extract<MineResponse, { mine: unknown }>["mine"]>;
export type SavedReport = Extract<SaveResponse, { r: "ok" }>;

export type SheetOpen = {
  /** A star tapped on the page: the sheet opens on screen 2 with it set. */
  stars?: number;
  channel: ReportChannel;
  /** The report this save replaces, with its note (an edit); null for a new one. */
  editing: Mine | null;
  /** Back from the login: start from this phone's draft (even over editing), on its last screen. */
  resume?: boolean;
  /** And post it at once (no report here yet, no note to look over). */
  autoPost?: boolean;
  /** Or ask first: "replace" they already rated here; "note" the draft has a private note. */
  confirm?: "replace" | "note";
};

export type SheetTurf = { id: string; name: string; slug: string; sports: string[]; claimed: boolean };

const MESSAGES: Record<SaveProblem, string> = {
  own_turf: "You manage this turf, so you can't rate it. You can see what players say on myTapturf.",
  contact_info: CONTACT_MESSAGE,
  limit: "That's a lot of reports for one day. Try again tomorrow.",
  new: "Finish signing up to post.",
  sign_in: "Your login ended. Log in again to post; your answers are saved.",
  gone: "This turf isn't taking reports right now.",
  bad: "Something in this report didn't go through. Check it and try again.",
  unavailable: "Couldn't post just now. Your answers are saved on this phone.",
  exists: "You've already rated this turf. Posting this replaces that report.",
};

/** GA4, only with consent (lib/analytics/ga.ts). */
function track(event: string, params: Record<string, unknown>) {
  gaEvent(event, params);
}

/** A report as the sheet edits it: its answers, on screen 2. */
function draftOf(e: Mine, myPrice: number | null, userId: string | null): Draft {
  return {
    ...emptyDraft(),
    stars: e.rating,
    sport: e.sport ?? null,
    when: e.played_when ?? null,
    aspects: e.aspects ?? {},
    playAgain: e.play_again ?? null,
    comment: e.comment ?? "",
    noteOpen: !!e.note,
    note: e.note?.body ?? "",
    showName: e.note?.show_name ?? false,
    price: myPrice,
    step: 2,
    channel: "edit",
    by: userId,
  };
}

/** The draft the sheet starts from: the report being edited, else this phone's draft (theirs only), else a new one. */
function startDraft(turf: SheetTurf, open: SheetOpen, hint: RateHint | null, myPrice: number | null, userId: string | null): Draft {
  if (open.editing && !open.resume) {
    const d = draftOf(open.editing, myPrice, userId);
    if (open.stars) d.stars = open.stars;
    return d;
  }
  const saved = loadDraft(turf.id, userId);
  if (open.resume && saved) return { ...saved, step: 3, by: userId };
  const d: Draft = saved ? { ...saved, by: userId } : { ...emptyDraft(), channel: open.channel, by: userId };
  if (!saved) {
    // What we already know: the one sport the turf lists, or the game's sport and time.
    const fromGame = hint?.kind === "game";
    d.sport = fromGame && hint.sport && turf.sports.includes(hint.sport) ? hint.sport : turf.sports.length === 1 ? turf.sports[0] : null;
    d.when = fromGame ? (hint.played_when ?? null) : null;
    d.price = myPrice;
  }
  if (open.stars) {
    d.stars = open.stars;
    d.step = d.step === 3 ? 3 : 2;
  } else if (!d.stars) {
    d.step = 1;
  }
  return d;
}

/** What the sheet sends: only the rows the sheet shows, the note only when there is or was one, the price only when new. */
function bodyOf(d: Draft, turfId: string, editing: Mine | null, ask: { mine: number | null } | null): ReportBody {
  const aspects: Aspects = {};
  for (const a of rowsFor(d.sport, d.when)) if (d.aspects[a]) aspects[a] = d.aspects[a];
  const ms = Date.now() - d.startedAt;
  const body: ReportBody = {
    turf_id: turfId,
    rating: d.stars,
    sport: d.sport,
    played_when: d.when,
    aspects: Object.keys(aspects).length ? aspects : null,
    play_again: d.playAgain,
    comment: d.comment.trim() || null,
    channel: editing ? "edit" : d.channel,
    // The report this replaces: without it the server answers "exists" and changes nothing.
    base: editing && editing.status !== "removed" ? editing.id : null,
  };
  if (ms >= 0 && ms <= 600_000) body.ms = Math.round(ms);
  if (d.noteOpen || editing?.note) body.note = { body: d.note.trim() || null, show_name: d.showName };
  const paid = d.price ?? otherPrice(d.priceOther);
  if (ask && paid && paid !== ask.mine) body.price_paid = paid;
  return body;
}

export function ReportSheet({
  turf,
  open,
  hint,
  priceAsk,
  players,
  userName,
  userId,
  getToken,
  login,
  onClose,
  onSaved,
}: {
  turf: SheetTurf;
  open: SheetOpen;
  hint: RateHint | null;
  /** Ask what they paid (fewer than 3 player prices here): the listed rates, players' range and the price they shared before. */
  priceAsk: { listed: ListedPrices | null; players: { min: number; max: number } | null; mine: number | null } | null;
  /** The From players range now, for the thank-you line. */
  players: { min: number; max: number } | null;
  /** The signed-in player's name; null when signed out. */
  userName: string | null;
  /** The signed-in account (drafts are kept per account); null when signed out. */
  userId: string | null;
  getToken: () => Promise<TokenCheck>;
  login: () => void;
  onClose: () => void;
  onSaved: (saved: SavedReport) => void;
}) {
  const [d, setD] = useState<Draft>(() => startDraft(turf, open, hint, priceAsk?.mine ?? null, userId));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<{ problem: SaveProblem; field?: "comment" | "note"; existing?: Mine } | null>(null);
  const [done, setDone] = useState<{ saved: SavedReport; body: ReportBody } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The report this save replaces: the one opened for editing, or the one they chose to replace.
  const [editing, setEditing] = useState<Mine | null>(open.editing);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedIn = userName !== null;

  const patch = useCallback((p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p })), []);
  // Every tap is kept on this phone, as this account's (not once posted).
  useEffect(() => {
    if (!done) saveDraft(turf.id, { ...d, by: userId });
  }, [d, done, turf.id, userId]);

  const close = useCallback(() => {
    if (done || posting || !hasAnswers(d)) onClose();
    else setConfirmLeave(true);
  }, [done, posting, d, onClose]);

  // Off to log in: the draft stays on this phone, and this tab waits to post it when the login comes straight back.
  const toLogin = useCallback(() => {
    saveDraft(turf.id, { ...d, by: userId });
    markWaiting(turf.id);
    onClose();
    login();
  }, [d, turf.id, userId, onClose, login]);

  // The latest post(), for the auto-post and the retry once back online.
  const postRef = useRef<() => Promise<void>>(async () => {});
  const post = useCallback(async (replacing: Mine | null = editing) => {
    if (posting || !d.stars) return;
    setError(null);
    if (contactProblem(d.comment)) {
      setError({ problem: "contact_info", field: "comment" });
      patch({ step: 3 });
      return;
    }
    if (d.noteOpen && contactProblem(d.note)) {
      setError({ problem: "contact_info", field: "note" });
      patch({ step: 3 });
      return;
    }
    if (!signedIn) return toLogin();
    setPosting(true);
    const t = await getToken();
    if (!("token" in t)) {
      setPosting(false);
      if ("none" in t) return toLogin();
      setError({ problem: "unavailable" });
      return;
    }
    const body = bodyOf(d, turf.id, replacing, priceAsk);
    const a = await saveReport(t.token, body);
    setPosting(false);
    const p = problemOf(a);
    const b = a.body as SaveResponse;
    if (!p && "r" in b && b.r === "ok") {
      clearDraft(turf.id);
      setDone({ saved: b, body });
      onSaved(b);
      track("report_post", { channel: body.channel, ms: body.ms, parts: Object.keys(body.aspects ?? {}).length, edit: !!editing });
      return;
    }
    const problem = p ?? { problem: "unavailable" as const };
    setError(problem);
    if (problem.problem === "contact_info") patch({ step: 3, noteOpen: d.noteOpen || problem.field === "note" });
    if (problem.problem === "exists") patch({ step: 3 });
    // Offline: try once more when the connection is back.
    if (a.status === 0) window.addEventListener("online", () => void postRef.current?.(), { once: true });
  }, [posting, d, signedIn, toLogin, getToken, turf.id, editing, priceAsk, onSaved, patch]);

  // "You've already rated this turf": replace that report with this one, or edit that one instead.
  const replaceIt = (existing: Mine) => {
    setEditing(existing);
    setError(null);
    void post(existing);
  };
  const editThatOne = (existing: Mine) => {
    setEditing(existing);
    setError(null);
    setD(draftOf(existing, priceAsk?.mine ?? null, userId));
  };
  useEffect(() => {
    postRef.current = post;
  }, [post]);

  // Back from the login with a report waiting: post it at once.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!open.autoPost || autoRan.current) return;
    autoRan.current = true;
    void postRef.current();
  }, [open.autoPost]);

  useEffect(() => {
    track("report_open", { channel: open.channel, edit: !!open.editing });
  }, [open.channel, open.editing]);

  // Lock the page behind the sheet; Esc closes; Tab stays inside it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);
  // Focus moves into the sheet (the panel itself, so no button shows a ring on open).
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => () => {
    if (advance.current) clearTimeout(advance.current);
  }, []);

  const pickOverall = (n: number) => {
    patch({ stars: n });
    if (d.step === 1) {
      if (advance.current) clearTimeout(advance.current);
      advance.current = setTimeout(() => patch({ step: 2 }), 300);
    }
  };

  const rows = rowsFor(d.sport, d.when);
  const tappedHere = rows.some((a) => d.aspects[a]) || d.when !== null;
  const step: Step | 4 = done ? 4 : d.step;
  // Each screen opens at its top (the screens share one scroll box).
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);
  const first = (userName ?? "").trim().split(/\s+/)[0] ?? "";

  let thanks: React.ReactNode = null;
  if (done) {
    const r = done.saved.review;
    const preview: ReviewWithUser = {
      ...r,
      booking_id: null,
      updated_at: null,
      source: null,
      user_name: r.user_name ?? userName,
      user_avatar: r.user_avatar ?? null,
      upvotes: r.upvotes ?? 0,
      viewer_has_upvoted: false,
    };
    const paid = done.body.price_paid;
    const price = done.saved.price_saved && paid ? { min: Math.min(players?.min ?? paid, paid), max: Math.max(players?.max ?? paid, paid) } : null;
    const unlock = unlockLine({
      turfName: turf.name,
      created: done.saved.created,
      tapturfN: done.saved.after.tapturf_n,
      aspectCounts: done.saved.after.aspects,
      sport: r.sport,
      turfSports: turf.sports,
      price,
    });
    thanks = (
      <Thanks
        firstName={first}
        edited={!!editing && editing.status !== "removed"}
        held={r.status === "held"}
        preview={preview}
        turfSports={turf.sports}
        unlock={unlock}
        note={done.saved.note}
        turfName={turf.name}
        slug={turf.slug}
        onDone={onClose}
      />
    );
  }

  // In what the phone shows (ViewportOverlay): with the keys up for the tip or the note, the
  // sheet sits above them, its screens scroll between the stars and the Post row, and the
  // box being typed in scrolls into view.
  const sheet = (
    <ViewportOverlay className="z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-primary-900/40 animate-fade-in" onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Rate your game at ${turf.name}`}
        tabIndex={-1}
        className="relative w-full sm:max-w-lg max-h-[calc(var(--vv-h,100dvh)*0.92)] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated animate-slide-up overflow-hidden outline-none"
      >
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-2 pb-1">
          <p className="min-w-0 flex-1 truncate text-[13px] text-primary-500">{turf.name}</p>
          {step !== 4 && (
            <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`} role="img">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary-900" : i < step ? "w-1.5 bg-primary-900" : "w-1.5 bg-primary-200"}`} />
              ))}
            </div>
          )}
          <button type="button" onClick={close} aria-label="Close" className="press-tight -mr-2 w-11 h-11 rounded-full flex items-center justify-center text-primary-500 hover:bg-primary-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {(step === 2 || step === 3) && <StarsBar stars={d.stars} onPick={(n) => patch({ stars: n })} />}

        <div ref={scroller} className="overflow-y-auto overscroll-contain px-5" style={step === 4 ? { paddingBottom: "max(1.5rem, var(--safe-b, env(safe-area-inset-bottom)))" } : undefined}>
          {step === 1 && <Overall turfName={turf.name} stars={d.stars} onPick={pickOverall} />}
          {step === 2 && (
            <QuickScorecard
              turfSports={turf.sports}
              sport={d.sport}
              when={d.when}
              aspects={d.aspects}
              onSport={(s) => patch({ sport: s })}
              onWhen={(w: PlayedWhen | null) => patch({ when: w })}
              onAspects={(a) => patch({ aspects: a })}
            />
          )}
          {step === 3 && (
            <WrapUp
              playAgain={d.playAgain}
              onPlayAgain={(v: Score | null) => patch({ playAgain: v })}
              price={d.price}
              onPrice={(v) => patch({ price: v })}
              priceOther={d.priceOther}
              onPriceOther={(v) => patch({ priceOther: v })}
              priceAsk={priceAsk && { chips: priceChips(listedFor(priceAsk.listed, d.when), priceAsk.players), mine: priceAsk.mine }}
              comment={d.comment}
              onComment={(v) => patch({ comment: v })}
              prompt={tipPlaceholder(Object.fromEntries(rows.filter((a) => d.aspects[a]).map((a) => [a, d.aspects[a]])), d.sport, turf.sports)}
              noteOpen={d.noteOpen}
              onNoteOpen={() => patch({ noteOpen: true })}
              note={d.note}
              onNote={(v) => patch({ note: v })}
              showName={d.showName}
              onShowName={(v) => patch({ showName: v })}
              claimed={turf.claimed}
              userName={userName}
              flagged={error?.problem === "contact_info" ? (error.field ?? "comment") : null}
            />
          )}
          {thanks}
        </div>

        {step !== 4 && (
          <div className="border-t border-primary-100 bg-white px-5 pt-3" style={{ paddingBottom: "max(0.75rem, var(--safe-b, env(safe-area-inset-bottom)))" }}>
            {open.confirm && !error && step === 3 && (
              <p className="mb-3 rounded-xl bg-primary-50 px-4 py-3 text-[14px] text-primary-800">
                {open.confirm === "replace"
                  ? "Welcome back. You'd already rated this turf: posting saves these answers over that report."
                  : "Welcome back. Check your answers and your note, then post."}
              </p>
            )}
            {error?.problem === "exists" && error.existing ? (
              <div role="alert" className="mb-3 rounded-xl bg-primary-50 px-4 py-3 text-[14px] text-primary-800">
                <p>
                  You rated this turf {starWord(error.existing.rating).toLowerCase()}
                  {error.existing.created_at ? ` in ${monthYear(error.existing.edited_at ?? error.existing.created_at)}` : ""}. Post this one in its place?
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => replaceIt(error.existing!)} className="press-tight min-h-11 px-4 rounded-full bg-primary-900 text-white text-[14px] font-semibold">
                    Replace it
                  </button>
                  <button type="button" onClick={() => editThatOne(error.existing!)} className="press-tight min-h-11 px-4 rounded-full bg-white border border-primary-200 text-primary-900 text-[14px] font-semibold">
                    Edit that one instead
                  </button>
                </div>
              </div>
            ) : error && (
              <div role="alert" className="mb-3 rounded-xl bg-hot-500/10 px-4 py-3 text-[14px] text-hot-600">
                {MESSAGES[error.problem]}
                {error.problem === "own_turf" && (
                  <Link href="/my" className="ml-1 font-semibold underline">
                    Open myTapturf
                  </Link>
                )}
                {(error.problem === "new" || error.problem === "sign_in") && (
                  <button type="button" onClick={toLogin} className="ml-1 font-semibold underline">
                    Log in
                  </button>
                )}
              </div>
            )}
            {!signedIn && step === 3 && <p className="mb-2 text-[12px] text-primary-500 text-right">Your answers are saved.</p>}
            {open.autoPost && posting && <p className="mb-2 text-[13px] text-primary-600">Posting your report…</p>}
            <div className="flex items-center justify-between gap-3">
              {step === 3 ? (
                <button type="button" onClick={() => patch({ step: 2 })} className="press-tight min-h-11 px-2 text-[15px] font-semibold text-primary-600 hover:text-primary-900">
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void post()}
                  disabled={!d.stars || posting}
                  className="press-tight min-h-11 px-2 text-[15px] font-semibold text-primary-700 hover:text-primary-900 disabled:text-primary-400"
                >
                  {editing ? "Save now" : "Post now"}
                </button>
              )}
              {step === 3 ? (
                <button
                  type="button"
                  onClick={() => void post()}
                  disabled={!d.stars || posting || error?.problem === "exists"}
                  className="press-tight min-h-12 px-7 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[16px] font-semibold disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {posting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {posting ? "Posting…" : !signedIn ? "Log in to post" : editing ? "Save changes" : "Post"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => patch({ step: (d.step + 1) as Step })}
                  disabled={!d.stars || posting}
                  className="press-tight min-h-12 px-7 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[16px] font-semibold disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {posting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {step === 2 && !tappedHere ? "Skip" : "Next"}
                </button>
              )}
            </div>
          </div>
        )}

        {confirmLeave && (
          <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-white/70 backdrop-blur-[2px] p-4" role="alertdialog" aria-modal="true" aria-labelledby="report-leave">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-elevated border border-primary-100 p-5 animate-fade-in">
              <p id="report-leave" className="text-[17px] font-semibold text-primary-900">Leave your report?</p>
              <p className="mt-1 text-[14px] text-primary-600">We&apos;ll keep your answers on this phone.</p>
              <div className="mt-4 flex gap-2">
                <button type="button" autoFocus onClick={() => setConfirmLeave(false)} className="press-tight flex-1 min-h-11 rounded-full bg-primary-900 text-white text-[15px] font-semibold">
                  Keep going
                </button>
                <button type="button" onClick={onClose} className="press-tight flex-1 min-h-11 rounded-full bg-primary-100 text-primary-900 text-[15px] font-semibold">
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ViewportOverlay>
  );

  return createPortal(sheet, document.body);
}

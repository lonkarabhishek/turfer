"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Inbox, Loader2, Phone } from "lucide-react";
import { agoText } from "@/lib/availability/slots";
import { spacedPhone } from "@/lib/account/display";
import { OWNER_COPY, REASON_MAX } from "@/lib/booking/requests";
import { answerBooking, getOwnerBookings, setBookingRequests, type OwnerAnswer } from "@/lib/booking/ownerClient";
import type { OwnerBookingRequest, OwnerBookings } from "@/lib/booking/types";

const RELOAD_AFTER_MS = 60_000;
type Action = "confirm" | "decline" | "cancel";
export type AnswerResult = { ok: true; done: Action; others: number } | { ok: false; error: "taken" | "answered" | "started" | "forbidden" | "network" | "other" };

const isState = (r: OwnerAnswer): r is OwnerBookings => "ok" in r && r.ok === true;

/**
 * Booking requests on a turf's myTapturf page: the owner's list and switch
 * (owner_booking_requests, owner_set_booking_requests,
 * owner_answer_booking_request, 20261106_booking_requests.sql), read on
 * open and again when the tab comes back after a minute. Hidden before the
 * database has booking requests, and for anyone who doesn't run the turf.
 * After a confirm or a cancel, onSlotsChanged reads Free slots again, so its
 * hours show the new Booked or Free marks.
 */
export function useOwnerBookings(turfId: string, { onSlotsChanged }: { onSlotsChanged?: () => void } = {}) {
  const [state, setState] = useState<OwnerBookings | null>(null);
  const [hidden, setHidden] = useState(false);
  const lastLoad = useRef(0);
  const changed = useRef(onSlotsChanged);
  useEffect(() => {
    changed.current = onSlotsChanged;
  });

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const r = await getOwnerBookings(turfId);
      if (r === "missing" || (!isState(r) && (r.error === "forbidden" || r.error === "not_claimed"))) {
        setHidden(true);
        setState(null);
        return;
      }
      if (isState(r)) {
        setHidden(false);
        setState(r);
      }
    } catch {
      /* keep what is shown */
    }
  }, [turfId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > RELOAD_AFTER_MS) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /** The switch. True when saved. */
  const setOn = useCallback(
    async (on: boolean): Promise<boolean> => {
      try {
        const r = await setBookingRequests(turfId, on);
        if (!isState(r)) return false;
        setState(r);
        return true;
      } catch {
        return false;
      }
    },
    [turfId],
  );

  /** Confirm, decline or cancel; the list after it, and Free slots read again when hours changed. */
  const answer = useCallback(
    async (id: string, action: Action, reason: string | null): Promise<AnswerResult> => {
      let r: OwnerAnswer;
      try {
        r = await answerBooking(id, action, reason);
      } catch {
        return { ok: false, error: "network" };
      }
      if (isState(r)) {
        setState(r);
        if (action !== "decline") changed.current?.();
        return { ok: true, done: action, others: r.declined_others ?? 0 };
      }
      if (r.error === "answered") void load();
      if (r.error === "taken" || r.error === "answered" || r.error === "started" || r.error === "forbidden") return { ok: false, error: r.error };
      if (r.error === "not_claimed") return { ok: false, error: "forbidden" };
      return { ok: false, error: "other" };
    },
    [load],
  );

  return { state, hidden, reload: load, setOn, answer };
}

export type OwnerBookingsHook = ReturnType<typeof useOwnerBookings>;

const CARD = "rounded-2xl border border-primary-200 bg-white p-4";
const HALF = "h-11 rounded-full text-[14px] font-semibold cursor-pointer touch-manipulation inline-flex items-center justify-center gap-1.5 disabled:opacity-50";

/** The list at the top of Free slots: waiting requests (newest first) to Confirm or Decline, and the confirmed ones coming up. */
export function BookingRequests({ turfId, hook, grounds }: { turfId: string; hook: OwnerBookingsHook; grounds: number | null }) {
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const s = hook.state;
  if (!s || (!s.waiting.length && !s.confirmed.length && !flash)) return null;

  const done = (text: string) => {
    setFlash(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 8000);
  };

  return (
    <section id="requests" aria-labelledby="requests-h" className="mt-3 scroll-mt-20">
      <h3 id="requests-h" className="text-[16px] font-bold text-primary-900 inline-flex items-center gap-2">
        <Inbox className="w-4 h-4 text-accent-700" aria-hidden /> {OWNER_COPY.heading(s.waiting.length)}
      </h3>
      {grounds != null && grounds >= 2 && s.waiting.length > 0 && <p className="mt-1 text-[13px] text-primary-500 leading-snug">{OWNER_COPY.grounds}</p>}
      <p aria-live="polite" className={flash ? "mt-2 rounded-xl bg-accent-50 px-3 py-2.5 text-[14px] font-semibold text-accent-800 inline-flex items-start gap-2" : "sr-only"}>
        {flash && <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
        {flash}
      </p>
      {s.waiting.length > 0 && (
        <ul className="mt-2 space-y-2.5">
          {s.waiting.map((r) => (
            <Waiting key={r.id} r={r} now={s.now} turfId={turfId} hook={hook} onDone={done} />
          ))}
        </ul>
      )}
      {s.confirmed.length > 0 && (
        <>
          <h4 className="mt-4 text-[13px] font-bold text-primary-700">{OWNER_COPY.comingUp}</h4>
          <ul className="mt-2 space-y-2">
            {s.confirmed.map((r) => (
              <Confirmed key={r.id} r={r} turfId={turfId} hook={hook} onDone={done} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Who({ r }: { r: OwnerBookingRequest }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <p className="min-w-0 text-[15px] text-primary-900">
        <span className="block truncate font-semibold">{r.name}</span>
        <span className="block text-[13px] text-primary-500 tabular-nums">{spacedPhone(r.phone)}</span>
      </p>
      <a
        href={`tel:${r.phone}`}
        aria-label={`${OWNER_COPY.call} ${r.name}`}
        className="shrink-0 h-11 px-4 rounded-full border border-primary-200 text-[14px] font-semibold text-primary-900 inline-flex items-center gap-1.5 touch-manipulation hover:bg-primary-50"
      >
        <Phone className="w-4 h-4" aria-hidden /> {OWNER_COPY.call}
      </a>
    </div>
  );
}

function ErrorLine({ error, turfId }: { error: Extract<AnswerResult, { ok: false }>["error"]; turfId: string }) {
  return (
    <p role="alert" className="mt-2 text-[13px] text-red-600">
      {error === "forbidden" ? (
        <>
          {OWNER_COPY.forbidden}{" "}
          <Link href={`/login?next=${encodeURIComponent(`/my/turf/${turfId}`)}`} className="font-semibold underline">
            {OWNER_COPY.signInAgain}
          </Link>
          .
        </>
      ) : (
        OWNER_COPY[error]
      )}
    </p>
  );
}

function ReasonForm({ id, question, value, onChange, busy, confirmLabel, onConfirm, onKeep }: {
  id: string;
  question: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl bg-primary-50 p-3">
      <p className="text-[14px] font-semibold text-primary-900">{question}</p>
      <label htmlFor={id} className="mt-2 block text-[13px] text-primary-600">
        {OWNER_COPY.reasonLabel}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={REASON_MAX}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        placeholder={OWNER_COPY.reasonPlaceholder}
        className="mt-1 w-full h-11 px-3 rounded-xl border border-primary-200 bg-white text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:border-primary-400"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={onConfirm} disabled={busy} className={`${HALF} bg-primary-900 text-white`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {confirmLabel}
        </button>
        <button type="button" onClick={onKeep} disabled={busy} className={`${HALF} border border-primary-200 bg-white text-primary-900`}>
          {OWNER_COPY.keep}
        </button>
      </div>
    </div>
  );
}

/** A reason as it is sent: one plain line, trimmed; none when empty. */
const reasonOf = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, REASON_MAX) || null;

function Waiting({ r, now, turfId, hook, onDone }: { r: OwnerBookingRequest; now: string; turfId: string; hook: OwnerBookingsHook; onDone: (text: string) => void }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<Extract<AnswerResult, { ok: false }>["error"] | null>(null);
  const go = async (action: Action) => {
    setBusy(action);
    setError(null);
    const out = await hook.answer(r.id, action, action === "decline" ? reasonOf(reason) : null);
    setBusy(null);
    if (out.ok) onDone(action === "confirm" ? OWNER_COPY.confirmed(out.others) : OWNER_COPY.declined);
    else setError(out.error);
  };
  return (
    <li className={`${CARD} border-2 border-accent-500/40`}>
      <p className="text-[16px] font-bold text-primary-900 tabular-nums">{r.when}</p>
      <Who r={r} />
      {r.note && <p className="mt-2 text-[14px] text-primary-700 italic break-words">&ldquo;{r.note}&rdquo;</p>}
      <p className="mt-1.5 text-[12px] text-primary-500">{OWNER_COPY.sent(agoText(r.created_at, Date.parse(now)))}</p>
      {error && <ErrorLine error={error} turfId={turfId} />}
      {asking ? (
        <ReasonForm
          id={`reason-${r.id}`}
          question={OWNER_COPY.askDecline}
          value={reason}
          onChange={setReason}
          busy={busy === "decline"}
          confirmLabel={OWNER_COPY.declineRequest}
          onConfirm={() => void go("decline")}
          onKeep={() => {
            setAsking(false);
            setReason("");
          }}
        />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void go("confirm")} disabled={!!busy} className={`${HALF} bg-accent-600 hover:bg-accent-700 text-white`}>
            {busy === "confirm" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {OWNER_COPY.confirming}
              </>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden /> {OWNER_COPY.confirm}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
            disabled={!!busy}
            className={`${HALF} border border-primary-200 bg-white text-primary-900 hover:bg-primary-50`}
          >
            {OWNER_COPY.decline}
          </button>
        </div>
      )}
    </li>
  );
}

function Confirmed({ r, turfId, hook, onDone }: { r: OwnerBookingRequest; turfId: string; hook: OwnerBookingsHook; onDone: (text: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<Extract<AnswerResult, { ok: false }>["error"] | null>(null);
  const cancel = async () => {
    setBusy(true);
    setError(null);
    const out = await hook.answer(r.id, "cancel", reasonOf(reason));
    setBusy(false);
    if (out.ok) onDone(OWNER_COPY.cancelled);
    else setError(out.error);
  };
  return (
    <li className={CARD}>
      <p className="text-[15px] font-bold text-primary-900 tabular-nums">{r.when}</p>
      <Who r={r} />
      {error && <ErrorLine error={error} turfId={turfId} />}
      {asking ? (
        <ReasonForm
          id={`cancel-${r.id}`}
          question={OWNER_COPY.askCancel(r.name)}
          value={reason}
          onChange={setReason}
          busy={busy}
          confirmLabel={OWNER_COPY.cancelBooking}
          onConfirm={() => void cancel()}
          onKeep={() => {
            setAsking(false);
            setReason("");
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          className="mt-2 h-11 px-3 -mx-1 rounded-full text-[14px] font-semibold text-hot-600 cursor-pointer touch-manipulation hover:bg-hot-500/10"
        >
          {OWNER_COPY.cancelBooking}
        </button>
      )}
    </li>
  );
}

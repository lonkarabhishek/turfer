"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CalendarX, ChevronRight, Loader2, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cancelBookingCall } from "@/lib/booking/client";
import { ME_COPY, cancelOutcome, meLine, sortMine } from "@/lib/booking/requests";
import type { BookingStatus, MyBookingRequest } from "@/lib/booking/types";

const PILL: Record<BookingStatus, { cls: string; icon: typeof X }> = {
  waiting: { cls: "bg-amber-50 text-amber-800 border border-amber-200", icon: CalendarClock },
  confirmed: { cls: "bg-accent-50 text-accent-800 border border-accent-500/40", icon: CalendarCheck },
  declined: { cls: "bg-primary-100 text-primary-600", icon: CalendarX },
  cancelled: { cls: "bg-primary-100 text-primary-600", icon: CalendarX },
  expired: { cls: "bg-primary-100 text-primary-600", icon: CalendarX },
};

const sentOn = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * The player's turf requests on the Me tab's Requests (booking requests:
 * lib/booking): each turf, its day and hours, the note, where it stands
 * (waiting, confirmed, declined, cancelled, expired) and, while it hasn't
 * started, a way to cancel it. Waiting and confirmed ones still to come
 * first. Nothing when there are none. The list comes from the Me tab
 * (useMeData), which counts the waiting ones and reads it again whenever the
 * Requests tab is shown. Every row is the database's state as of that read
 * (its status, can_cancel), never worked out again with the phone's clock,
 * so the pill, the line and the button agree. A cancel names the state the
 * row showed, so one the turf answered meanwhile is not cancelled.
 */
export function MyBookingRequests({ bookings, reload }: { bookings: MyBookingRequest[]; reload: () => Promise<void> }) {
  if (!bookings.length) return null;
  return (
    <section aria-labelledby="turf-requests">
      <h2 id="turf-requests" className="text-[13px] font-bold text-primary-800 mb-2.5">
        {ME_COPY.heading}
      </h2>
      <ul className="space-y-2.5">
        {sortMine(bookings).map((r) => (
          <Row key={r.id} r={r} reload={reload} />
        ))}
      </ul>
    </section>
  );
}

function Row({ r, reload }: { r: MyBookingRequest; reload: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pill = PILL[r.status] ?? PILL.expired;
  const Icon = pill.icon;
  const open = r.status === "waiting" || r.status === "confirmed";

  const cancel = async () => {
    if (r.status !== "waiting" && r.status !== "confirmed") return;
    setBusy(true);
    setError(null);
    setNote(null);
    const a = await cancelBookingCall(getToken, r.id, r.status);
    const out = cancelOutcome(a.status, a.body);
    if (out.done || out.reload) await reload();
    setBusy(false);
    setAsking(false);
    if (!out.done) {
      setError(out.error);
      setNote(out.note);
    }
  };

  return (
    <li className={`rounded-2xl border bg-white p-3.5 ${r.status === "waiting" ? "border-amber-200" : r.status === "confirmed" ? "border-accent-500/40" : "border-primary-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/turf/${r.turf_slug ?? r.turf_id}`} className="group min-w-0 flex-1 rounded-lg focus-neon">
          <span className="flex items-center gap-1 text-[15px] font-semibold text-primary-900 group-hover:text-accent-700 transition-colors">
            <span className="truncate">{r.turf_name || "The turf"}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
          </span>
          <span className="mt-0.5 block text-[13px] text-primary-600 tabular-nums">{r.when}</span>
        </Link>
        <span className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold ${pill.cls}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden />
          {ME_COPY.pill[r.status] ?? r.status}
        </span>
      </div>

      {r.note && <p className="mt-2 text-[13px] text-primary-600 italic break-words">&ldquo;{r.note}&rdquo;</p>}
      <p className="mt-2 text-[13px] text-primary-800">{meLine(r)}</p>
      {r.reason && (r.status === "declined" || r.status === "cancelled") && r.changed_by === "owner" && (
        <p className="mt-0.5 text-[13px] text-primary-600 break-words">{ME_COPY.said(r.reason)}</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-hot-600">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 rounded-xl bg-accent-50 px-3 py-2 text-[13px] font-semibold text-accent-800">
          {note}
        </p>
      )}

      {asking ? (
        <div className="mt-2.5 rounded-xl bg-primary-50 p-3">
          <p className="text-[14px] font-semibold text-primary-900">{ME_COPY.askCancel}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={busy}
              className="h-11 rounded-full bg-hot-600 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {ME_COPY.yesCancel}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="h-11 rounded-full border border-primary-200 bg-white text-primary-900 text-[14px] font-semibold cursor-pointer disabled:opacity-60"
            >
              {ME_COPY.keep}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="text-[12px] text-primary-500">{ME_COPY.sent(sentOn(r.created_at))}</span>
          {open && r.can_cancel && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNote(null);
                if (r.status === "waiting") void cancel();
                else setAsking(true);
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 min-h-11 text-[13px] font-semibold text-hot-600 hover:bg-hot-500/10 px-3 rounded-full transition-colors focus-neon disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <X className="w-3.5 h-3.5" aria-hidden />}
              {r.status === "waiting" ? ME_COPY.cancelRequest : ME_COPY.cancel}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

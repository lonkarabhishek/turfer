"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BellRing, CheckCircle2, IndianRupee, Loader2, Phone, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { logContactClick } from "@/lib/analytics/contactClicks";
import { tickStepHref } from "@/lib/account/verified";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";
import { contactLinks, slotMessage, type Slot, type SlotDay, type SlotKey } from "@/lib/availability/slots";
import { NOTE_MAX, SHEET_COPY, hourChoices, requestWhatsAppText, sendOutcome, whenDay, whenText, type SheetOutcome } from "@/lib/booking/requests";
import { sendBookingCall } from "@/lib/booking/client";
import { cleanNote } from "@/lib/booking/payload";
import { Sheet } from "@/components/account/Sheet";

type Phase = "form" | "sending" | "signed_out" | Exclude<SheetOutcome, "failed">;

const PRIMARY = "w-full h-12 rounded-full bg-primary-800 hover:bg-primary-900 text-white font-bold text-[15px] cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation";
const SECONDARY = "w-full h-12 rounded-full border-2 border-primary-200 text-primary-700 font-semibold text-[15px] cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation";
const LINK = "inline-flex items-center min-h-11 px-1 text-[14px] font-semibold text-accent-700 underline underline-offset-2 cursor-pointer";

/**
 * The turf page's request sheet (opened from a free time on the card, on a
 * turf that takes booking requests: components/turf/FreeSlotsCard.tsx).
 * The player picks 1 to 3 hours from the tapped one, may add a note, and
 * sends; the turf confirms or declines on myTapturf and they get a
 * message. Nothing is paid online. Signed out, it asks them to log in; a
 * Google account with no verified number is told how to add one (a phone
 * sign-in is never asked before sending: its number is the one it signed in
 * with). Every rule and word is in lib/booking/requests.ts; the database
 * checks them all again.
 */
export function RequestSheet({
  turfId,
  turfName,
  pageUrl,
  day,
  slot,
  booked,
  phone,
  whatsappPhone,
  onClose,
  onTaken,
  onOff,
}: {
  turfId: string;
  turfName: string;
  pageUrl: string;
  day: SlotDay;
  slot: Slot;
  booked: ReadonlySet<SlotKey>;
  phone: string | null;
  whatsappPhone: string | null;
  onClose: () => void;
  /** The server says some of these hours are booked now: the card marks them. */
  onTaken: (booked: SlotKey[]) => void;
  /** The turf stopped taking requests: the card goes back to Call and WhatsApp. */
  onOff: () => void;
}) {
  const uid = useId();
  const { user, login, signedInWith, getToken } = useAuth();
  const choices = useMemo(() => hourChoices(day, booked, slot.key), [day, booked, slot.key]);
  const [hours, setHours] = useState(1);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [sentWhen, setSentWhen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    !user ? "signed_out" : signedInWith === "google" && user.phoneProven === false ? "no_phone" : choices.length ? "form" : "taken",
  );
  const when = whenText(slot.key, hours);
  const sending = phase === "sending";

  const { call, whatsapp } = contactLinks(phone, whatsappPhone);
  const contact = whatsapp
    ? { href: buildWhatsAppLink({ phone: whatsapp.digits, text: slotMessage({ turfName, pageUrl, day, slot }) }), label: SHEET_COPY.orWhatsApp, kind: "whatsapp" as const }
    : call
      ? { href: `tel:${call.e164}`, label: SHEET_COPY.orCall, kind: "call" as const }
      : null;
  const contactLink = contact && (
    <a
      href={contact.href}
      {...(contact.kind === "whatsapp" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={() => logContactClick({ turfId, kind: contact.kind, source: "turf_slots", signedIn: !!user, userId: user?.id })}
      className={LINK}
    >
      {contact.label}
    </a>
  );

  const send = async () => {
    const n = cleanNote(note);
    if (sending || "bad" in n) return;
    setFailed(false);
    setPhase("sending");
    const a = await sendBookingCall(getToken, { turf_id: turfId, at: slot.key, hours, note: n.ok });
    const out = sendOutcome(a.status, a.body);
    if (out === "failed") {
      setFailed(true);
      setPhase("form");
      return;
    }
    if (out === "sent") {
      const r = (a.body as { request?: { when?: unknown } }).request;
      setSentWhen(typeof r?.when === "string" ? r.when : whenText(slot.key, hours));
    }
    if (out === "taken") {
      const keys = (a.body as { booked?: unknown }).booked;
      onTaken(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : []);
    }
    if (out === "off") onOff();
    setPhase(out);
  };

  const logIn = () => {
    onClose();
    login();
  };
  const seeRequests = (
    <Link href="/dashboard?tab=requests" className={LINK}>
      {SHEET_COPY.seeRequests}
    </Link>
  );
  const notice = (text: string, tone: "amber" | "plain" = "plain") => (
    <p role="status" className={`mt-4 rounded-2xl px-4 py-3 text-[14px] leading-snug ${tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-primary-50 text-primary-800"}`}>
      {text}
    </p>
  );
  const closeButton = (label: string = SHEET_COPY.cancel) => (
    <button type="button" onClick={onClose} className={`mt-3 ${SECONDARY}`}>
      {label}
    </button>
  );

  return (
    <Sheet labelledBy={`${uid}-title`} describedBy={`${uid}-when`} onClose={onClose} locked={sending}>
      <h2 id={`${uid}-title`} className="font-display text-2xl text-primary-900 leading-tight outline-none">
        {SHEET_COPY.title}
      </h2>
      <p className="mt-1 text-[14px] text-primary-600 truncate">{turfName}</p>
      <p id={`${uid}-when`} className="mt-0.5 text-[16px] font-semibold text-primary-900 tabular-nums">
        {phase === "sent" && sentWhen ? sentWhen : when}
      </p>

      {(phase === "form" || phase === "sending") && (
        <>
          <fieldset className="mt-5" disabled={sending}>
            <legend className="text-[14px] font-semibold text-primary-800">{SHEET_COPY.howLong}</legend>
            <div role="radiogroup" aria-label={SHEET_COPY.howLong} className="mt-2 grid grid-cols-3 gap-2">
              {choices.map((c) => {
                const on = c.hours === hours;
                return (
                  <button
                    key={c.hours}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${SHEET_COPY.hours(c.hours)}, ${c.range}`}
                    onClick={() => setHours(c.hours)}
                    className={`min-h-[56px] rounded-2xl border-2 px-1 flex flex-col items-center justify-center cursor-pointer touch-manipulation transition-colors ${
                      on ? "bg-primary-900 border-primary-900 text-white" : "bg-white border-primary-200 text-primary-900 hover:border-primary-400"
                    }`}
                  >
                    <span className="text-[15px] font-bold leading-tight">{SHEET_COPY.hours(c.hours)}</span>
                    <span className={`text-[12px] leading-tight tabular-nums ${on ? "text-white/80" : "text-primary-500"}`}>{SHEET_COPY.until(c.until)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${uid}-note`} className="text-[14px] font-semibold text-primary-800">
                {SHEET_COPY.noteLabel}
              </label>
              <span className="text-[12px] text-primary-400 tabular-nums" aria-hidden>
                {[...note].length}/{NOTE_MAX}
              </span>
            </div>
            <input
              id={`${uid}-note`}
              type="text"
              value={note}
              maxLength={NOTE_MAX}
              disabled={sending}
              onChange={(e) => setNote(e.target.value)}
              placeholder={SHEET_COPY.notePlaceholder}
              className="mt-1.5 w-full h-12 px-4 rounded-xl border border-primary-200 bg-white text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:border-primary-500 disabled:bg-primary-50"
            />
          </div>

          <ul className="mt-4 space-y-1.5 text-[14px] text-primary-700 leading-snug">
            <li className="flex gap-2">
              <UserRound className="w-4 h-4 mt-0.5 shrink-0 text-primary-400" aria-hidden />
              {SHEET_COPY.seesYou}
            </li>
            <li className="flex gap-2">
              <IndianRupee className="w-4 h-4 mt-0.5 shrink-0 text-primary-400" aria-hidden />
              {SHEET_COPY.pay}
            </li>
            <li className="flex gap-2">
              <BellRing className="w-4 h-4 mt-0.5 shrink-0 text-primary-400" aria-hidden />
              {SHEET_COPY.confirms}
            </li>
          </ul>

          {failed && (
            <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-800 leading-snug">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              {SHEET_COPY.failed}
            </p>
          )}

          <button type="button" onClick={() => void send()} disabled={sending} className={`mt-5 ${PRIMARY}`}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {SHEET_COPY.sending}
              </>
            ) : (
              SHEET_COPY.send
            )}
          </button>
          <button type="button" onClick={onClose} disabled={sending} className={`mt-3 ${SECONDARY}`}>
            {SHEET_COPY.cancel}
          </button>
          {contactLink && <p className="mt-2 text-center">{contactLink}</p>}
        </>
      )}

      {phase === "signed_out" && (
        <>
          {notice(SHEET_COPY.signedOut)}
          <p className="mt-3 text-[14px] text-primary-600">{SHEET_COPY.seesYou}</p>
          <button type="button" onClick={logIn} className={`mt-5 ${PRIMARY}`}>
            {SHEET_COPY.logIn}
          </button>
          {closeButton()}
        </>
      )}

      {phase === "no_phone" && (
        <>
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Phone className="w-4 h-4 shrink-0" aria-hidden /> {SHEET_COPY.noPhoneTitle}
            </p>
            <p className="mt-1 text-[14px] leading-snug">{SHEET_COPY.noPhoneBody}</p>
          </div>
          {user?.phoneSettable ? (
            <Link href={tickStepHref("phone")} onClick={onClose} className={`mt-5 ${PRIMARY}`}>
              {SHEET_COPY.addNumber}
            </Link>
          ) : (
            <p className="mt-4 text-[14px] text-primary-700">{SHEET_COPY.phoneLogin}</p>
          )}
          {closeButton()}
          {contactLink && <p className="mt-2 text-center">{contactLink}</p>}
        </>
      )}

      {phase === "sent" && (
        <>
          <div role="status" className="mt-4 rounded-2xl bg-accent-50 border border-accent-200 px-4 py-4">
            <p className="flex items-center gap-2 text-[17px] font-bold text-accent-800">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden /> {SHEET_COPY.sent}
            </p>
            <p className="mt-1 text-[14px] text-primary-800 leading-snug">{SHEET_COPY.sentLine}</p>
            <p className="mt-2 text-[14px] font-semibold text-primary-900">{SHEET_COPY.atTurf(sentWhen ?? when, turfName)}</p>
            <p className="mt-0.5 text-[14px] text-primary-700">{SHEET_COPY.payShort}</p>
          </div>
          {whatsapp && (
            <a
              href={buildWhatsAppLink({ phone: whatsapp.digits, text: requestWhatsAppText({ turfName, when: sentWhen ?? when }) })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logContactClick({ turfId, kind: "whatsapp", source: "turf_request", signedIn: !!user, userId: user?.id })}
              className="mt-5 w-full h-12 rounded-full bg-[#1FAF54] hover:bg-[#189446] text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 touch-manipulation"
            >
              {SHEET_COPY.tellWhatsApp}
            </a>
          )}
          <button type="button" onClick={onClose} className={`${whatsapp ? "mt-3" : "mt-5"} ${whatsapp ? SECONDARY : PRIMARY}`}>
            {SHEET_COPY.done}
          </button>
          <p className="mt-2 text-center">{seeRequests}</p>
        </>
      )}

      {(phase === "limit_waiting" || phase === "limit_day" || phase === "limit_sends") && (
        <>
          {notice(phase === "limit_waiting" ? SHEET_COPY.limitWaiting : phase === "limit_day" ? SHEET_COPY.limitDay(whenDay(slot.key)) : SHEET_COPY.limitSends, "amber")}
          <p className="mt-2">{seeRequests}</p>
          {closeButton(SHEET_COPY.done)}
        </>
      )}

      {phase === "taken" && (
        <>
          {notice(SHEET_COPY.taken, "amber")}
          <button type="button" onClick={onClose} className={`mt-5 ${PRIMARY}`}>
            {SHEET_COPY.pickAnother}
          </button>
        </>
      )}

      {phase === "off" && (
        <>
          {notice(SHEET_COPY.off)}
          {contactLink && <p className="mt-2">{contactLink}</p>}
          {closeButton(SHEET_COPY.done)}
        </>
      )}

      {phase === "own" && (
        <>
          {notice(SHEET_COPY.own)}
          <Link href={`/my/turf/${turfId}`} className={`mt-5 ${PRIMARY}`}>
            {SHEET_COPY.openMy}
          </Link>
          {closeButton()}
        </>
      )}

      {phase === "sign_in" && (
        <>
          {notice(SHEET_COPY.signIn, "amber")}
          <button type="button" onClick={logIn} className={`mt-5 ${PRIMARY}`}>
            {SHEET_COPY.logIn}
          </button>
          {closeButton()}
        </>
      )}
    </Sheet>
  );
}

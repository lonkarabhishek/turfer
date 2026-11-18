"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink, generateTurfInquiryMessage } from "@/lib/utils/whatsapp";
import { logContactClick, type ContactKind } from "@/lib/analytics/contactClicks";
import { gaEvent } from "@/lib/analytics/ga";
import { contactLinks } from "@/lib/utils/contact";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Slot, SlotDay, SlotHours, SlotKey } from "@/lib/availability/slots";
import type { AskDraft } from "@/lib/slotAsk/ask";
import { ASK_COPY } from "@/lib/slotAsk/copy";
import { clearDraft, loadDraft } from "@/lib/slotAsk/device";

// "Ask for a slot" and the request sheet are fetched on the first tap only, so the turf page's first load does not grow.
const SlotAskSheet = dynamic(() => import("@/components/turf/SlotAskSheet").then((m) => m.SlotAskSheet), { ssr: false });
const RequestSheet = dynamic(() => import("@/components/turf/RequestSheet").then((m) => m.RequestSheet), { ssr: false });

/**
 * What "Ask for a slot" needs from the turf page (the page passes it only
 * where the turf is not a members' club): the hours its page shows, the
 * sports it lists and whether it is claimed (only a claimed turf can have
 * Free slots marked).
 */
export type SlotAskInfo = { hours: SlotHours; sports: readonly string[]; claimed: boolean };

interface CTAButtonsProps {
  turfId: string;
  /**
   * Number to call. Mobile or landline; landlines get a Call button only.
   * Null when the turf lists only a WhatsApp number (an owner who saved
   * just "WhatsApp number for bookings"): then WhatsApp shows alone.
   */
  phone: string | null;
  /** Number for WhatsApp when it differs from `phone`. Must be a mobile. */
  whatsappPhone?: string | null;
  turfName: string;
  address: string;
  /** compact: two small pills, for a table cell (Ask's comparison). */
  variant?: "inline" | "fixed-bottom" | "compact";
  /** Where the tap is counted from; else turf_bar or turf_sidebar by variant. */
  source?: string;
  /** Sidebar call button text. "Call to ask" for members-only clubs. */
  callLabel?: string;
  /**
   * The turf's page as the WhatsApp message links it (turfUrl, by slug).
   * From the server, so the link the page renders with is the one it
   * hydrates with. Required, so no message can fall back to the id URL
   * (/turf/<uuid>, the address before 19 Oct) any more.
   */
  pageUrl: string;
  /** The phone bar only: a line over Call and WhatsApp (the turf page's "For bookings, contact the turf directly."). */
  note?: string | null;
  /**
   * The turf page only (the bar and the sidebar; never a list card or an
   * Ask card): "Ask for a slot" takes the WhatsApp button's place, wherever
   * that button shows (a WhatsApp-capable number, by contactLinks). It
   * opens the sheet (components/turf/SlotAskSheet.tsx): a day, a time, and
   * WhatsApp opens with the message written. The plain chat is one tap away
   * inside it ("Just message them"), counted from the same source as before.
   */
  ask?: SlotAskInfo | null;
}

/**
 * Call / WhatsApp buttons on a turf page. Both are auth-gated: a
 * visitor who hasn't signed in gets prompted with the login modal
 * on click. Once they're in, the actual tel:/wa.me link opens.
 * That way we don't burn contact intent when someone's not signed in,
 * but we don't force auth to *read* the page either. "Ask for a slot"
 * (the `ask` prop) opens its sheet without a sign-in, so the picking comes
 * first; its Send is behind the same gate.
 */
export function CTAButtons({
  turfId,
  phone,
  whatsappPhone,
  turfName,
  address,
  variant = "inline",
  callLabel = "Call to Book",
  pageUrl,
  source: sourceProp,
  note,
  ask,
}: CTAButtonsProps) {
  const { user, login } = useAuth();
  // The sheet, while it is open: when it was opened, and what a signed-out player had picked before the sign-in.
  const [sheet, setSheet] = useState<{ at: number; draft: AskDraft | null } | null>(null);
  // A free hour on a turf that takes requests on TapTurf: the request sheet (as the Free slots card opens it).
  const [request, setRequest] = useState<{ day: SlotDay; slot: Slot; booked: SlotKey[] } | null>(null);
  const askButton = useRef<HTMLButtonElement>(null);
  const signedIn = !!user;
  const asks = !!ask;
  // Back from the sign-in that Send opened: the sheet opens again with what was picked, in whichever of the bar and the sidebar is on screen.
  useEffect(() => {
    if (!asks || !signedIn) return;
    const t = setTimeout(() => {
      if (!askButton.current?.getClientRects().length) return;
      const draft = loadDraft(turfId, Date.now());
      if (!draft) return;
      clearDraft();
      setSheet({ at: Date.now(), draft });
    }, 0);
    return () => clearTimeout(t);
  }, [asks, signedIn, turfId]);
  // WhatsApp needs a mobile: the dedicated whatsapp_phone, else the call
  // number itself when it is one. Landline-only turfs get Call alone.
  const { call: normalized, whatsapp: wa } = contactLinks(phone, whatsappPhone);
  if (!normalized && !wa) return null;

  const telHref = normalized ? `tel:${normalized.e164}` : null;
  const whatsappUrl = wa
    ? buildWhatsAppLink({
        phone: wa.digits,
        text: generateTurfInquiryMessage({ name: turfName, address, url: pageUrl }),
      })
    : null;

  // Intercept the click when signed out. We preventDefault first so
  // the OS never opens the dialer / WhatsApp, then pop the login
  // modal. After a successful sign-in the user just clicks again — a
  // shorter path than trying to buffer + replay a system link across
  // a modal transition.
  const source = sourceProp ?? (variant === "fixed-bottom" ? "turf_bar" : "turf_sidebar");
  const guard = (kind: ContactKind) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Count every tap; signed_in=false marks the ones that hit login.
    logContactClick({ turfId, kind, source, signedIn: !!user, userId: user?.id, turfName });
    if (user) return; // signed-in: let the link fire naturally
    e.preventDefault();
    login();
  };

  // "Ask for a slot" where the WhatsApp button would show, on the turf page's bar and sidebar.
  const asking = !!ask && !!wa && !!whatsappUrl && variant !== "compact";
  const openAsk = () => {
    clearDraft();
    gaEvent("slot_ask_open", { turf_id: turfId, source });
    setSheet({ at: Date.now(), draft: null });
  };
  // Drawn on the body, not where the buttons are: the sidebar is a sticky column under the site's header, and a sheet inside it would sit under that header.
  const sheets = asking && ask && wa && whatsappUrl && (sheet || request) && createPortal(
    <>
      {sheet && (
        <SlotAskSheet
          turfId={turfId}
          turfName={turfName}
          pageUrl={pageUrl}
          hours={ask.hours}
          sports={ask.sports}
          claimed={ask.claimed}
          waDigits={wa.digits}
          plainHref={whatsappUrl}
          plainSource={source}
          openedAt={sheet.at}
          draft={sheet.draft}
          onClose={() => setSheet(null)}
          onRequest={(day, slot, booked) => {
            setSheet(null);
            setRequest({ day, slot, booked });
          }}
        />
      )}
      {request && (
        <RequestSheet
          turfId={turfId}
          turfName={turfName}
          pageUrl={pageUrl}
          day={request.day}
          slot={request.slot}
          booked={new Set(request.booked)}
          phone={phone}
          whatsappPhone={whatsappPhone ?? null}
          onClose={() => setRequest(null)}
          onTaken={() => {}}
          onOff={() => {}}
        />
      )}
    </>,
    document.body,
  );

  if (variant === "fixed-bottom") {
    return (
      <>
      <div data-bottom-bar="" className={`fixed bottom-0 left-0 right-0 z-50 material-thick border-t border-primary-200/70 px-4 md:hidden animate-slide-up ${note ? "pt-2.5" : "pt-3"}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {/* The same line over the buttons as the no-number bar's (components/turf/TurfSuggestions.tsx NoContactNotice). */}
        {note && <p className="text-[13px] leading-snug text-primary-500">{note}</p>}
        <div className={`flex gap-3 ${note ? "mt-2" : ""}`}>
        {telHref && (
          <a
            href={telHref}
            onClick={guard("call")}
            className={`${asking ? "flex-[2]" : "flex-1"} flex items-center justify-center gap-2 text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer ${
              whatsappUrl
                ? "bg-primary-100 active:bg-primary-200 text-primary-900"
                : "bg-accent-500 active:bg-accent-600 text-white"
            }`}
          >
            <Phone className="w-5 h-5" />
            {whatsappUrl ? "Call" : normalized?.type === "landline" ? "Call (landline)" : "Call"}
          </a>
        )}
        {asking ? (
          // Wider than Call, so the three words fit a 320px phone on one line.
          <button
            ref={askButton}
            type="button"
            onClick={openAsk}
            aria-haspopup="dialog"
            data-slot-ask-open=""
            className={`${telHref ? "flex-[3]" : "flex-1"} flex items-center justify-center gap-2 bg-accent-500 active:bg-accent-600 text-white text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer whitespace-nowrap touch-manipulation`}
          >
            <MessageCircle className="w-5 h-5 shrink-0" aria-hidden />
            {ASK_COPY.entry}
          </button>
        ) : (
          whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={guard("whatsapp")}
              className="flex-1 flex items-center justify-center gap-2 bg-accent-500 active:bg-accent-600 text-white text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" />
              WhatsApp
            </a>
          )
        )}
        </div>
      </div>
      {sheets}
      </>
    );
  }

  if (variant === "compact") {
    // The bar's links, words and colours (and its sign-in gate), stacked small for a table cell.
    return (
      <div className="flex flex-col gap-1.5">
        {telHref && (
          <a
            href={telHref}
            onClick={guard("call")}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
              whatsappUrl ? "bg-primary-100 hover:bg-primary-200 text-primary-900" : "bg-accent-500 hover:bg-accent-600 text-white"
            }`}
          >
            <Phone className="w-4 h-4 shrink-0" />
            {whatsappUrl ? "Call" : normalized?.type === "landline" ? "Call (landline)" : "Call"}
          </a>
        )}
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={guard("whatsapp")}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[13px] font-semibold transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            WhatsApp
          </a>
        )}
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* The sidebar's first button, as on the phone's bar: asking for a slot leads, Call stays right under it. */}
      {asking && (
        <button
          ref={askButton}
          type="button"
          onClick={openAsk}
          aria-haspopup="dialog"
          data-slot-ask-open=""
          className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold h-12 rounded-full transition-colors text-[17px] cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" aria-hidden />
          {ASK_COPY.entry}
        </button>
      )}
      {telHref && (
        <a
          href={telHref}
          onClick={guard("call")}
          className={`w-full flex items-center justify-center gap-2 font-semibold h-12 rounded-full transition-colors text-[17px] ${
            asking ? "bg-primary-100 hover:bg-primary-200 text-primary-900" : "bg-accent-500 hover:bg-accent-600 text-white"
          }`}
        >
          <Phone className="w-5 h-5" />
          {callLabel}
        </a>
      )}
      {asking ? null : whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={guard("whatsapp")}
          className={`w-full flex items-center justify-center gap-2 font-semibold h-12 rounded-full transition-colors text-[17px] ${
            telHref ? "bg-primary-100 hover:bg-primary-200 text-primary-900" : "bg-accent-500 hover:bg-accent-600 text-white"
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </a>
      ) : (
        normalized && (
          <p className="text-[12px] text-primary-400 text-center">
            Landline, so no WhatsApp. +91 {normalized.local}
          </p>
        )
      )}
      {!user && (
        <p className="text-[11px] text-primary-400 text-center leading-snug">
          Quick sign-in on tap. Takes 10 seconds.
        </p>
      )}
    </div>
    {sheets}
    </>
  );
}

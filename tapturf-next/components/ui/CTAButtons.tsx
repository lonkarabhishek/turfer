"use client";

import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink, generateTurfInquiryMessage } from "@/lib/utils/whatsapp";
import { logContactClick, turfPageUrl, type ContactKind } from "@/lib/analytics/contactClicks";
import { normalizeIndianMobile, normalizeIndianPhone } from "@/lib/utils/phone";
import { useAuth } from "@/components/auth/AuthProvider";

interface CTAButtonsProps {
  turfId: string;
  /** Number to call. Mobile or landline; landlines get a Call button only. */
  phone: string;
  /** Number for WhatsApp when it differs from `phone`. Must be a mobile. */
  whatsappPhone?: string | null;
  turfName: string;
  address: string;
  variant?: "inline" | "fixed-bottom";
  /** Sidebar call button text. "Call to ask" for members-only clubs. */
  callLabel?: string;
}

/**
 * Call / WhatsApp buttons on a turf page. Both are auth-gated: a
 * visitor who hasn't signed in gets prompted with the login modal
 * on click. Once they're in, the actual tel:/wa.me link opens.
 * That way we don't burn contact intent when someone's not signed in,
 * but we don't force auth to *read* the page either.
 */
export function CTAButtons({
  turfId,
  phone,
  whatsappPhone,
  turfName,
  address,
  variant = "inline",
  callLabel = "Call to Book",
}: CTAButtonsProps) {
  const { user, login } = useAuth();
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) return null;

  const telHref = `tel:${normalized.e164}`;
  // WhatsApp needs a mobile: the dedicated whatsapp_phone, else the call
  // number itself when it is one. Landline-only turfs get Call alone.
  const wa = normalizeIndianMobile(whatsappPhone) ?? (normalized.type === "mobile" ? normalized : null);
  const whatsappUrl = wa
    ? buildWhatsAppLink({
        phone: wa.digits,
        text: generateTurfInquiryMessage({ name: turfName, address, url: turfPageUrl(turfId) }),
      })
    : null;

  // Intercept the click when signed out. We preventDefault first so
  // the OS never opens the dialer / WhatsApp, then pop the login
  // modal. After a successful sign-in the user just clicks again — a
  // shorter path than trying to buffer + replay a system link across
  // a modal transition.
  const source = variant === "fixed-bottom" ? "turf_bar" : "turf_sidebar";
  const guard = (kind: ContactKind) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Count every tap; signed_in=false marks the ones that hit login.
    logContactClick({ turfId, kind, source, signedIn: !!user, userId: user?.id });
    if (user) return; // signed-in: let the link fire naturally
    e.preventDefault();
    login();
  };

  if (variant === "fixed-bottom") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 material-thick border-t border-primary-200/70 px-4 pt-3 flex gap-3 md:hidden animate-slide-up"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <a
          href={telHref}
          onClick={guard("call")}
          className={`flex-1 flex items-center justify-center gap-2 text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer ${
            whatsappUrl
              ? "bg-primary-100 active:bg-primary-200 text-primary-900"
              : "bg-accent-500 active:bg-accent-600 text-white"
          }`}
        >
          <Phone className="w-5 h-5" />
          {whatsappUrl ? "Call" : normalized.type === "landline" ? "Call (landline)" : "Call"}
        </a>
        {whatsappUrl && (
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
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a
        href={telHref}
        onClick={guard("call")}
        className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold h-12 rounded-full transition-colors text-[17px]"
      >
        <Phone className="w-5 h-5" />
        {callLabel}
      </a>
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={guard("whatsapp")}
          className="w-full flex items-center justify-center gap-2 bg-primary-100 hover:bg-primary-200 text-primary-900 font-semibold h-12 rounded-full transition-colors text-[17px]"
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </a>
      ) : (
        <p className="text-[12px] text-primary-400 text-center">
          Landline, so no WhatsApp. {normalized.local.replace(/^(\d{3,4})(\d+)$/, "$1 $2")}
        </p>
      )}
      {!user && (
        <p className="text-[11px] text-primary-400 text-center leading-snug">
          Quick sign-in on tap. Takes 10 seconds.
        </p>
      )}
    </div>
  );
}

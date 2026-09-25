"use client";

import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";
import { normalizeIndianPhone } from "@/lib/utils/phone";
import { useAuth } from "@/components/auth/AuthProvider";

interface CTAButtonsProps {
  phone: string;
  turfName: string;
  address: string;
  variant?: "inline" | "fixed-bottom";
}

/**
 * Call / WhatsApp buttons on a turf page. Both are auth-gated: a
 * visitor who hasn't signed in gets prompted with the login modal
 * on click. Once they're in, the actual tel:/wa.me link opens.
 * That way we don't burn contact intent when someone's not signed in,
 * but we don't force auth to *read* the page either.
 */
export function CTAButtons({
  phone,
  turfName,
  address,
  variant = "inline",
}: CTAButtonsProps) {
  const { user, login } = useAuth();
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) return null;

  const telHref = `tel:${normalized.e164}`;
  const whatsappUrl = buildWhatsAppLink({
    phone: normalized.digits,
    text: `Hi! I'm interested in booking *${turfName}*.\n\n📍 ${address}\n\nFound via TapTurf - https://tapturf.in\n\nCould you share available slots and pricing?\n\nThanks!`,
  });

  // Intercept the click when signed out. We preventDefault first so
  // the OS never opens the dialer / WhatsApp, then pop the login
  // modal. After a successful sign-in the user just clicks again — a
  // shorter path than trying to buffer + replay a system link across
  // a modal transition.
  const guard = (e: React.MouseEvent<HTMLAnchorElement>) => {
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
          onClick={guard}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-100 active:bg-primary-200 text-primary-900 text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer"
        >
          <Phone className="w-5 h-5" />
          Call
        </a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={guard}
          className="flex-1 flex items-center justify-center gap-2 bg-accent-500 active:bg-accent-600 text-white text-[17px] font-semibold h-12 rounded-full transition-colors cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
          WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a
        href={telHref}
        onClick={guard}
        className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold h-12 rounded-full transition-colors text-[17px]"
      >
        <Phone className="w-5 h-5" />
        Call to Book
      </a>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={guard}
        className="w-full flex items-center justify-center gap-2 bg-primary-100 hover:bg-primary-200 text-primary-900 font-semibold h-12 rounded-full transition-colors text-[17px]"
      >
        <MessageCircle className="w-5 h-5" />
        WhatsApp
      </a>
      {!user && (
        <p className="text-[11px] text-primary-400 text-center leading-snug">
          Quick sign-in on tap. Takes 10 seconds.
        </p>
      )}
    </div>
  );
}

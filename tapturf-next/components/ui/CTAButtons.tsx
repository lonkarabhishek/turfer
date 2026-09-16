import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";
import { normalizeIndianPhone } from "@/lib/utils/phone";

interface CTAButtonsProps {
  phone: string;
  turfName: string;
  address: string;
  variant?: "inline" | "fixed-bottom";
}

export function CTAButtons({
  phone,
  turfName,
  address,
  variant = "inline",
}: CTAButtonsProps) {
  const normalized = normalizeIndianPhone(phone);
  // If the number can't be parsed at all, don't render dead CTAs.
  if (!normalized) return null;

  const telHref = `tel:${normalized.e164}`;
  const whatsappUrl = buildWhatsAppLink({
    phone: normalized.digits,
    text: `Hi! I'm interested in booking *${turfName}*.\n\n📍 ${address}\n\nFound via TapTurf - https://tapturf.in\n\nCould you share available slots and pricing?\n\nThanks!`,
  });

  if (variant === "fixed-bottom") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-primary-200 px-4 py-3 flex gap-3 md:hidden animate-slide-up">
        <a
          href={telHref}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3.5 min-h-[44px] rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 cursor-pointer"
        >
          <Phone className="w-5 h-5" />
          Call Now
        </a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white font-semibold py-3.5 min-h-[44px] rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer"
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
        className="w-full flex items-center justify-center gap-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3.5 rounded-xl transition-all hover:shadow-soft text-base"
      >
        <Phone className="w-5 h-5" />
        Call to Book
      </a>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2.5 bg-accent-500 hover:bg-accent-400 text-primary-900 font-semibold py-3.5 rounded-xl transition-all hover:shadow-gold text-base"
      >
        <MessageCircle className="w-5 h-5" />
        WhatsApp
      </a>
    </div>
  );
}

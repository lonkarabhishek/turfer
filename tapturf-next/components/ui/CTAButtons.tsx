import { Phone, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";

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
  const cleanPhone = phone.replace(/\D/g, "");
  const whatsappUrl = buildWhatsAppLink({
    phone: cleanPhone,
    text: `Hi! I'm interested in booking *${turfName}*.\n\n📍 ${address}\n\nFound via TapTurf - https://tapturf.in\n\nCould you share available slots and pricing?\n\nThanks!`,
  });

  if (variant === "fixed-bottom") {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 flex gap-3 md:hidden animate-slide-up">
        <a
          href={`tel:+91${cleanPhone}`}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3.5 rounded-xl transition-colors"
        >
          <Phone className="w-5 h-5" />
          Call Now
        </a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white font-semibold py-3.5 rounded-xl transition-colors"
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
        href={`tel:+91${cleanPhone}`}
        className="w-full flex items-center justify-center gap-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold py-3.5 rounded-xl transition-all hover:shadow-md text-base"
      >
        <Phone className="w-5 h-5" />
        Call to Book
      </a>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#1fb855] text-white font-semibold py-3.5 rounded-xl transition-all hover:shadow-md text-base"
      >
        <MessageCircle className="w-5 h-5" />
        WhatsApp
      </a>
    </div>
  );
}

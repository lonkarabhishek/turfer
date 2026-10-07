"use client";

import { usePathname } from "next/navigation";
import { Mail, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_MAILTO, WHATSAPP_URL } from "@/lib/contact";

export function OwnerContactCTA() {
  const pathname = usePathname();
  // Landing page only: this pitch is for first-time visitors, not
  // for people already deep in a turf detail or a booking flow.
  if (pathname !== "/") return null;

  return (
    <section className="mt-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-5 sm:px-8 sm:py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-sm">
          <div>
            <div className="text-gray-900 font-semibold text-base sm:text-lg">
              Own a turf? List it on TapTurf.
            </div>
            <div className="text-gray-600 text-sm mt-0.5">
              Reach players in your city. Questions, corrections or partnerships: write to us any time.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 shrink-0">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-medium px-5 py-2.5 shadow-sm transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp
            </a>
            <a
              href={CONTACT_MAILTO}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white hover:bg-emerald-50 text-gray-900 font-medium px-5 py-2.5 shadow-sm transition-colors whitespace-nowrap"
            >
              <Mail className="w-4 h-4 text-emerald-600" />
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

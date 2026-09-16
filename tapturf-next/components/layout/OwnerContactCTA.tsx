import { MessageCircle } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/message/NZ5Z6H7N2H25E1";

export function OwnerContactCTA() {
  return (
    <section className="mt-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
          <div>
            <div className="text-gray-900 font-semibold text-base sm:text-lg">
              Own a turf? List it on TapTurf.
            </div>
            <div className="text-gray-600 text-sm mt-0.5">
              Reach players in your city. Chat with our team on WhatsApp.
            </div>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-medium px-5 py-2.5 shadow-sm transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <MessageCircle className="w-4 h-4" />
            Contact us on WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

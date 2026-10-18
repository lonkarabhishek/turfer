import Link from "next/link";
import { Mail, MessageCircle, PlusCircle, Search } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_MAILTO, WHATSAPP_URL } from "@/lib/contact";

/**
 * Closing band: the business model in one line, a last Find a turf and
 * Host a game, and the owner pitch inset. Buttons wrap left-aligned so
 * the bottom-right corner stays clear of the floating Ask pill.
 */
export function FinalBand() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12 pb-10">
      <div className="rounded-3xl bg-primary-900 text-white p-6 md:p-10 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center">
        <div className="lg:col-span-7">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-accent-400">No booking fee</p>
          <h2 className="mt-2 font-display text-[28px] md:text-[36px] leading-tight">Call the turf. Pay the turf. Play.</h2>
          <p className="mt-2 text-[15px] text-white/70 max-w-[40ch]">
            TapTurf gives you the number, the photos, the ratings and the prices. The booking is between you and the ground, nothing extra on top.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/turfs"
              className="press-tight inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-accent-500 hover:bg-accent-400 text-white text-[16px] font-semibold transition-colors"
            >
              <Search className="w-5 h-5" /> Find a turf
            </Link>
            <Link
              href="/game/create"
              className="press-tight inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white text-[16px] font-semibold transition-colors"
            >
              <PlusCircle className="w-5 h-5" /> Host a game
            </Link>
          </div>
        </div>
        <div className="mt-6 lg:mt-0 lg:col-span-5 rounded-2xl bg-white/10 p-4 md:p-5">
          <p className="text-[15px] font-semibold">Own a turf? List it on TapTurf.</p>
          <p className="mt-1 text-[13px] text-white/70">
            Reach players in your city. Questions, corrections or partnerships: write to us any time.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press-tight inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-primary-900 text-[15px] font-semibold"
            >
              <MessageCircle className="w-4 h-4 text-accent-600" /> Chat on WhatsApp
            </a>
            <a
              href={CONTACT_MAILTO}
              className="press-tight inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/30 text-white text-[15px] font-semibold"
            >
              <Mail className="w-4 h-4" /> {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

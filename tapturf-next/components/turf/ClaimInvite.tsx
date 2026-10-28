import Link from "next/link";
import { ArrowRight, ChartColumn, ChevronRight, MessageSquareText, PencilLine } from "lucide-react";
import { OwnerMark, OwnerMedallion } from "./OwnerMark";

/**
 * Under the sport chips of an unclaimed turf's page: one quiet line for
 * its owner, down to the invite (#claim). The grey outline mark: the
 * green one is only for turfs an owner manages. Kept out of snippets.
 */
export function ClaimHint() {
  return (
    <div data-nosnippet className="mt-1.5 -mb-2">
      <a href="#claim" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] rounded-full">
        <OwnerMark size={16} tone="grey" />
        <span>
          <span className="text-primary-500">Own this turf? </span>
          <span className="font-semibold text-accent-800">Claim it free</span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-accent-800" aria-hidden />
      </a>
    </div>
  );
}

/**
 * The invite on an unclaimed turf's page, for its owner: what a claim gets
 * them, a preview of this page with the Owner-managed badge (in a dashed
 * frame marked Preview, and said to screen readers as a preview: this
 * turf is not owner-managed), and the free claim on myTapturf. A neutral
 * border on purpose: the green rim is what the page gets once claimed.
 * No numbers, no deadlines; TapTurf takes no bookings.
 */
export function ClaimInvite({ turfId, turfName }: { turfId: string; turfName: string }) {
  return (
    <section
      id="claim"
      data-nosnippet
      aria-labelledby="claim-h"
      className="mt-10 scroll-mt-24 rounded-2xl border border-primary-200 bg-linear-to-b from-accent-50 via-white via-40% to-white p-5 md:p-7 md:grid md:grid-cols-[1fr_280px] md:grid-rows-[auto_1fr] md:gap-x-8 lg:block xl:grid"
    >
      <div className="md:col-start-1 md:row-start-1">
        <p className="text-[13px] font-semibold text-accent-800">For the owner</p>
        <h2 id="claim-h" className="mt-1 text-[22px] font-bold text-primary-900 font-serif leading-tight">
          Is this your turf?
        </h2>
        <p className="mt-1.5 text-[15px] text-primary-600 leading-snug">
          Claim it free. Players then see it&rsquo;s owner-managed, and you see how they find you.
        </p>
      </div>

      <div className="mt-6 md:mt-1 md:col-start-2 md:row-start-1 md:row-span-2 md:self-start lg:mt-6 xl:mt-1">
        <ClaimPreview turfName={turfName} />
      </div>

      <div className="md:col-start-1 md:row-start-2">
        <ul className="mt-5 space-y-3.5">
          <Benefit icon={<ChartColumn className="w-4.5 h-4.5 text-accent-700" aria-hidden />} title="See who finds you">
            How many players view your page, call and WhatsApp you.
          </Benefit>
          <Benefit icon={<PencilLine className="w-4.5 h-4.5 text-accent-700" aria-hidden />} title="Keep your page right">
            Set your own prices, hours and numbers.
          </Benefit>
          <Benefit icon={<MessageSquareText className="w-4.5 h-4.5 text-accent-700" aria-hidden />} title="Show your turf">
            Add your photos and reply to player reports.
          </Benefit>
        </ul>
        <Link
          href={`/my?claim=${turfId}`}
          prefetch={false}
          className="press-tight mt-6 flex w-full sm:inline-flex sm:w-auto items-center justify-center gap-1.5 h-12 px-6 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[15px] font-semibold transition-colors"
        >
          Claim this turf, free
          <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
        <p className="mt-3 text-[13px] text-primary-500 leading-snug">
          Have the phone with the number on this page? A code to it gets you in at once. If not, our team checks by hand.
        </p>
      </div>
    </section>
  );
}

/** This page's top as it would look once claimed, as a picture: hidden from screen readers, which get one sentence instead. */
function ClaimPreview({ turfName }: { turfName: string }) {
  return (
    <div className="relative rounded-2xl border border-dashed border-primary-300 bg-white p-4 pt-5">
      <span aria-hidden className="absolute -top-3 left-4 inline-flex h-6 items-center rounded-full bg-primary-900 px-2.5 text-[11px] font-semibold text-white">
        Preview
      </span>
      <p className="sr-only">Preview: how this page would look once you claim it. It is not owner-managed yet.</p>
      <div aria-hidden className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-primary-900 font-serif leading-tight line-clamp-2 [overflow-wrap:anywhere]">{turfName}</p>
          <span className="owner-pill mt-2 inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[13px] font-semibold text-accent-800 shadow-soft">
            <OwnerMark size={20} />
            <span className="whitespace-nowrap">Owner-managed</span>
          </span>
          <p className="mt-1.5 text-[13px] text-primary-500">
            Managed by <span className="font-semibold text-primary-800">@you</span>
          </p>
        </div>
        <OwnerMedallion big />
      </div>
    </div>
  );
}

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="size-9 shrink-0 rounded-full bg-accent-50 flex items-center justify-center">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] font-semibold text-primary-900 leading-snug">{title}</p>
        <p className="text-[14px] text-primary-500 leading-snug">{children}</p>
      </div>
    </li>
  );
}

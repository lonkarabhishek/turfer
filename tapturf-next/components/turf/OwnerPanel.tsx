import Link from "next/link";
import { ArrowRight, IndianRupee, ShieldCheck } from "lucide-react";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import { managedByParts, type ManagedByPart, type TurfManagers } from "@/lib/turfPage/managers";
import { ownerPriceSetOn, type OwnerPriceNote } from "@/lib/turfPage/owner";
import { OwnerMedallion } from "./OwnerMark";

/**
 * What "Owner-managed" means, at the top of a claimed turf's page: who
 * runs it ("Managed by @a and @b", each with their tick; no such line
 * when nobody can be named, so the heading stands alone), how TapTurf
 * checked them, and, when the prices are theirs, when they set them.
 * #managed-by is where the
 * badge under the name jumps to, and myTapturf's "See it" link too.
 * Says plainly that it is about who keeps the page, not a rating.
 */
export function OwnerPanel({ managers, priceNote, className = "" }: { managers: TurfManagers; priceNote: OwnerPriceNote | null; className?: string }) {
  const parts = managedByParts(managers);
  const setOn = priceNote ? ownerPriceSetOn(priceNote) : null;
  return (
    <section id="managed-by" aria-labelledby="owner-h" className={`scroll-mt-24 owner-surface rounded-2xl p-5 md:p-6 ${className}`}>
      <div className="flex items-center gap-3.5">
        <OwnerMedallion />
        <div className="min-w-0">
          <h2 id="owner-h" className="text-[20px] font-bold text-primary-900 font-serif leading-tight">
            Owner-managed
          </h2>
          {parts && (
            <p className="mt-0.5 text-[14px] text-primary-500 leading-snug">
              Managed by <ManagedByNames parts={parts} />
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-[15px] text-primary-800 leading-relaxed">
        The owner runs this page on TapTurf and can change its prices, hours and numbers.
      </p>
      <ul className="mt-4 rounded-xl border border-accent-100 bg-white divide-y divide-accent-100">
        <Fact icon={<ShieldCheck className="w-4.5 h-4.5 text-accent-700" aria-hidden />} title="Checked by TapTurf">
          With a code to the turf&rsquo;s listed number, or by our team.
        </Fact>
        {priceNote && (
          <Fact icon={<IndianRupee className="w-4.5 h-4.5 text-accent-700" aria-hidden />} title="Prices from the owner">
            {setOn}
          </Fact>
        )}
      </ul>
      <p className="mt-3 text-[13px] text-primary-500 leading-snug">This is about who keeps the page, not a rating of the turf.</p>
    </section>
  );
}

/** "@a and @b", each linking to their profile, with the tick when they have it. */
function ManagedByNames({ parts }: { parts: ManagedByPart[] }) {
  return parts.map((p, i) =>
    p.kind === "text" ? (
      <span key={i}>{p.text}</span>
    ) : (
      <span key={i} className="whitespace-nowrap">
        <Link
          href={`/u/${p.u}`}
          prefetch={false}
          className="font-semibold text-primary-800 hover:text-accent-700 hover:underline underline-offset-2"
        >
          @{p.u}
        </Link>
        {p.v && <VerifiedTick className="ml-0.5 align-[-0.15em]" />}
      </span>
    ),
  );
}

function Fact({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span className="size-9 shrink-0 rounded-full bg-accent-50 flex items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-primary-900 leading-snug">{title}</p>
        {children && <p className="text-[13px] text-primary-500 leading-snug">{children}</p>}
      </div>
    </li>
  );
}

/**
 * The foot of a claimed turf's page: "Managed by @a and @b" again (no
 * such line when nobody can be named), then, for the owner of another
 * turf, that claiming theirs is free. Not a request to manage this one
 * (its owner adds people on myTapturf). The invite is kept out of search
 * snippets (a div: Google honours data-nosnippet on span, div and section only).
 */
export function OwnerInvite({ managers }: { managers: TurfManagers }) {
  const parts = managedByParts(managers);
  return (
    <div className="section-divider text-[14px] text-primary-500">
      {parts && (
        <p className="mb-1 leading-relaxed">
          Managed by <ManagedByNames parts={parts} />
        </p>
      )}
      <div data-nosnippet>
        Run a turf too?{" "}
        <Link
          href="/my"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-1 align-middle font-semibold text-accent-800 hover:underline underline-offset-2"
        >
          Claim yours, free
          <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

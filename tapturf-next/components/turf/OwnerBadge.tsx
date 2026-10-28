import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import type { TurfManagers } from "@/lib/turfPage/managers";
import { managedByLead } from "@/lib/turfPage/owner";
import { OwnerMark } from "./OwnerMark";

/**
 * Under a claimed turf's name: the Owner-managed pill, which jumps to the
 * panel that says what it means (#managed-by), then "by @name" for the
 * first person who runs it (with their tick) and "and N more". With
 * nobody to name (no username, tagging off, or the read failed) the pill
 * stands alone. Rendered on the server; the pill's one shine is CSS.
 */
export function OwnerBadge({ managers }: { managers: TurfManagers }) {
  const lead = managedByLead(managers);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2">
      {/* 44px to tap, around a 28px pill; the ring is drawn on the pill only
          (! beats the site-wide :focus-visible ring in globals.css, which is
          unlayered and would draw a second, taller ring on the anchor). */}
      <a href="#managed-by" className="group inline-flex min-h-11 -my-2 items-center rounded-full focus-visible:outline-none!">
        <span className="owner-pill owner-sheen inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[13px] font-semibold text-accent-800 shadow-soft group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-600 group-focus-visible:outline-solid">
          <OwnerMark size={20} />
          <span className="whitespace-nowrap">Owner-managed</span>
          <span className="sr-only">: what this means</span>
          <ChevronDown className="w-3.5 h-3.5 text-accent-700" aria-hidden />
        </span>
      </a>
      {lead && (
        <span className="text-[14px] text-primary-500">
          by{" "}
          <span className="whitespace-nowrap">
            <Link
              href={`/u/${lead.first.u}`}
              prefetch={false}
              className="font-semibold text-primary-800 hover:text-accent-700 hover:underline underline-offset-2"
            >
              @{lead.first.u}
            </Link>
            {lead.first.v && <VerifiedTick className="ml-0.5 align-[-0.15em]" />}
          </span>
          {lead.more > 0 && ` and ${lead.more} more`}
        </span>
      )}
    </div>
  );
}

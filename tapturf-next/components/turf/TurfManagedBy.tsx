import Link from "next/link";
import { VerifiedTick } from "@/components/account/VerifiedTick";
import { managedByParts, type TurfManagers } from "@/lib/turfPage/managers";

/**
 * "Managed by @a and @b" at the foot of a claimed turf's page: the people
 * TapTurf confirmed run it (active claims only) who have a username and
 * left "Let others find and tag me" on, each linking to their profile,
 * with the tick when they have it. Nothing when there is nobody to name.
 * Plain text and normal links; no structured data.
 */
export function TurfManagedBy({ managers }: { managers: TurfManagers }) {
  const parts = managedByParts(managers);
  if (!parts) return null;
  return (
    <p id="managed-by" className="section-divider text-[14px] text-primary-500 leading-relaxed">
      Managed by{" "}
      {parts.map((p, i) =>
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
      )}
    </p>
  );
}

/**
 * The Claimed mark: a green shield with a white tick. It means one
 * thing only: the turf's owner, checked by TapTurf, keeps this page (an
 * active claim). It is never a rating of the turf. Green is the owner;
 * gold means trending; blue is a person's tick (VerifiedTick), so the
 * three never get mixed up.
 *
 * Always hidden from screen readers and always next to words that say it
 * ("Claimed", "from the owner"). The grey outline is only for the
 * hint on an unclaimed page ("Own this turf? Claim it free").
 *
 * A plain function with no hooks, so server and client components both
 * use it. Solid layers and no <defs>, so many marks on one page never
 * share an id.
 */

/** lucide's shield, the outline every layer follows. */
const SHIELD =
  "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z";
const TICK = "m8.6 12.1 2.4 2.4 4.5-4.7";
/** The inner shield, a little smaller, for the bevel. */
const INNER = "translate(12 12) scale(.84) translate(-12 -12)";

export function OwnerMark({ size = 16, tone = "green", className = "" }: { size?: number; tone?: "green" | "grey"; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "2 2 20 20",
    "aria-hidden": true,
    focusable: "false" as const,
    className: `shrink-0 ${className}`,
  };
  if (tone === "grey") {
    return (
      <svg {...common} fill="none" stroke="#6E6E73" strokeLinecap="round" strokeLinejoin="round">
        <path d={SHIELD} strokeWidth={1.75} />
        <path d={TICK} strokeWidth={2} />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none">
      <path d={SHIELD} fill="#15803D" />
      <path d={SHIELD} fill="#16A34A" transform={INNER} />
      {size >= 24 && <path d={SHIELD} transform={INNER} stroke="#fff" strokeOpacity={0.5} strokeWidth={0.75 / 0.84} />}
      <path d={TICK} stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * "TapTurf verified" as an ink stamp: two rings, TAPTURF over a band that
 * reads VERIFIED, a tick under it, no fill (it sits on the panel like
 * ink). Tilt it where it is placed. Its words are drawn, so it is hidden
 * from screen readers: say "TapTurf verified" beside it.
 */
export function VerifiedStamp({ size = 88, className = "" }: { size?: number; className?: string }) {
  const ink = "#15803D";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false" className={`shrink-0 ${className}`}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={ink} strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke={ink} strokeWidth="1.2" />
      <text x="50" y="34" textAnchor="middle" fill={ink} fontSize="11" fontWeight="800" letterSpacing="1.1">
        TAPTURF
      </text>
      <rect x="3" y="41" width="94" height="19" rx="2" fill="none" stroke={ink} strokeWidth="2.5" />
      <text x="50" y="55.5" textAnchor="middle" fill={ink} fontSize="12.5" fontWeight="800" letterSpacing="1.6">
        VERIFIED
      </text>
      <path d="M40 70.5l6.5 6.5 13.5-13.5" fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The mark in a round green-rimmed medallion (52px, or 56 in the claim
 * preview), for the owner panel. Decorative: its heading says it.
 */
export function OwnerMedallion({ big = false }: { big?: boolean }) {
  return (
    <span aria-hidden className={`owner-medallion ${big ? "size-14" : "size-13"}`}>
      <span>
        <OwnerMark size={big ? 34 : 30} />
      </span>
    </span>
  );
}

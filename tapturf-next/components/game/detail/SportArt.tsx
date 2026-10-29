import { Feather, Trophy, Volleyball } from "lucide-react";
import { courtKind, sportFamily, type SportFamily } from "@/lib/utils/sport";

/**
 * A light drawing of the ground, for a game whose turf has no photo (and
 * under every photo while it loads): mown green stripes and the sport's
 * markings in white. Inline SVG, about 1 KB, no request; all green, so it
 * stays on brand. Decorative.
 */
export function SportArt({ family, className = "" }: { family: SportFamily; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 40} y="0" width="40" height="200" fill={i % 2 ? "#4CC274" : "#3FB868"} />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round">
        {family === "cricket" && (
          <>
            <ellipse cx="200" cy="100" rx="192" ry="132" />
            <ellipse cx="200" cy="100" rx="112" ry="74" strokeDasharray="5 8" />
            <rect x="148" y="88" width="104" height="24" rx="2" fill="#E8D9B0" stroke="none" />
            <path d="M160 82v36M240 82v36M152 92v16M248 92v16" />
          </>
        )}
        {family === "football" && (
          <>
            <rect x="14" y="14" width="372" height="172" rx="2" />
            <path d="M200 14v172M14 52h56v96H14M14 78h20v44H14M386 52h-56v96h56M386 78h-20v44h20M70 80a24 24 0 0 1 0 40M330 80a24 24 0 0 0 0 40" />
            <circle cx="200" cy="100" r="32" />
            <circle cx="200" cy="100" r="2" fill="#fff" fillOpacity="0.7" />
          </>
        )}
        {family === "court" && (
          <>
            <rect x="40" y="30" width="320" height="140" rx="2" />
            <path d="M40 46h320M40 154h320M110 46v108M290 46v108M110 100h180" />
            <path d="M200 22v156" strokeWidth="4" strokeDasharray="3 3" />
          </>
        )}
        {family === "basketball" && (
          <>
            <rect x="14" y="14" width="372" height="172" rx="2" />
            <path d="M200 14v172M14 70h70v60H14M386 70h-70v60h70M14 26h30a80 74 0 0 1 0 148H14M386 26h-30a80 74 0 0 0 0 148h30" />
            <circle cx="200" cy="100" r="28" />
            <circle cx="84" cy="100" r="22" />
            <circle cx="316" cy="100" r="22" />
          </>
        )}
      </g>
    </svg>
  );
}

const glyph = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The sport's small icon, in lucide's stroke style: a bat and ball, a football, a volleyball, a shuttle, or a trophy. */
export function SportGlyph({ sport, className = "w-4 h-4" }: { sport: string | null | undefined; className?: string }) {
  const family = sportFamily(sport);
  if (family === "cricket") {
    return (
      <svg {...glyph} className={className} aria-hidden="true" focusable="false">
        <path d="M21 3l-3.4 3.4" />
        <path d="M15.7 4.7l3.6 3.6-11.5 11.5-3.6-3.6z" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    );
  }
  if (family === "football") {
    return (
      <svg {...glyph} className={className} aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8.5l3.3 2.4-1.2 3.9H9.9l-1.2-3.9z" />
        <path d="M12 8.5V2.5M15.3 10.9l5.9-1.9M14.1 14.8l3.6 5M9.9 14.8l-3.6 5M8.7 10.9L2.8 9" />
      </svg>
    );
  }
  const court = family === "court" ? courtKind(sport) : null;
  if (court === "volleyball") return <Volleyball className={className} aria-hidden />;
  if (court === "badminton") return <Feather className={className} aria-hidden />;
  return <Trophy className={className} aria-hidden />;
}

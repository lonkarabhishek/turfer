import Link from "next/link";
import { turfPath } from "@/lib/utils/turfPath";
import { shortDay } from "@/lib/profile/history";
import type { PlaceStamp, TurfStamp } from "@/lib/profile/passport";

/**
 * The passport's stamps, like a travel passport's: one per turf played at
 * (its name, city and the first game's date), then round ones per city and
 * per sport. Each turf's ink and tilt come from its id, so a stamp looks
 * the same every visit.
 */

const INKS = ["#0F766E", "#4338CA", "#BE123C", "#92400E", "#075985", "#166534", "#7E22CE"];
const TILTS = [-2.5, 1.5, -1, 2, 0.5, -1.5, 1];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const inkOf = (key: string) => INKS[hash(key) % INKS.length];
const tiltOf = (key: string) => TILTS[hash(key) % TILTS.length];

export function TurfStamps({ stamps, now }: { stamps: TurfStamp[]; now: number }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
      {stamps.map((s) => {
        const ink = inkOf(s.turfId);
        return (
          <li key={s.turfId}>
            <Link
              href={turfPath({ id: s.turfId, slug: s.slug })}
              className="group block rounded-2xl focus-neon"
              style={{ transform: `rotate(${tiltOf(s.turfId)}deg)` }}
              aria-label={`${s.name}${s.cityLabel ? `, ${s.cityLabel}` : ""}: first played ${shortDay(s.first, now)}, ${s.games} ${s.games === 1 ? "game" : "games"}`}
            >
              <div className="rounded-2xl border-2 border-dashed p-1 bg-white transition-shadow group-hover:shadow-card-hover" style={{ borderColor: ink }}>
                <div className="rounded-xl border px-2.5 py-3 text-center min-h-[112px] flex flex-col justify-center" style={{ borderColor: `${ink}55`, color: ink }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] truncate">{s.cityLabel ?? "TapTurf"}</p>
                  <p className="mt-1 text-[14px] font-bold leading-tight text-primary-900 line-clamp-2 break-words">{s.name}</p>
                  <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider">{shortDay(s.first, now)}</p>
                  <p className="text-[11px] font-medium opacity-80">
                    {s.games} {s.games === 1 ? "game" : "games"}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Round stamps for cities and sports. */
export function RoundStamps({ stamps, now, kind }: { stamps: PlaceStamp[]; now: number; kind: "city" | "sport" }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {stamps.map((s) => {
        const ink = inkOf(`${kind}:${s.key}`);
        return (
          <li
            key={s.key}
            className="grid place-items-center w-[92px] h-[92px] rounded-full border-2 border-dashed bg-white p-1"
            style={{ borderColor: ink, transform: `rotate(${tiltOf(s.key) * 2}deg)` }}
          >
            <span className="grid place-items-center w-full h-full rounded-full border text-center px-1.5" style={{ borderColor: `${ink}55`, color: ink }}>
              <span>
                <span className="block text-[11px] font-bold uppercase tracking-wide leading-tight break-words">{s.label}</span>
                <span className="block mt-0.5 text-[10px] font-semibold">{shortDay(s.first, now)}</span>
                <span className="sr-only">
                  , {s.games} {s.games === 1 ? "game" : "games"}
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

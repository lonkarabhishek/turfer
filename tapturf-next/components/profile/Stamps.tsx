import Link from "next/link";
import { SportGlyph } from "@/components/game/detail/SportArt";
import { CITIES } from "@/lib/city";
import { turfPath } from "@/lib/utils/turfPath";
import { shortDay } from "@/lib/profile/history";
import type { PlaceStamp, TurfStamp } from "@/lib/profile/passport";

/**
 * The passport's stamps, like a travel passport's: one per turf played at
 * (its name, city, sport and the first game's date), then round ones per
 * city and per sport. Ink is the city's, so a city's turfs and its round
 * stamp read as one; sports get their own. The tilt comes from the id, so
 * a stamp looks the same every visit.
 */

const INKS = ["#0F766E", "#4338CA", "#BE123C", "#92400E", "#075985", "#166534", "#7E22CE"];
const SPORT_INKS = ["#9A3412", "#1E40AF", "#065F46", "#86198F", "#334155"];
const TILTS = [-2.5, 1.5, -1, 2, 0.5, -1.5, 1];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const CITY_ORDER = new Map(CITIES.map((c, i) => [c.id, i]));
// The curated cities each get their own ink, biggest first; any other city one by its name.
const cityInk = (city: string | null) => INKS[(city ? (CITY_ORDER.get(city) ?? hash(city)) : 0) % INKS.length];
const sportInk = (key: string) => SPORT_INKS[hash(key) % SPORT_INKS.length];
const tiltOf = (key: string) => TILTS[hash(key) % TILTS.length];
const gamesWord = (n: number) => `${n} ${n === 1 ? "game" : "games"}`;

/** The passport page: a faint paper tone under the stamps. */
export function StampPage({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-[#EADFC8] bg-[#FBF7EE] px-3 py-4 sm:px-4">{children}</div>;
}

export function TurfStamps({ stamps, now }: { stamps: TurfStamp[]; now: number }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4">
      {stamps.map((s) => {
        const ink = cityInk(s.city);
        return (
          <li key={s.turfId}>
            <Link
              href={turfPath({ id: s.turfId, slug: s.slug })}
              className="group block rounded-2xl focus-neon"
              style={{ transform: `rotate(${tiltOf(s.turfId)}deg)` }}
              aria-label={`${s.name}${s.cityLabel ? `, ${s.cityLabel}` : ""}${s.sport ? `, ${s.sport}` : ""}: first played ${shortDay(s.first, now)}, ${gamesWord(s.games)}`}
            >
              <div className="rounded-2xl border-2 border-dashed p-1 bg-white/70 transition-shadow group-hover:shadow-card-hover" style={{ borderColor: ink }}>
                <div className="rounded-xl border px-2.5 py-3 text-center min-h-[112px] flex flex-col items-center justify-center" style={{ borderColor: `${ink}55`, color: ink }}>
                  <p className="flex items-center justify-center gap-1 max-w-full text-[11px] font-bold uppercase tracking-[0.14em]">
                    {s.sport && <SportGlyph sport={s.sport} className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{s.cityLabel ?? "TapTurf"}</span>
                  </p>
                  <p className="mt-1 text-[14px] font-bold leading-tight text-primary-900 line-clamp-2 break-words">{s.name}</p>
                  <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider">{shortDay(s.first, now)}</p>
                  {s.games > 1 && <p className="text-[11px] font-medium opacity-80">{gamesWord(s.games)}</p>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Round stamps for cities (in the city's ink) and sports (with the sport's glyph). */
export function RoundStamps({ stamps, now, kind }: { stamps: PlaceStamp[]; now: number; kind: "city" | "sport" }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {stamps.map((s) => {
        const ink = kind === "city" ? cityInk(s.key) : sportInk(s.key);
        return (
          <li
            key={s.key}
            className="grid place-items-center w-[96px] h-[96px] rounded-full border-2 border-dashed bg-white/70 p-1"
            style={{ borderColor: ink, transform: `rotate(${tiltOf(s.key) * 2}deg)` }}
          >
            <span className="grid place-items-center w-full h-full rounded-full border text-center px-1.5" style={{ borderColor: `${ink}55`, color: ink }}>
              <span>
                {kind === "sport" && <SportGlyph sport={s.label} className="mx-auto mb-0.5 w-4 h-4" />}
                <span className="block text-[12px] font-bold uppercase tracking-wide leading-tight break-words">{s.label}</span>
                <span className="block mt-0.5 text-[11px] font-semibold">{shortDay(s.first, now)}</span>
                <span className="sr-only">, {gamesWord(s.games)}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

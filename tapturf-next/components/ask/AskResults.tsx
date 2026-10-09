"use client";

import Link from "next/link";
import { ArrowRight, Clock, LocateFixed, Loader2, MapPin, Star, Users } from "lucide-react";
import { HideOnErrorImg } from "@/components/ui/HideOnErrorImg";
import { imageUrlForCard } from "@/lib/utils/images";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
import { formatDistance } from "@/lib/utils/location";
import { formatDate, formatTimeSlot } from "@/lib/utils/game";
import { labelFor, isCity } from "@/lib/city";
import { sportBySlug } from "@/lib/sports";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";
import type { AskResponse } from "./AskProvider";

/** Compact cards for inside the chat. Horizontal snap row on phones. */

export function TurfMiniCard({ turf, priority = false }: { turf: Turf & { distanceKm?: number }; priority?: boolean }) {
  const img = turf.cover_image || turf.images?.[0] || null;
  const price = summarisePrice(turf);
  const area = areaFor(turf);
  return (
    <Link
      href={`/turf/${turf.id}`}
      className="group snap-start shrink-0 w-[196px] sm:w-[208px] rounded-2xl bg-white border border-primary-100 shadow-soft overflow-hidden hover:border-primary-200 hover:shadow-elevated transition-[box-shadow,border-color] duration-200 cursor-pointer"
    >
      <div className="relative aspect-[4/3] bg-primary-100">
        {img ? (
          <HideOnErrorImg
            src={imageUrlForCard(img)}
            alt={turf.name}
            className="w-full h-full object-cover"
            loading={priority ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
          />
        ) : null}
        {turf.total_reviews > 0 && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 h-6 text-[12px] font-semibold text-primary-900 shadow-soft">
            <Star className="w-3 h-3 fill-current text-amber-500" /> {Number(turf.rating).toFixed(1)}
          </span>
        )}
        {turf.distanceKm != null && (
          <span className="absolute right-2 top-2 rounded-full bg-primary-900/85 text-white px-2 h-6 inline-flex items-center text-[11px] font-medium">
            {formatDistance(turf.distanceKm)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[14px] font-semibold text-primary-900 leading-tight truncate group-hover:text-accent-700 transition-colors">{turf.name}</p>
        <p className="text-[12px] text-primary-500 truncate mt-0.5">{area ?? turf.address}</p>
        <p className="text-[12px] mt-1.5">
          {price.kind === "real" ? (
            <span className="font-semibold text-primary-900">{price.label}</span>
          ) : price.kind === "unknown" ? (
            <span className="text-primary-400">Call for rates</span>
          ) : (
            <span className="text-primary-600">{price.label}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function GameMiniCard({ game }: { game: Game & { distanceKm?: number } }) {
  const spots = Math.max(0, game.max_players - game.current_players);
  return (
    <Link
      href={`/game/${game.id}`}
      className="snap-start shrink-0 w-[248px] rounded-2xl bg-white border border-primary-100 shadow-soft p-3.5 hover:border-primary-200 hover:shadow-elevated transition-[box-shadow,border-color] duration-200 cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-accent-700">{game.sport}</span>
        <span className={`text-[11px] font-semibold rounded-full px-2 h-5 inline-flex items-center ${spots === 0 ? "bg-primary-100 text-primary-500" : spots <= 2 ? "bg-amber-100 text-amber-800" : "bg-accent-50 text-accent-700"}`}>
          {spots === 0 ? "Full" : `${spots} spot${spots === 1 ? "" : "s"} left`}
        </span>
      </div>
      <p className="mt-1.5 text-[14px] font-semibold text-primary-900 leading-tight truncate">{game.turfs?.name ?? game.title}</p>
      <p className="mt-1.5 text-[12px] text-primary-600 inline-flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-primary-400" /> {formatDate(game.date)} · {formatTimeSlot(game.start_time, game.end_time)}
      </p>
      <p className="mt-1 text-[12px] text-primary-500 inline-flex items-center gap-1.5 w-full">
        <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0" />
        <span className="truncate">{game.turfs?.city && isCity(game.turfs.city) ? labelFor(game.turfs.city) : game.turfs?.address ?? ""}</span>
        {game.distanceKm != null && <span className="ml-auto shrink-0 text-primary-400">{formatDistance(game.distanceKm)}</span>}
      </p>
      <p className="mt-1.5 text-[12px] text-primary-600 inline-flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-primary-400" /> {game.current_players}/{game.max_players}
        {game.price_per_player > 0 && <span className="text-primary-900 font-semibold">· ₹{game.price_per_player} each</span>}
      </p>
    </Link>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1" role="list">
      {children}
    </div>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-700 hover:text-accent-800 cursor-pointer">
      {label} <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function moreLink(r: AskResponse): string {
  const { city, sport } = r.filters;
  if (city && isCity(city) && sport) return `/${city}/${sport}`;
  if (city && isCity(city)) return `/${city}`;
  if (sport) return `/sport/${sport}`;
  return "/turfs";
}

export function FilterChips({ res }: { res: AskResponse }) {
  const f = res.filters;
  const out: string[] = [];
  if (f.sport) out.push(sportBySlug(f.sport)?.name ?? f.sport);
  for (const a of f.areas) out.push(a);
  if (f.city && isCity(f.city) && f.areas.length === 0) out.push(labelFor(f.city));
  if (f.wantsNearby) out.push("Near you");
  if (f.maxPrice != null) out.push(`Under ₹${f.maxPrice.toLocaleString("en-IN")}${res.intent === "find_game" ? "" : "/hr"}`);
  if (f.when) out.push({ today: "Today", tomorrow: "Tomorrow", weekend: "This weekend", this_week: "This week" }[f.when] ?? f.when);
  if (f.skill) out.push(f.skill.replace(/^\w/, (c) => c.toUpperCase()));
  if (f.time && res.intent === "find_turf") out.push({ morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" }[f.time] ?? f.time);
  if (f.open24x7) out.push("Open 24 hours");
  for (const n of f.needs) out.push(n.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()));
  if (f.players) out.push(`${f.players} players`);
  if (!out.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2.5">
      {out.map((c) => (
        <span key={c} className="h-6 px-2 inline-flex items-center rounded-full bg-accent-50 text-accent-800 text-[11px] font-semibold">
          {c}
        </span>
      ))}
    </div>
  );
}

/** Everything that renders under an assistant reply. */
export function AskResultBody({
  res,
  onUseLocation,
  locating,
}: {
  res: AskResponse;
  onUseLocation: () => void;
  locating: boolean;
}) {
  const turfs = res.turfs ?? [];
  const games = res.games ?? [];

  return (
    <div className="mt-2.5">
      {(res.intent === "find_turf" || res.intent === "find_game") && <FilterChips res={res} />}

      {res.needsLocation && (
        <button
          type="button"
          onClick={onUseLocation}
          disabled={locating}
          className="mb-3 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-[13px] font-semibold cursor-pointer transition-colors"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
          Use my location
        </button>
      )}

      {res.intent === "find_turf" && turfs.length > 0 && (
        <>
          <Row>
            {turfs.map((t, i) => (
              <TurfMiniCard key={t.id} turf={t} priority={i < 2} />
            ))}
          </Row>
          {res.total > turfs.length && <MoreLink href={moreLink(res)} label={`See all ${res.total}`} />}
        </>
      )}

      {res.intent === "find_game" &&
        (games.length > 0 ? (
          <>
            <Row>
              {games.map((g) => (
                <GameMiniCard key={g.id} game={g} />
              ))}
            </Row>
            <MoreLink href="/games" label={res.total > games.length ? `See all ${res.total} games` : "All open games"} />
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link href="/games" className="inline-flex items-center h-9 px-4 rounded-full bg-primary-900 text-white text-[13px] font-semibold cursor-pointer hover:bg-primary-800 transition-colors">
              See open games
            </Link>
            <Link href="/game/create" className="inline-flex items-center h-9 px-4 rounded-full bg-primary-100 text-primary-900 text-[13px] font-semibold cursor-pointer hover:bg-primary-200 transition-colors">
              Host one
            </Link>
          </div>
        ))}

      {res.intent === "compare" && <CompareBlock res={res} />}

      {res.intent === "question" && (
        <>
          {res.answer && <p className="text-[15px] text-primary-900 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3 mb-3">{res.answer.answer}</p>}
          {turfs.length > 0 && (
            <Row>
              {turfs.map((t) => (
                <TurfMiniCard key={t.id} turf={t} />
              ))}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

function CompareBlock({ res }: { res: AskResponse }) {
  const turfs = res.turfs ?? [];
  const c = res.compare;
  if (turfs.length < 2) {
    return turfs.length ? (
      <Row>
        {turfs.map((t) => (
          <TurfMiniCard key={t.id} turf={t} />
        ))}
      </Row>
    ) : null;
  }
  return (
    <div>
      {c && <p className="text-[15px] text-primary-900 leading-relaxed rounded-2xl bg-accent-50 px-4 py-3 mb-3">{c.verdict}</p>}
      {c && (
        <div className="rounded-2xl border border-primary-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[360px]">
              <thead>
                <tr className="bg-primary-50">
                  <th className="sticky left-0 bg-primary-50 text-left px-3 py-2 w-[96px] text-[11px] font-semibold uppercase tracking-wide text-primary-400" />
                  {turfs.map((t) => (
                    <th key={t.id} className="text-left px-3 py-2 font-semibold text-primary-900 align-bottom">
                      <Link href={`/turf/${t.id}`} className="hover:text-accent-700 cursor-pointer">
                        {t.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.label} className="align-top border-t border-primary-100">
                    <td className="sticky left-0 bg-white px-3 py-2 text-primary-500 font-medium">{row.label}</td>
                    {turfs.map((t, i) => (
                      <td key={t.id} className="px-3 py-2 text-primary-800">
                        {row.values[i] ?? "Not listed"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="align-top border-t border-primary-100 bg-accent-50/60">
                  <td className="sticky left-0 bg-accent-50 px-3 py-2 text-primary-500 font-medium">Best for</td>
                  {turfs.map((t, i) => (
                    <td key={t.id} className="px-3 py-2 font-semibold text-accent-800">
                      {c.best_for[i] ?? ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {c.caveats && <p className="px-3 py-2 text-[11px] text-primary-400 border-t border-primary-100">{c.caveats}</p>}
        </div>
      )}
      <div className="mt-3">
        <Row>
          {turfs.map((t) => (
            <TurfMiniCard key={t.id} turf={t} />
          ))}
        </Row>
      </div>
    </div>
  );
}

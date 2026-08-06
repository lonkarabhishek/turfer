"use client";

import Link from "next/link";
import { MapPin, Clock, Users, User, Zap } from "lucide-react";
import type { Game } from "@/types/game";
import { formatDate, formatTimeSlot, capitalizeSkillLevel } from "@/lib/utils/game";

export function GameCard({ game }: { game: Game }) {
  const spotsLeft = game.max_players - game.current_players;
  const fillPercent = (game.current_players / game.max_players) * 100;
  const isFull = spotsLeft <= 0;
  const isTight = spotsLeft > 0 && spotsLeft <= 2;

  return (
    <Link
      href={`/game/${game.id}`}
      className="block group rounded-2xl focus-neon"
    >
      <article
        className={`relative overflow-hidden rounded-2xl border transition-all bg-cream-200 ${
          isFull
            ? "border-white/5 opacity-70"
            : "border-white/10 hover:border-accent-400/50 hover:shadow-card-hover"
        }`}
      >
        {/* Neon accent side-bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${
            isFull
              ? "bg-white/10"
              : isTight
              ? "bg-hot-500"
              : "bg-accent-400 shadow-neon"
          }`}
          aria-hidden
        />

        <div className="p-5 pl-6">
          {/* Top row: Sport pill + Spots badge */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-accent-400 text-primary-950 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                <Zap className="w-3 h-3" strokeWidth={2.75} />
                {game.sport}
              </span>
              {game.skill_level && game.skill_level !== "all" && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/60 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
                  {capitalizeSkillLevel(game.skill_level)}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                isFull
                  ? "bg-white/5 text-white/40"
                  : isTight
                  ? "bg-hot-500/15 text-hot-400 border border-hot-500/40"
                  : "bg-accent-400/10 text-accent-400 border border-accent-400/30"
              }`}
            >
              {isFull ? "Full" : `${spotsLeft} left`}
            </span>
          </div>

          {/* Turf name & address */}
          <div className="mb-4">
            <h3 className="font-display uppercase text-xl text-white group-hover:text-accent-400 transition-colors leading-tight tracking-wide">
              {game.turfs?.name || game.title}
            </h3>
            {game.turfs?.address && (
              <p className="flex items-center gap-1 text-xs text-white/50 mt-1">
                <MapPin className="w-3 h-3 flex-shrink-0 text-white/40" />
                <span className="truncate">{game.turfs.address}</span>
              </p>
            )}
          </div>

          {/* Date + time chips */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center text-[11px] font-mono uppercase tracking-widest text-accent-400 bg-accent-400/10 border border-accent-400/25 px-2.5 py-1.5 rounded-lg">
              {formatDate(game.date)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg">
              <Clock className="w-3 h-3 text-white/50" />
              {formatTimeSlot(game.start_time, game.end_time)}
            </span>
          </div>

          {/* Players progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="flex items-center gap-1 text-white/50 font-mono uppercase tracking-widest">
                <Users className="w-3 h-3 text-white/40" />
                <span className="tabular text-white/80">{game.current_players}/{game.max_players}</span>
              </span>
              <span className="font-mono tabular text-white/40 text-[10px]">
                {Math.round(fillPercent)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull
                    ? "bg-white/20"
                    : isTight
                    ? "bg-hot-500 shadow-hot"
                    : "bg-accent-400 shadow-neon"
                }`}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Bottom row: Host + Price */}
          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            <div className="flex items-center gap-2 min-w-0">
              {game.host_profile_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={game.host_profile_image_url}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-accent-400/20 border border-accent-400/40 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-accent-400" />
                </div>
              )}
              <span className="text-xs text-white/60 truncate">{game.host_name}</span>
            </div>

            {game.price_per_player > 0 ? (
              <span className="font-display text-xl text-white tabular tracking-tight">
                ₹{game.price_per_player}
                <span className="text-[10px] font-mono text-white/40 ml-1 uppercase">/pp</span>
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-400 bg-accent-400/10 border border-accent-400/40 px-2 py-1 rounded-full">
                Free
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

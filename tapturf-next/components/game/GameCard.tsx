"use client";

import Link from "next/link";
import { MapPin, Clock, Users, User } from "lucide-react";
import type { Game } from "@/types/game";
import { formatDate, formatTimeSlot, capitalizeSkillLevel } from "@/lib/utils/game";

export function GameCard({ game }: { game: Game }) {
  const spotsLeft = game.max_players - game.current_players;
  const fillPercent = (game.current_players / game.max_players) * 100;
  const isFull = spotsLeft <= 0;

  return (
    <Link href={`/game/${game.id}`} className="block group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-2xl">
      <div className="border border-cream-300 rounded-2xl overflow-hidden hover:shadow-card-hover hover:border-primary-200 transition-all duration-300 bg-white">
        {/* Color accent top bar */}
        <div className={`h-1 ${isFull ? "bg-cream-300" : "bg-gradient-to-r from-primary-500 to-primary-400"}`} />

        <div className="p-5">
          {/* Top row: Sport badge + Spots indicator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                {game.sport}
              </span>
              {game.skill_level && game.skill_level !== "all" && (
                <span className="text-xs text-primary-500 font-medium bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
                  {capitalizeSkillLevel(game.skill_level)}
                </span>
              )}
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              isFull
                ? "bg-cream-200 text-cream-500"
                : spotsLeft <= 2
                ? "bg-orange-50 text-orange-600 border border-orange-100"
                : "bg-accent-50 text-accent-700 border border-accent-200"
            }`}>
              {isFull ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Turf name & address */}
          <div className="mb-3">
            <h3 className="text-base font-semibold text-primary-800 group-hover:text-primary-600 transition-colors font-serif">
              {game.turfs?.name || game.title}
            </h3>
            {game.turfs?.address && (
              <p className="flex items-center gap-1 text-sm text-primary-400 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-primary-300" />
                <span className="truncate">{game.turfs.address}</span>
              </p>
            )}
          </div>

          {/* Date & time chips */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center text-xs font-medium text-primary-600 bg-primary-50 border border-primary-100 px-2.5 py-1.5 rounded-lg">
              {formatDate(game.date)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 bg-primary-50 border border-primary-100 px-2.5 py-1.5 rounded-lg">
              <Clock className="w-3 h-3 text-primary-300" />
              {formatTimeSlot(game.start_time, game.end_time)}
            </span>
          </div>

          {/* Players progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1 text-primary-500 font-medium">
                <Users className="w-3.5 h-3.5 text-primary-400" />
                {game.current_players}/{game.max_players} players
              </span>
            </div>
            <div className="w-full h-1.5 bg-cream-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull
                    ? "bg-cream-400"
                    : spotsLeft <= 2
                    ? "bg-gradient-to-r from-orange-400 to-orange-500"
                    : "bg-gradient-to-r from-primary-500 to-primary-400"
                }`}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Bottom row: Host + Price */}
          <div className="flex items-center justify-between pt-3 border-t border-cream-200">
            <div className="flex items-center gap-2">
              {game.host_profile_image_url ? (
                <img
                  src={game.host_profile_image_url}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-cream-300"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary-500" />
                </div>
              )}
              <span className="text-sm text-primary-500">{game.host_name}</span>
            </div>

            <span className="text-base font-bold text-primary-800">
              {game.price_per_player > 0 ? (
                <>
                  <span className="font-serif">₹{game.price_per_player}</span>
                  <span className="text-xs font-normal text-primary-400">/pp</span>
                </>
              ) : (
                <span className="text-primary-500 font-bold text-sm bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
                  Free
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

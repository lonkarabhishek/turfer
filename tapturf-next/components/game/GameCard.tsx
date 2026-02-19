"use client";

import Link from "next/link";
import { MapPin, Clock, Users, Trophy, User } from "lucide-react";
import type { Game } from "@/types/game";
import { formatDate, formatTimeSlot, capitalizeSkillLevel } from "@/lib/utils/game";

export function GameCard({ game }: { game: Game }) {
  const spotsLeft = game.max_players - game.current_players;
  const fillPercent = (game.current_players / game.max_players) * 100;
  const isFull = spotsLeft <= 0;

  return (
    <Link href={`/game/${game.id}`} className="block group">
      <div className="border border-gray-200 rounded-2xl overflow-hidden hover:shadow-elevated transition-all duration-300 bg-white">
        {/* Color accent top bar */}
        <div className={`h-1 ${isFull ? "bg-gray-300" : "bg-gradient-to-r from-primary-400 to-primary-500"}`} />

        <div className="p-5">
          {/* Top row: Sport badge + Spots indicator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                <Trophy className="w-3.5 h-3.5" />
                {game.sport}
              </span>
              {game.skill_level && game.skill_level !== "all" && (
                <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full">{capitalizeSkillLevel(game.skill_level)}</span>
              )}
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              isFull ? "bg-gray-100 text-gray-500" :
              spotsLeft <= 2 ? "bg-orange-50 text-orange-600" :
              "bg-primary-50 text-primary-600"
            }`}>
              {isFull ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Turf name & address */}
          <div className="mb-3">
            <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
              {game.turfs?.name || game.title}
            </h3>
            {game.turfs?.address && (
              <p className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-primary-400" />
                <span className="truncate">{game.turfs.address}</span>
              </p>
            )}
          </div>

          {/* Date & time chips */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-50 px-2.5 py-1.5 rounded-lg">
              {formatDate(game.date)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-50 px-2.5 py-1.5 rounded-lg">
              <Clock className="w-3 h-3 text-gray-400" />
              {formatTimeSlot(game.start_time, game.end_time)}
            </span>
          </div>

          {/* Players progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1 text-gray-600 font-medium">
                <Users className="w-3.5 h-3.5 text-primary-500" />
                {game.current_players}/{game.max_players} players
              </span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull ? "bg-gray-300" :
                  spotsLeft <= 2 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                  "bg-gradient-to-r from-primary-400 to-primary-500"
                }`}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Bottom row: Host + Price */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              {game.host_profile_image_url ? (
                <img
                  src={game.host_profile_image_url}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary-600" />
                </div>
              )}
              <span className="text-sm text-gray-600">{game.host_name}</span>
            </div>

            <span className="text-base font-bold text-gray-900">
              {game.price_per_player > 0 ? (
                <>₹{game.price_per_player}<span className="text-xs font-normal text-gray-500">/pp</span></>
              ) : (
                <span className="text-primary-600 font-bold text-sm">Free</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

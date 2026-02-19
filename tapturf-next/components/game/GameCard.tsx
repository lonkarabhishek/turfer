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
      <div className="border border-gray-200 rounded-2xl p-5 hover:shadow-elevated transition-all duration-200 bg-white">
        {/* Top row: Sport badge + Skill level */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5" />
              {game.sport}
            </span>
            {game.format && (
              <span className="text-xs text-gray-500 font-medium">{game.format}</span>
            )}
          </div>
          <span className="text-xs font-medium text-gray-500">
            {capitalizeSkillLevel(game.skill_level)}
          </span>
        </div>

        {/* Turf name & address */}
        <div className="mb-3">
          <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-500 transition-colors">
            {game.turfs?.name || game.title}
          </h3>
          {game.turfs?.address && (
            <p className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {game.turfs.address}
            </p>
          )}
        </div>

        {/* Date & time */}
        <div className="flex items-center gap-4 text-sm text-gray-700 mb-4">
          <span className="font-medium">{formatDate(game.date)}</span>
          <span className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {formatTimeSlot(game.start_time, game.end_time)}
          </span>
        </div>

        {/* Players bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="flex items-center gap-1 text-gray-700">
              <Users className="w-4 h-4" />
              {game.current_players}/{game.max_players} players
            </span>
            <span className={`text-xs font-semibold ${isFull ? "text-red-500" : spotsLeft <= 2 ? "text-orange-500" : "text-green-600"}`}>
              {isFull ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isFull ? "bg-red-400" : spotsLeft <= 2 ? "bg-orange-400" : "bg-primary-500"}`}
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
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-gray-500" />
              </div>
            )}
            <span className="text-sm text-gray-600">{game.host_name}</span>
          </div>

          <span className="text-base font-bold text-gray-900">
            ₹{game.price_per_player}
            <span className="text-xs font-normal text-gray-500">/person</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

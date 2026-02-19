"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Trophy, MapPin, Clock, Users } from "lucide-react";
import { getUserGames, getUserJoinedGames } from "@/lib/queries/games";
import { formatDate, formatTimeSlot, getGameStatus } from "@/lib/utils/game";
import type { Game } from "@/types/game";

export function MyGames({ userId }: { userId: string }) {
  const [createdGames, setCreatedGames] = useState<Game[]>([]);
  const [joinedGames, setJoinedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"created" | "joined">("created");

  useEffect(() => {
    const load = async () => {
      const [created, joined] = await Promise.all([
        getUserGames(userId),
        getUserJoinedGames(userId),
      ]);
      setCreatedGames(created.data);
      setJoinedGames(joined.data);
      setLoading(false);
    };
    load();
  }, [userId]);

  const games = view === "created" ? createdGames : joinedGames;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="w-2/3 h-5 bg-gray-200 rounded mb-2" />
            <div className="w-1/3 h-4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("created")}
          className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
            view === "created" ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200"
          }`}
        >
          Created ({createdGames.length})
        </button>
        <button
          onClick={() => setView("joined")}
          className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
            view === "joined" ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200"
          }`}
        >
          Joined ({joinedGames.length})
        </button>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 mb-4">
            {view === "created" ? "You haven't created any games yet" : "You haven't joined any games yet"}
          </p>
          <Link
            href={view === "created" ? "/game/create" : "/games"}
            className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full"
          >
            <Plus className="w-4 h-4" />
            {view === "created" ? "Create a Game" : "Browse Games"}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((game) => {
            const status = getGameStatus(game);
            return (
              <Link key={game.id} href={`/game/${game.id}`} className="block">
                <div className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-900">{game.sport}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      status === "live" ? "bg-green-50 text-green-700" :
                      status === "expired" ? "bg-gray-100 text-gray-500" :
                      "bg-blue-50 text-blue-700"
                    }`}>
                      {status === "live" ? "Live" : status === "expired" ? "Ended" : "Upcoming"}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 mb-1">{game.turfs?.name || game.title}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>{formatDate(game.date)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimeSlot(game.start_time, game.end_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {game.current_players}/{game.max_players}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

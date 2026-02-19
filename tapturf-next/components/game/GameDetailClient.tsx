"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, Users, Trophy, User, Share2, Check, X, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getGameById, getGameParticipants, getGameRequests, sendJoinRequest, acceptRequest, declineRequest } from "@/lib/queries/games";
import { formatDate, formatTimeSlot, capitalizeSkillLevel, getGameStatus } from "@/lib/utils/game";
import type { Game, GameRequest, GameParticipant } from "@/types/game";
import { GameRequestCard } from "./GameRequestCard";

export function GameDetailClient({ gameId }: { gameId: string }) {
  const { user, login } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinNote, setJoinNote] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"idle" | "sent" | "error">("idle");
  const [showJoinForm, setShowJoinForm] = useState(false);

  const isHost = user && game?.creator_id === user.id;
  const status = game ? getGameStatus(game) : "upcoming";

  useEffect(() => {
    loadGame();
  }, [gameId]);

  useEffect(() => {
    if (game && user && isHost) {
      loadRequests();
    }
    if (game) {
      loadParticipants();
    }
  }, [game, user]);

  const loadGame = async () => {
    setLoading(true);
    const { data } = await getGameById(gameId);
    setGame(data);
    setLoading(false);
  };

  const loadParticipants = async () => {
    const { data } = await getGameParticipants(gameId);
    setParticipants(data);
  };

  const loadRequests = async () => {
    const { data } = await getGameRequests(gameId);
    setRequests(data);
  };

  const handleJoin = async () => {
    if (!user) { login(); return; }
    setJoining(true);
    const { error } = await sendJoinRequest(gameId, user.id, joinNote, user.name);
    setJoining(false);
    if (error) {
      setJoinStatus("error");
    } else {
      setJoinStatus("sent");
      setShowJoinForm(false);
    }
  };

  const handleAccept = async (requestId: string) => {
    await acceptRequest(requestId, gameId, user!.id);
    await loadRequests();
    await loadGame();
    await loadParticipants();
  };

  const handleDecline = async (requestId: string) => {
    await declineRequest(requestId, gameId);
    await loadRequests();
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = `Join my ${game?.sport} game on TapTurf!`;
    if (navigator.share) {
      await navigator.share({ title: text, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="w-24 h-6 bg-gray-200 rounded" />
          <div className="w-3/4 h-8 bg-gray-200 rounded" />
          <div className="w-1/2 h-5 bg-gray-100 rounded" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-lg font-medium text-gray-900 mb-2">Game not found</p>
        <Link href="/games" className="text-sm text-gray-900 underline">
          Browse all games
        </Link>
      </div>
    );
  }

  const spotsLeft = game.max_players - game.current_players;
  const isFull = spotsLeft <= 0;
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Back link */}
      <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" />
        All games
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
            <Trophy className="w-3.5 h-3.5" />
            {game.sport}
          </span>
          {game.format && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              {game.format}
            </span>
          )}
          {status === "live" && (
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full animate-pulse">
              LIVE
            </span>
          )}
          {status === "expired" && (
            <span className="text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
              Ended
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {game.turfs?.name || game.title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          {game.turfs?.address && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {game.turfs.address}
            </span>
          )}
          <span className="font-medium">{formatDate(game.date)}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatTimeSlot(game.start_time, game.end_time)}
          </span>
        </div>
      </div>

      {/* Main content grid */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
        {/* Left column */}
        <div>
          {/* Game details */}
          <div className="section-divider">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Skill Level</p>
                <p className="text-sm font-medium text-gray-900">{capitalizeSkillLevel(game.skill_level)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Cost</p>
                <p className="text-sm font-medium text-gray-900">₹{game.price_per_player}/person</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Turf Booked</p>
                <p className="text-sm font-medium text-gray-900">{game.turf_booked ? "Yes" : "Not yet"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Players</p>
                <p className="text-sm font-medium text-gray-900">{game.current_players}/{game.max_players}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          {game.description && (
            <div className="section-divider">
              <p className="text-sm text-gray-700 leading-relaxed">{game.description}</p>
            </div>
          )}

          {/* Notes */}
          {game.notes && (
            <div className="section-divider">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{game.notes}</p>
            </div>
          )}

          {/* Host */}
          <div className="section-divider">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Hosted by</h3>
            <div className="flex items-center gap-3">
              {game.host_profile_image_url ? (
                <img src={game.host_profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{game.host_name}</p>
                {game.host_phone && (
                  <a href={`tel:${game.host_phone}`} className="text-xs text-gray-500 hover:text-gray-700">
                    {game.host_phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Confirmed players */}
          <div className="section-divider">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Players ({participants.length}/{game.max_players})
            </h3>
            <div className="flex flex-wrap gap-3">
              {participants.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                  {p.profile_image_url ? (
                    <img src={p.profile_image_url} alt="" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                  )}
                  <span className="text-sm text-gray-700">{p.name || "Player"}</span>
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-gray-400">No confirmed players yet</p>
              )}
            </div>
          </div>

          {/* Map */}
          {game.turfs?.["Gmap Embed link"] && (
            <div className="section-divider">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Location</h3>
              <div className="rounded-2xl overflow-hidden h-[250px]">
                <iframe
                  src={game.turfs["Gmap Embed link"]}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          )}

          {/* Host: Pending requests */}
          {isHost && pendingRequests.length > 0 && (
            <div className="section-divider">
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Join Requests ({pendingRequests.length})
              </h3>
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <GameRequestCard
                    key={req.id}
                    request={req}
                    onAccept={() => handleAccept(req.id)}
                    onDecline={() => handleDecline(req.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Sticky CTA card */}
        <div className="hidden lg:block">
          <div className="sticky top-24 border border-gray-200 rounded-2xl p-6 shadow-elevated">
            <div className="text-center mb-4">
              <p className="text-2xl font-bold text-gray-900">
                ₹{game.price_per_player}
                <span className="text-sm font-normal text-gray-500"> /person</span>
              </p>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-900">{formatDate(game.date)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time</span>
                <span className="font-medium text-gray-900">{formatTimeSlot(game.start_time, game.end_time)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Spots left</span>
                <span className={`font-medium ${isFull ? "text-red-500" : "text-green-600"}`}>
                  {isFull ? "Full" : spotsLeft}
                </span>
              </div>
            </div>

            {/* Players bar */}
            <div className="mb-5">
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isFull ? "bg-red-400" : "bg-primary-500"}`}
                  style={{ width: `${(game.current_players / game.max_players) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {game.current_players}/{game.max_players} players
              </p>
            </div>

            {/* CTA */}
            {renderJoinButton()}

            <button
              onClick={handleShare}
              className="w-full mt-3 flex items-center justify-center gap-2 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Mobile fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 lg:hidden z-30 animate-slide-up">
        <div className="flex items-center justify-between gap-4 max-w-3xl mx-auto">
          <div>
            <p className="text-lg font-bold text-gray-900">₹{game.price_per_player}<span className="text-sm font-normal text-gray-500">/person</span></p>
            <p className="text-xs text-gray-500">{formatDate(game.date)} · {spotsLeft > 0 ? `${spotsLeft} spots left` : "Full"}</p>
          </div>
          {renderMobileJoinButton()}
        </div>
      </div>

      {/* Mobile bottom spacer */}
      <div className="h-20 lg:hidden" />

      {/* Join form modal */}
      {showJoinForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowJoinForm(false)} />
          <div className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl p-6 animate-slide-up">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request to join</h3>
            <textarea
              value={joinNote}
              onChange={(e) => setJoinNote(e.target.value)}
              placeholder="Add a note to the host (optional)"
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full mt-4 bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {joining ? "Sending..." : "Send Request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function renderJoinButton() {
    if (isHost) {
      return (
        <Link href="/dashboard" className="block w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm text-center hover:bg-gray-800 transition-colors">
          Manage Game
        </Link>
      );
    }
    if (status === "expired") {
      return <button disabled className="w-full bg-gray-200 text-gray-500 py-3 rounded-xl font-semibold text-sm cursor-not-allowed">Game Ended</button>;
    }
    if (isFull) {
      return <button disabled className="w-full bg-gray-200 text-gray-500 py-3 rounded-xl font-semibold text-sm cursor-not-allowed">Game Full</button>;
    }
    if (joinStatus === "sent") {
      return (
        <button disabled className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
          <Check className="w-4 h-4" /> Request Sent
        </button>
      );
    }
    return (
      <button
        onClick={() => user ? setShowJoinForm(true) : login()}
        className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors"
      >
        Request to Join
      </button>
    );
  }

  function renderMobileJoinButton() {
    if (isHost) {
      return <Link href="/dashboard" className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-semibold">Manage</Link>;
    }
    if (status === "expired" || isFull) {
      return <button disabled className="bg-gray-200 text-gray-500 px-6 py-3 rounded-xl text-sm font-semibold">{isFull ? "Full" : "Ended"}</button>;
    }
    if (joinStatus === "sent") {
      return <span className="text-sm font-medium text-green-600 flex items-center gap-1"><Check className="w-4 h-4" />Sent</span>;
    }
    return (
      <button onClick={() => user ? setShowJoinForm(true) : login()} className="bg-accent-500 text-white px-6 py-3 rounded-xl text-sm font-semibold">
        Request to Join
      </button>
    );
  }
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Clock, Users, Trophy, User, Share2, Check, X, Loader2, Zap, IndianRupee, CalendarDays, Shield, MessageSquare, ChevronRight } from "lucide-react";
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
  const [shared, setShared] = useState(false);

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
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero skeleton */}
        <div className="animate-pulse">
          <div className="w-24 h-6 bg-gray-200 rounded-full mb-6" />
          <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-3xl p-6 mb-6">
            <div className="flex gap-2 mb-4">
              <div className="w-20 h-7 bg-primary-200/50 rounded-full" />
              <div className="w-16 h-7 bg-primary-200/30 rounded-full" />
            </div>
            <div className="w-3/4 h-8 bg-primary-200/40 rounded mb-2" />
            <div className="w-1/2 h-5 bg-primary-200/30 rounded mb-4" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-16 bg-white/60 rounded-2xl" />
              <div className="h-16 bg-white/60 rounded-2xl" />
              <div className="h-16 bg-white/60 rounded-2xl" />
            </div>
          </div>
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-lg font-semibold text-gray-900 mb-2">Game not found</p>
        <p className="text-sm text-gray-500 mb-6">This game may have been removed or the link is incorrect.</p>
        <Link href="/games" className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
          Browse Games
        </Link>
      </div>
    );
  }

  const spotsLeft = game.max_players - game.current_players;
  const isFull = spotsLeft <= 0;
  const fillPercent = (game.current_players / game.max_players) * 100;
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Back link */}
      <Link href="/games" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        All games
      </Link>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* HERO CARD — gradient background with game info */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white p-6 sm:p-8 mb-6">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

        {/* Badges row */}
        <div className="relative flex items-center gap-2 mb-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/20">
            <Trophy className="w-3.5 h-3.5" />
            {game.sport}
          </span>
          {game.skill_level && game.skill_level !== "all" && (
            <span className="inline-flex items-center gap-1 bg-white/15 text-white/90 text-xs font-medium px-2.5 py-1.5 rounded-full">
              <Shield className="w-3 h-3" />
              {capitalizeSkillLevel(game.skill_level)}
            </span>
          )}
          {status === "live" && (
            <span className="inline-flex items-center gap-1.5 bg-green-400/20 text-green-100 text-xs font-bold px-3 py-1.5 rounded-full border border-green-400/30 animate-pulse">
              <Zap className="w-3 h-3" />
              LIVE NOW
            </span>
          )}
          {status === "expired" && (
            <span className="text-xs font-semibold text-red-200 bg-red-500/30 px-3 py-1.5 rounded-full">
              Game Ended
            </span>
          )}
        </div>

        {/* Title & address */}
        <h1 className="relative text-2xl sm:text-3xl font-bold mb-1.5">
          {game.turfs?.name || game.title}
        </h1>
        {game.turfs?.address && (
          <p className="relative flex items-center gap-1.5 text-sm text-white/80 mb-5">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            {game.turfs.address}
          </p>
        )}

        {/* Quick stats row */}
        <div className="relative grid grid-cols-3 gap-3">
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
            <CalendarDays className="w-4 h-4 mx-auto mb-1 text-white/70" />
            <p className="text-xs text-white/70">Date</p>
            <p className="text-sm font-bold">{formatDate(game.date)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
            <Clock className="w-4 h-4 mx-auto mb-1 text-white/70" />
            <p className="text-xs text-white/70">Time</p>
            <p className="text-sm font-bold">{formatTimeSlot(game.start_time, game.end_time)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/10">
            <IndianRupee className="w-4 h-4 mx-auto mb-1 text-white/70" />
            <p className="text-xs text-white/70">Cost</p>
            <p className="text-sm font-bold">{game.price_per_player > 0 ? `₹${game.price_per_player}` : "Free"}</p>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
        {/* Left column */}
        <div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* HOST REQUESTS SECTION — prominent at top for hosts */}
          {/* ═══════════════════════════════════════════════════════ */}
          {isHost && pendingRequests.length > 0 && (
            <div className="mb-6 bg-gradient-to-r from-accent-50 to-orange-50 border-2 border-accent-200 rounded-2xl p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-accent-500 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Join Requests
                  </h3>
                  <p className="text-xs text-gray-500">{pendingRequests.length} pending request{pendingRequests.length !== 1 ? "s" : ""}</p>
                </div>
                <span className="ml-auto inline-flex items-center justify-center w-7 h-7 bg-accent-500 text-white text-sm font-bold rounded-full animate-pulse">
                  {pendingRequests.length}
                </span>
              </div>
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

          {isHost && pendingRequests.length === 0 && requests.length > 0 && (
            <div className="mb-6 bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-sm text-gray-600">All join requests have been handled!</p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PLAYERS PROGRESS */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-primary-500" />
                Players
              </h3>
              <span className={`text-sm font-bold ${isFull ? "text-accent-500" : spotsLeft <= 2 ? "text-orange-500" : "text-primary-600"}`}>
                {isFull ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
              </span>
            </div>

            {/* Progress bar */}
            <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFull ? "bg-gradient-to-r from-accent-400 to-accent-500" :
                  spotsLeft <= 2 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                  "bg-gradient-to-r from-primary-400 to-primary-500"
                }`}
                style={{ width: `${Math.min(fillPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mb-4">{game.current_players} of {game.max_players} players joined</p>

            {/* Participant avatars */}
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-full px-3 py-1.5">
                  {p.profile_image_url ? (
                    <img src={p.profile_image_url} alt="" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary-200 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary-700" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-primary-800">{p.name || "Player"}</span>
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-gray-400">No confirmed players yet</p>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* GAME DETAILS GRID */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Game Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Sport</p>
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-primary-500" />
                  {game.sport}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Skill Level</p>
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary-500" />
                  {capitalizeSkillLevel(game.skill_level)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Cost per Person</p>
                <p className="text-sm font-semibold text-gray-900">
                  {game.price_per_player > 0 ? `₹${game.price_per_player}` : "Free"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">Turf Booked</p>
                <p className={`text-sm font-semibold ${game.turf_booked ? "text-green-600" : "text-orange-500"}`}>
                  {game.turf_booked ? "✓ Confirmed" : "Not yet"}
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          {game.description && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
              <h3 className="text-base font-semibold text-gray-900 mb-2">About this Game</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{game.description}</p>
            </div>
          )}

          {/* Notes */}
          {game.notes && (
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-5 mb-5">
              <h3 className="text-base font-semibold text-primary-900 mb-2">Notes from Host</h3>
              <p className="text-sm text-primary-700">{game.notes}</p>
            </div>
          )}

          {/* Host card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Hosted by</h3>
            <div className="flex items-center gap-3">
              {game.host_profile_image_url ? (
                <img src={game.host_profile_image_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-primary-100" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center ring-2 ring-primary-100">
                  <User className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{game.host_name}</p>
                {game.host_phone && (
                  <a href={`tel:${game.host_phone}`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                    {game.host_phone}
                  </a>
                )}
              </div>
              {game.host_phone && (
                <a
                  href={`https://wa.me/${game.host_phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1fb855] text-white text-xs font-semibold px-3 py-2 rounded-full transition-colors"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Map */}
          {game.turfs?.["Gmap Embed link"] && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
              <div className="p-5 pb-3">
                <h3 className="text-base font-semibold text-gray-900">Location</h3>
              </div>
              <div className="h-[220px]">
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
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RIGHT COLUMN — Desktop sticky CTA card */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="border border-gray-200 rounded-2xl p-6 shadow-elevated bg-white">
              <div className="text-center mb-5">
                <p className="text-3xl font-bold text-gray-900">
                  {game.price_per_player > 0 ? (
                    <>₹{game.price_per_player}<span className="text-sm font-normal text-gray-500"> /person</span></>
                  ) : (
                    <span className="text-primary-600">Free</span>
                  )}
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
                  <span className="text-gray-500">Skill</span>
                  <span className="font-medium text-gray-900">{capitalizeSkillLevel(game.skill_level)}</span>
                </div>
              </div>

              {/* Players bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-gray-500">Spots</span>
                  <span className={`font-bold ${isFull ? "text-accent-500" : "text-primary-600"}`}>
                    {isFull ? "Full" : `${spotsLeft} left`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-accent-500" : "bg-primary-500"}`}
                    style={{ width: `${Math.min(fillPercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                  {game.current_players}/{game.max_players} players
                </p>
              </div>

              {/* CTA */}
              {renderJoinButton()}

              <button
                onClick={handleShare}
                className="w-full mt-3 flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                <Share2 className="w-4 h-4" />
                {shared ? "Link copied!" : "Share"}
              </button>
            </div>

            {/* Desktop host requests panel */}
            {isHost && pendingRequests.length > 0 && (
              <div className="border-2 border-accent-200 rounded-2xl p-5 bg-accent-50/50">
                <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 bg-accent-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                  Pending Requests
                </p>
                <div className="space-y-2">
                  {pendingRequests.slice(0, 3).map((req) => (
                    <GameRequestCard
                      key={req.id}
                      request={req}
                      onAccept={() => handleAccept(req.id)}
                      onDecline={() => handleDecline(req.id)}
                      compact
                    />
                  ))}
                  {pendingRequests.length > 3 && (
                    <p className="text-xs text-accent-600 font-medium text-center pt-1">
                      +{pendingRequests.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MOBILE FIXED BOTTOM CTA */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 lg:hidden z-30">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">
              {game.price_per_player > 0 ? (
                <>₹{game.price_per_player}<span className="text-xs font-normal text-gray-500">/person</span></>
              ) : (
                <span className="text-primary-600">Free</span>
              )}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {formatDate(game.date)} · {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left` : "Full"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Share2 className="w-4 h-4 text-gray-600" />
            </button>
            {renderMobileJoinButton()}
          </div>
        </div>
      </div>

      {/* Mobile bottom spacer */}
      <div className="h-20 lg:hidden" />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* JOIN FORM MODAL */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showJoinForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setShowJoinForm(false)} />
          <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Request to Join</h3>
              <button onClick={() => setShowJoinForm(false)} className="p-1 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Send a request to <span className="font-medium text-gray-700">{game.host_name}</span> to join this game.
            </p>

            <textarea
              value={joinNote}
              onChange={(e) => setJoinNote(e.target.value)}
              placeholder="Add a note to the host (optional)"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none bg-gray-50"
            />

            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full mt-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Send Join Request
                </>
              )}
            </button>

            {joinStatus === "error" && (
              <p className="text-sm text-accent-500 text-center mt-3">
                Could not send request. You may have already requested.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function renderJoinButton() {
    if (isHost) {
      return (
        <div className="space-y-2">
          <Link href="/dashboard" className="block w-full bg-gradient-to-r from-primary-500 to-primary-600 text-white py-3 rounded-xl font-semibold text-sm text-center hover:from-primary-600 hover:to-primary-700 transition-all">
            Manage Game
          </Link>
          {pendingRequests.length > 0 && (
            <p className="text-xs text-accent-600 font-medium text-center">
              {pendingRequests.length} pending request{pendingRequests.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      );
    }
    if (status === "expired") {
      return <button disabled className="w-full bg-gray-100 text-gray-400 py-3 rounded-xl font-semibold text-sm cursor-not-allowed">Game Ended</button>;
    }
    if (isFull) {
      return <button disabled className="w-full bg-gray-100 text-gray-400 py-3 rounded-xl font-semibold text-sm cursor-not-allowed">Game Full</button>;
    }
    if (joinStatus === "sent") {
      return (
        <button disabled className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-green-200">
          <Check className="w-4 h-4" /> Request Sent!
        </button>
      );
    }
    return (
      <button
        onClick={() => user ? setShowJoinForm(true) : login()}
        className="w-full bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-accent-500/25 flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Request to Join
      </button>
    );
  }

  function renderMobileJoinButton() {
    if (isHost) {
      return (
        <Link href="/dashboard" className="relative bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-1.5">
          Manage
          {pendingRequests.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {pendingRequests.length}
            </span>
          )}
        </Link>
      );
    }
    if (status === "expired" || isFull) {
      return <button disabled className="bg-gray-100 text-gray-400 px-5 py-3 rounded-xl text-sm font-semibold">{isFull ? "Full" : "Ended"}</button>;
    }
    if (joinStatus === "sent") {
      return <span className="text-sm font-semibold text-green-600 flex items-center gap-1"><Check className="w-4 h-4" />Sent!</span>;
    }
    return (
      <button
        onClick={() => user ? setShowJoinForm(true) : login()}
        className="bg-gradient-to-r from-accent-500 to-accent-600 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-lg shadow-accent-500/25 flex items-center gap-1.5"
      >
        <Zap className="w-4 h-4" />
        Join Game
      </button>
    );
  }
}

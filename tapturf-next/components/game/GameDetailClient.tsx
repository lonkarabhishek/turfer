"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy, X, Loader2, Pencil, Save, Send } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getGameById, getGameParticipants, getGameRequests, getMyRequestForGame, sendJoinRequest, acceptRequest, declineRequest, updateGame } from "@/lib/queries/games";
import {
  durationLabel,
  firstName,
  formatClock,
  formatGameDay,
  formatPrice,
  formatTimeRange,
  gamePlace,
  getGameStatus,
  hostNote,
  skillInfo,
  speakTimeRange,
  spotsInfo,
  turfInfo,
} from "@/lib/utils/game";
import { canRequest, canSeeHostNumber, ctaState, waNumber } from "@/lib/utils/gameState";
import { sportFamily, sportLabel } from "@/lib/utils/sport";
import type { Game, GameRequest, GameParticipant } from "@/types/game";
import { mapsSearchUrl } from "@/lib/utils/maps";
import { LiveScorerPromo } from "@/components/tools/LiveScorerPromo";
import { turfPath } from "@/lib/utils/turfPath";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { GameHero, type HeroChip } from "./detail/GameHero";
import { GameTitle } from "./detail/GameTitle";
import { GameRequests } from "./detail/GameRequests";
import { GameStatusNote } from "./detail/GameStatusNote";
import { GameFacts } from "./detail/GameFacts";
import { GameHostCard } from "./detail/GameHostCard";
import { GameLineup } from "./detail/GameLineup";
import { GameWhere } from "./detail/GameWhere";
import { GameCtaBar } from "./detail/GameCtaBar";
import { GameAside } from "./detail/GameAside";
import type { CtaModel } from "./detail/GameCta";
import { GameSkeleton } from "./detail/GameSkeleton";

const field = "w-full min-h-12 border border-primary-200 rounded-xl px-4 py-3 text-base md:text-sm text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-primary-50";
const label = "block text-[14px] font-medium text-primary-700 mb-1";

export function GameDetailClient({ gameId, liveLinks = false }: { gameId: string; liveLinks?: boolean }) {
  const { user, login, confirmedUser } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [requests, setRequests] = useState<GameRequest[]>([]);
  // This viewer's latest request, read on load (pending or declined survives a reload).
  const [myRequest, setMyRequest] = useState<{ userId: string; id: string; status: GameRequest["status"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinNote, setJoinNote] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"idle" | "sent" | "error">("idle");
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [shared, setShared] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState({
    date: "",
    start_time: "",
    end_time: "",
    max_players: 0,
    price_per_player: 0,
    description: "",
    turf_booked: false,
    skill_level: "all",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isHost = !!user && !!game && game.creator_id === user.id;
  const status = game ? getGameStatus(game) : "upcoming";
  const viewerId = user?.id ?? null;
  const isParticipant = !!viewerId && participants.some((p) => p.user_id === viewerId);

  const loadGame = async () => {
    setLoading(true);
    const { data } = await getGameById(gameId);
    setGame(data);
    setLoading(false);
  };

  const loadParticipants = async () => {
    const { data } = await getGameParticipants(gameId);
    setParticipants(data);
    setParticipantsLoaded(true);
  };

  const loadRequests = async () => {
    const { data } = await getGameRequests(gameId);
    setRequests(data);
  };

  // Another game in the same view (client navigation): back to the skeleton until it arrives.
  const [loadedFor, setLoadedFor] = useState(gameId);
  if (loadedFor !== gameId) {
    setLoadedFor(gameId);
    setLoading(true);
  }

  useEffect(() => {
    let alive = true;
    getGameById(gameId).then(({ data }) => {
      if (!alive) return;
      setGame(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [gameId]);

  // The lineup for everyone, the requests for the host: again whenever the game or the sign-in changes.
  useEffect(() => {
    if (!game) return;
    let alive = true;
    if (user && isHost) {
      getGameRequests(gameId).then(({ data }) => {
        if (alive) setRequests(data);
      });
    }
    getGameParticipants(gameId).then(({ data }) => {
      if (!alive) return;
      setParticipants(data);
      setParticipantsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [game, user, isHost, gameId]);

  // Pending or declined after a reload: one small read, only for a
  // signed-in viewer who is neither the host nor already playing.
  useEffect(() => {
    if (!viewerId || isHost || !participantsLoaded || isParticipant) return;
    let alive = true;
    getMyRequestForGame(gameId, viewerId).then(({ data }) => {
      if (alive) setMyRequest(data ? { userId: viewerId, ...data } : null);
    });
    return () => {
      alive = false;
    };
  }, [gameId, viewerId, isHost, participantsLoaded, isParticipant]);

  const handleJoin = async () => {
    if (!user) { login(); return; }
    setJoining(true);
    // The account the server confirms for this sign-in, never only what this device kept.
    const me = await confirmedUser();
    if (!me) {
      setJoining(false);
      setJoinStatus("error");
      return;
    }
    const { error } = await sendJoinRequest(gameId, me.id, joinNote, me.name);
    setJoining(false);
    if (error) {
      setJoinStatus("error");
    } else {
      setJoinStatus("sent");
      setShowJoinForm(false);
    }
  };

  const [acceptError, setAcceptError] = useState("");

  const handleAccept = async (requestId: string) => {
    setAcceptError("");
    const { success, error } = await acceptRequest(requestId, gameId, user!.id);
    if (!success) {
      setAcceptError(error || "Failed to accept request");
      setTimeout(() => setAcceptError(""), 4000);
      return;
    }
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
    const sport = sportLabel(game?.sport);
    const venue = game?.turfs?.name;
    const when = game ? [formatGameDay(game.date).title, formatTimeRange(game.start_time, game.end_time).replace(/ /g, " ")] : [];
    const text = [`${isHost ? `Join my ${sport} game` : `${sport} game`}${venue ? ` at ${venue}` : ""}`, ...when].filter(Boolean).join(", ");
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
      } catch {
        // Closed the share sheet.
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // No clipboard: nothing to say.
      }
    }
  };

  // The main button and the "Your spot?" chip: sign in first, then the request sheet (as before).
  const askToJoin = () => (user ? setShowJoinForm(true) : login());

  const openEditModal = () => {
    if (!game) return;
    setEditData({
      date: game.date,
      start_time: game.start_time,
      end_time: game.end_time,
      max_players: game.max_players,
      price_per_player: game.price_per_player,
      description: game.description || "",
      turf_booked: game.turf_booked,
      skill_level: game.skill_level || "all",
    });
    setSaveError("");
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!game || !user) return;
    setSaving(true);
    setSaveError("");
    const { error } = await updateGame(game.id, user.id, {
      date: editData.date,
      start_time: editData.start_time,
      end_time: editData.end_time,
      max_players: editData.max_players,
      price_per_player: editData.price_per_player,
      description: editData.description || undefined,
      turf_booked: editData.turf_booked,
      skill_level: editData.skill_level,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
    } else {
      setShowEditModal(false);
      await loadGame();
    }
  };

  if (loading) return <GameSkeleton />;

  if (!game) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-7 h-7 text-primary-400" />
        </div>
        <p className="text-lg font-semibold text-primary-800 mb-2">Game not found</p>
        <p className="text-sm text-primary-500 mb-6">This game may have been removed or the link is incorrect.</p>
        <Link href="/games" className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
          Browse Games
        </Link>
      </div>
    );
  }

  const spotsLeft = game.max_players - game.current_players;
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const ended = status === "expired";
  const mine = myRequest && myRequest.userId === viewerId ? myRequest : null;
  const cta = ctaState({ isHost, status: game.status, timing: status, isParticipant, joinStatus, myRequest: mine, spotsLeft });
  const cancelled = cta === "cancelled";

  const sportName = sportLabel(game.sport);
  const family = sportFamily(game.sport);
  const day = formatGameDay(game.date);
  const range = formatTimeRange(game.start_time, game.end_time);
  const duration = durationLabel(game.start_time, game.end_time);
  // A cancelled game, like a played one, says who joined and that joining is closed.
  const spots = spotsInfo(game.current_players, game.max_players, ended || cancelled);
  const price = formatPrice(game.price_per_player);
  const free = price === "Free";
  const hostFirst = firstName(game.host_name);
  const phone = game.host_phone?.trim() || null;
  const showNumber = !isHost && canSeeHostNumber({ isHost, isParticipant: isParticipant || mine?.status === "accepted", signedIn: !!user });
  const venue = game.turfs?.name || `${sportName} game`;
  const chip: HeroChip = isHost ? "hosting" : cancelled ? "cancelled" : ended ? "ended" : spotsLeft <= 0 ? "full" : status === "live" ? "live" : null;
  const note = cta === "cancelled" || cta === "ended" || cta === "full" ? cta : null;

  const model: CtaModel = {
    state: cta,
    free,
    price,
    day,
    range,
    duration: duration ? `${duration.text}${duration.endsNextDay ? " · ends next day" : ""}` : null,
    startClock: formatClock(game.start_time),
    endClock: formatClock(game.end_time),
    spots,
    current: game.current_players,
    max: game.max_players,
    pendingCount: pendingRequests.length,
    hostFirst,
    waHref: cta === "accepted" && showNumber && phone ? `https://wa.me/${waNumber(phone)}` : null,
    onAsk: askToJoin,
    onEdit: openEditModal,
    onShare: handleShare,
    shared,
  };

  const mapSrc = (() => {
    const raw = game.turfs?.["Gmap Embed link"] ?? "";
    const srcMatch = raw.match(/src="([^"]+)"/);
    return raw ? (srcMatch ? srcMatch[1] : raw) : null;
  })();

  return (
    <div className="md:max-w-2xl lg:max-w-6xl mx-auto sm:px-6 sm:pt-5 lg:pt-6">
      <Link
        href="/games"
        className="hidden lg:inline-flex h-11 mb-2 items-center gap-1.5 text-[15px] font-medium text-primary-700 hover:text-primary-900"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        All games
      </Link>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 lg:items-start">
        <div className="min-w-0">
          <GameHero
            photos={game.turfs?.photos}
            family={family}
            sport={game.sport}
            sportName={sportName}
            chip={chip}
            muted={ended || cancelled}
            onShare={handleShare}
          />

          <div className="relative -mt-5 sm:mt-5 rounded-t-[24px] sm:rounded-none bg-white px-4 sm:px-0 pt-4 sm:pt-0 pb-1">
            <GameTitle
              venue={venue}
              sportName={sportName}
              place={gamePlace(game.turfs)}
              hostName={game.host_name}
              hostPhoto={game.host_profile_image_url}
              hostId={game.creator_id}
              isHost={isHost}
            />
          </div>

          <div className="px-4 sm:px-0 mt-3 space-y-6">
            {isHost && requests.length > 0 && (
              <GameRequests pending={pendingRequests} error={acceptError} onAccept={handleAccept} onDecline={handleDecline} />
            )}

            {note && !isHost && <GameStatusNote kind={note} taken={spots.line} />}

            <GameFacts
              day={day}
              past={ended}
              range={range}
              spokenRange={speakTimeRange(game.start_time, game.end_time)}
              duration={duration}
              price={{ free, label: price }}
              spots={spots}
              skill={skillInfo(game.skill_level)}
              turf={turfInfo(game.turf_booked)}
            />

            <GameHostCard
              hostName={game.host_name}
              hostFirst={hostFirst}
              hostPhoto={game.host_profile_image_url}
              hostId={game.creator_id}
              note={hostNote(game)}
              isHost={isHost}
              phone={phone}
              showNumber={showNumber}
              closed={ended || cancelled}
            />

            <GameLineup
              participants={participants}
              creatorId={game.creator_id}
              viewerId={viewerId}
              current={game.current_players}
              max={game.max_players}
              spots={spots}
              ended={ended}
              cancelled={cancelled}
              closed={ended || cancelled || spotsLeft <= 0}
              isHost={isHost}
              canAsk={canRequest(cta)}
              onAsk={askToJoin}
              onShare={handleShare}
              shared={shared}
            />

            {game.turfs?.id && (
              <GameWhere
                href={turfPath(game.turfs)}
                name={game.turfs.name}
                address={game.turfs.address}
                photos={game.turfs.photos}
                family={family}
                lat={game.turfs.lat}
                lng={game.turfs.lng}
                mapSrc={mapSrc}
                mapHref={mapsSearchUrl({ lat: game.turfs.lat, lng: game.turfs.lng, name: game.turfs.name, address: game.turfs.address })}
              />
            )}

            {/* Cricket or any sport the Live Scoreboard knows; renders nothing for the rest. */}
            {status !== "expired" && <LiveScorerPromo sport={game.sport} variant="game" venue={game.turfs?.name} live={status === "live"} liveLinks={liveLinks} />}
          </div>
        </div>

        <GameAside m={model} />
      </div>

      <GameCtaBar m={model} />

      {/* Room for the bar (and, on phones, the bottom nav) under the page. */}
      <div className="h-32 md:h-24 lg:hidden" />

      {shared && (
        <div
          role="status"
          aria-live="polite"
          className="lg:hidden fixed inset-x-0 z-40 flex justify-center pointer-events-none bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:bottom-24"
        >
          <span className="rounded-full bg-primary-900 text-white text-[14px] font-semibold px-4 py-2 shadow-elevated">Link copied</span>
        </div>
      )}

      {/* Both sheets sit in what the phone shows (ViewportOverlay): above the keys while the note or a field is typed. */}
      {showJoinForm && (
        <ViewportOverlay className="z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={() => setShowJoinForm(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="join-h" className="relative w-full md:max-w-md max-h-[calc(var(--vv-h,100dvh)*0.92)] overflow-y-auto overscroll-contain bg-white rounded-t-3xl md:rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h2 id="join-h" className="text-[20px] font-bold text-primary-900">Request to join</h2>
              <button onClick={() => setShowJoinForm(false)} aria-label="Close" className="size-11 -mr-2 grid place-items-center rounded-full hover:bg-primary-100">
                <X className="w-5 h-5 text-primary-700" aria-hidden />
              </button>
            </div>

            <p className="text-[15px] text-primary-700 mb-4 leading-relaxed">
              {hostFirst === "the host" ? "The host" : hostFirst} will see your request and can accept or decline it. You&apos;ll get a notification either way.
            </p>

            <label htmlFor="join-note" className="sr-only">Note for {hostFirst}</label>
            <textarea
              id="join-note"
              value={joinNote}
              onChange={(e) => setJoinNote(e.target.value)}
              placeholder={`Add a note for ${hostFirst === "the host" ? "the host" : hostFirst} (optional)`}
              rows={3}
              className={`${field} resize-none`}
            />

            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full mt-4 h-12 rounded-full bg-accent-600 hover:bg-accent-700 text-white text-[16px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" aria-hidden />
                  Send request
                </>
              )}
            </button>

            {joinStatus === "error" && (
              <p role="alert" className="text-[14px] text-hot-600 text-center mt-3">
                Couldn&apos;t send your request. You may have asked already.
              </p>
            )}
          </div>
        </ViewportOverlay>
      )}

      {showEditModal && (
        <ViewportOverlay className="z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={() => setShowEditModal(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="edit-h" className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl p-6 animate-slide-up max-h-[calc(var(--vv-h,100dvh)*0.85)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between mb-4">
              <h2 id="edit-h" className="text-[20px] font-bold text-primary-900 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary-500" aria-hidden />
                Edit game
              </h2>
              <button onClick={() => setShowEditModal(false)} aria-label="Close" className="size-11 -mr-2 grid place-items-center rounded-full hover:bg-primary-100">
                <X className="w-5 h-5 text-primary-700" aria-hidden />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="edit-date" className={label}>Date</label>
                <input id="edit-date" type="date" value={editData.date} onChange={(e) => setEditData({ ...editData, date: e.target.value })} className={field} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-start" className={label}>Start time</label>
                  <input id="edit-start" type="time" value={editData.start_time} onChange={(e) => setEditData({ ...editData, start_time: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="edit-end" className={label}>End time</label>
                  <input id="edit-end" type="time" value={editData.end_time} onChange={(e) => setEditData({ ...editData, end_time: e.target.value })} className={field} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-max" className={label}>Max players</label>
                  <input
                    id="edit-max"
                    type="number"
                    min={game?.current_players || 1}
                    value={editData.max_players}
                    onChange={(e) => setEditData({ ...editData, max_players: parseInt(e.target.value) || 0 })}
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="edit-price" className={label}>Price per player (₹)</label>
                  <input
                    id="edit-price"
                    type="number"
                    min={0}
                    value={editData.price_per_player}
                    onChange={(e) => setEditData({ ...editData, price_per_player: parseInt(e.target.value) || 0 })}
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-skill" className={label}>Skill level</label>
                <select id="edit-skill" value={editData.skill_level} onChange={(e) => setEditData({ ...editData, skill_level: e.target.value })} className={field}>
                  <option value="all">All levels</option>
                  <option value="beginner">Beginners</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-note" className={label}>Note for players</label>
                <textarea
                  id="edit-note"
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  aria-describedby="edit-note-hint"
                  placeholder="Ball type, format, what to bring…"
                  rows={3}
                  className={`${field} resize-none`}
                />
                <p id="edit-note-hint" className="mt-1 text-[13px] text-primary-500">Shown on the game page</p>
              </div>

              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editData.turf_booked}
                  onChange={(e) => setEditData({ ...editData, turf_booked: e.target.checked })}
                  aria-describedby="edit-booked-hint"
                  className="size-5 rounded border-primary-300 accent-accent-600"
                />
                <span>
                  <span className="block text-[15px] font-medium text-primary-900">Turf booked</span>
                  <span id="edit-booked-hint" className="block text-[13px] text-primary-500">Players see this on the game page</span>
                </span>
              </label>
            </div>

            {saveError && (
              <p role="alert" className="text-[14px] text-hot-600 text-center mt-3">{saveError}</p>
            )}

            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="w-full mt-5 h-12 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[16px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" aria-hidden />
                  Save changes
                </>
              )}
            </button>
          </div>
        </ViewportOverlay>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone, Trophy, X, Loader2, Pencil, Save, Send, UserCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { quietToken } from "@/lib/account/client";
import {
  getGameById,
  getGameParticipants,
  answerTag,
  getGameRequests,
  getGameTags,
  getMyRequestForGame,
  getSeriesGames,
  getSeriesInfo,
  postUpdate,
  removeUpdate,
  sendJoinRequest,
  acceptRequest,
  declineRequest,
  stopSeries,
  updateGame,
} from "@/lib/queries/games";
import { repeatLabel } from "@/lib/games/repeat";
import { isMapsUrl } from "@/lib/games/otherVenue";
import { confirmedIn, confirmedReady, namedTags, tagButtons, type ShownTag } from "@/lib/games/confirmed";
import { speedOf } from "@/lib/games/progress";
import { UPDATES_COPY, UPDATE_CHARS, canPostUpdate, updateProblem, updateProblemText, updatesList, updatesReady } from "@/lib/games/updates";
import { activityLog } from "@/lib/games/activity";
import { cleanVenueName } from "@/lib/utils/bookingApps";
import type { GameTag, SeriesInfo } from "@/lib/games/types";
import { NO_BADGES, badgeOf, type PlayerBadges } from "@/lib/profile/playerBadge";
import { ConfirmedField, draftCount, emptyConfirmed, type ConfirmedDraft } from "./ConfirmedField";
import {
  durationLabel,
  firstName,
  formatClock,
  formatGameDay,
  formatPrice,
  formatTimeRange,
  gameVenue,
  getGameStatus,
  hostNote,
  skillInfo,
  speakTimeRange,
  spotsInfo,
  turfInfo,
  venuePlace,
} from "@/lib/utils/game";
import { canRequest, canSeeHostNumber, ctaState, heroChip, waNumber } from "@/lib/utils/gameState";
import { sportFamily, sportLabel } from "@/lib/utils/sport";
import { gameShareText } from "@/lib/utils/gameShare";
import type { VenueOption } from "@/lib/utils/gameVenue";
import type { Game, GameRequest, GameParticipant } from "@/types/game";
import { mapEmbedSrc, mapsSearchUrl } from "@/lib/utils/maps";
import { LiveScorerPromo } from "@/components/tools/LiveScorerPromo";
import { turfPath } from "@/lib/utils/turfPath";
import { CONTACT_EMAIL } from "@/lib/contact";
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
import { GameVenueField } from "./detail/GameVenueField";
import { GameAside } from "./detail/GameAside";
import type { CtaModel } from "./detail/GameCta";
import { GameSkeleton } from "./detail/GameSkeleton";
import { gamePath, gameUrl } from "@/lib/utils/gamePath";
import { GameRepeat } from "./detail/GameRepeat";
import { GameScore } from "./detail/GameScore";
import { GameActivity } from "./detail/GameActivity";
import { SeriesStopSheet } from "./SeriesStopSheet";

const field = "w-full min-h-12 border border-primary-200 rounded-xl px-4 py-3 text-base md:text-sm text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-primary-50";
const label = "block text-[14px] font-medium text-primary-700 mb-1";

const NO_TAGS: readonly ShownTag[] = [];

export function GameDetailClient({
  gameId,
  liveLinks = false,
  sessionCode = null,
  tagged = NO_TAGS,
}: {
  gameId: string;
  liveLinks?: boolean;
  /** The game's own turf session code (lib/tournament/codes.ts gameTournamentCode), for a cricket match game. */
  sessionCode?: string | null;
  /**
   * The tagged players this page names (lib/games/shownTags.server.ts): read with the page's own copy on the
   * server, never by the browser, and checked here against the row and lineup read now (namedTags).
   */
  tagged?: readonly ShownTag[];
}) {
  const { user, login, getToken, signedInWith } = useAuth();
  // Reads on load never sign anyone out; the actions use getToken.
  const readToken = quietToken(signedInWith);
  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  // The medal on each player's photo (lib/profile/playerBadge.ts): read beside the lineup, for its players, the host and the tagged players named.
  const [badges, setBadges] = useState<PlayerBadges>(NO_BADGES);
  const [requests, setRequests] = useState<GameRequest[]>([]);
  // This viewer's latest request, read on load (pending or declined survives a reload).
  const [myRequest, setMyRequest] = useState<{ userId: string; id: string; status: GameRequest["status"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinNote, setJoinNote] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"idle" | "sent" | "error">("idle");
  // Why the last request didn't go through, in the server's words.
  const [joinError, setJoinError] = useState("");
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
  // The venue the host is moving the game to, until Save changes (null: it stays).
  const [newVenue, setNewVenue] = useState<VenueOption | null>(null);
  // The sheet's "Turf booked" when that venue was picked: what Undo puts back.
  const [bookedBeforePick, setBookedBeforePick] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // The repeat this game is one of (its rule, and its other games still open), and the host's stop sheet.
  const [series, setSeries] = useState<{ id: string; info: SeriesInfo | null; others: Pick<Game, "id" | "date" | "start_time" | "end_time">[] } | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  // Already confirmed (lib/games/confirmed.ts): the host's waiting tags, whether this viewer is tagged and waiting, the
  // answer being sent and what came back, and the edit sheet's draft.
  const [tags, setTags] = useState<{ gameId: string; list: GameTag[]; mine: boolean; shown: boolean } | null>(null);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagSaid, setTagSaid] = useState("");
  // This viewer took themselves off (Remove me): gone from the names at once, before the page's copy is fresh.
  const [leftTag, setLeftTag] = useState<string | null>(null);
  const [people, setPeople] = useState<ConfirmedDraft>(emptyConfirmed);
  // Updates from the host (lib/games/updates.ts): the sheet, what is typed, and one being taken back.
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  // "2 h ago": the clock, read when the page mounts and again each minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    const { data, badges: b } = await getGameParticipants(gameId, game ? [game.creator_id, ...tagged.map((t) => t.uid)] : []);
    setParticipants(data);
    setBadges(b);
    setParticipantsLoaded(true);
  };

  const loadRequests = async () => {
    const { data } = await getGameRequests(readToken, gameId);
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
      getGameRequests(readToken, gameId).then(({ data }) => {
        if (alive) setRequests(data);
      });
    }
    getGameParticipants(gameId, [game.creator_id, ...tagged.map((t) => t.uid)]).then(({ data, badges: b }) => {
      if (!alive) return;
      setParticipants(data);
      setBadges(b);
      setParticipantsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [game, user, isHost, gameId, readToken, tagged]);

  // Tagged players: one small read, only when the game says someone is tagged and waiting, for a signed-in viewer
  // (the host gets who; anyone else only whether it is them).
  const taggedCount = confirmedIn(game).tagged;
  const loadTags = async () => {
    const t = await getGameTags(readToken, gameId);
    setTags({ gameId, list: t.tags, mine: t.mine, shown: t.shown });
  };
  useEffect(() => {
    if (!viewerId || taggedCount === 0) return;
    let alive = true;
    void getGameTags(readToken, gameId).then((t) => alive && setTags({ gameId, list: t.tags, mine: t.mine, shown: t.shown }));
    return () => {
      alive = false;
    };
  }, [gameId, viewerId, taggedCount, readToken]);
  const waitingTags = isHost && taggedCount > 0 && tags?.gameId === gameId ? tags.list : [];
  // The viewer's own waiting tag. Answered before the game starts; once it is over, on their Passport.
  const myTag = !isHost && !isParticipant && taggedCount > 0 && tags?.gameId === gameId && tags.mine ? { shown: tags.shown } : null;
  const taggedMe = !!myTag && status === "upcoming" && game?.status !== "cancelled" && game?.status !== "completed";
  const askPlayed = !!myTag && status === "expired" && game?.status !== "cancelled";

  const handleTag = async (yes: boolean) => {
    setTagBusy(true);
    const r = await answerTag(getToken, gameId, yes);
    setTagBusy(false);
    setTagSaid(r.text);
    if (r.done) {
      setTags({ gameId, list: [], mine: false, shown: false });
      if (viewerId) setLeftTag(viewerId);
      await loadGame();
      await loadParticipants();
    }
  };

  const handlePostUpdate = async () => {
    const bad = updateProblem(updateText);
    if (bad) return setUpdateError(updateProblemText(bad));
    setUpdateBusy(true);
    setUpdateError("");
    const r = await postUpdate(getToken, gameId, updateText.trim());
    setUpdateBusy(false);
    if ("error" in r) return setUpdateError(r.error);
    setGame((g) => (g ? { ...g, updates: r.updates } : g));
    setNow(Date.now());
    setUpdateText("");
    setShowUpdate(false);
  };

  const handleRemoveUpdate = async (id: string) => {
    setRemoving(id);
    const r = await removeUpdate(getToken, gameId, id);
    setRemoving(null);
    if ("error" in r) return setUpdateError(r.error);
    setUpdateError("");
    setGame((g) => (g ? { ...g, updates: r.updates } : g));
  };

  // A game of a repeat: its rule and its next games (public reads, as the game is).
  const seriesId = game?.series_id ?? null;
  const loadSeries = async (id: string) => {
    const [info, games] = await Promise.all([getSeriesInfo([id]), getSeriesGames(id)]);
    return { id, info: info.get(id) ?? null, others: games.filter((g) => g.id !== gameId && getGameStatus(g) === "upcoming") };
  };
  useEffect(() => {
    if (!seriesId) return;
    let alive = true;
    void loadSeries(seriesId).then((s) => alive && setSeries(s));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, gameId]);
  const repeat = series && series.id === seriesId ? series : null;

  const handleStopSeries = async (cancel: boolean) => {
    if (!seriesId) return null;
    const { error } = await stopSeries(getToken, seriesId, cancel);
    if (error) return error;
    setStopOpen(false);
    setSeries(await loadSeries(seriesId));
    if (cancel) await loadGame();
    return null;
  };

  // Pending or declined after a reload: one small read, only for a
  // signed-in viewer who is neither the host nor already playing.
  useEffect(() => {
    if (!viewerId || isHost || !participantsLoaded || isParticipant) return;
    let alive = true;
    getMyRequestForGame(readToken, gameId).then(({ data }) => {
      if (alive) setMyRequest(data ? { userId: viewerId, ...data } : null);
    });
    return () => {
      alive = false;
    };
  }, [gameId, viewerId, isHost, participantsLoaded, isParticipant, readToken]);

  const handleJoin = async () => {
    if (!user) { login(); return; }
    setJoining(true);
    // The server works out who is asking from this sign-in, and words any refusal.
    const { error } = await sendJoinRequest(getToken, gameId, joinNote);
    setJoining(false);
    if (error) {
      setJoinError(error);
      setJoinStatus("error");
    } else {
      setJoinStatus("sent");
      setShowJoinForm(false);
    }
  };

  const [acceptError, setAcceptError] = useState("");

  const handleAccept = async (requestId: string) => {
    setAcceptError("");
    const { success, error } = await acceptRequest(getToken, requestId);
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
    const { success, error } = await declineRequest(getToken, requestId);
    if (!success) {
      setAcceptError(error || "Failed to decline request");
      setTimeout(() => setAcceptError(""), 4000);
    }
    await loadRequests();
  };

  const handleShare = async () => {
    if (!game) return;
    // Its readable URL with the words it has now (lib/utils/gamePath.ts): after an edit the address bar still has the old
    // ones. A game at its whole-id URL (its code is shared) keeps the address as it is.
    const url = window.location.pathname.endsWith(game.id) ? window.location.href : `${window.location.origin}${gamePath(game)}`;
    // Which game, where and when (lib/utils/gameShare.ts), the link last and inside the text: a share
    // sheet's Copy (and some apps) takes only the text, so a separate url would be lost.
    const closed = game.status === "cancelled" ? "cancelled" : status === "expired" || game.status === "completed" ? "ended" : undefined;
    // Where: its turf, or the venue its host typed.
    const at = gameVenue(game);
    const text = gameShareText(
      { ...game, turfs: game.turfs ?? (at ? { name: at.name, area: at.area, city: at.city ?? at.cityLabel } : null), listed: at ? at.listed : true },
      { host: isHost, closed, url, repeat: repeat?.info?.active ? repeatLabel(repeat.info.rule) : null },
    );
    if (navigator.share) {
      try {
        await navigator.share({ title: text.split("\n")[0], text });
      } catch {
        // Closed the share sheet.
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
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
    setNewVenue(null);
    setPeople({ ...emptyConfirmed(), names: confirmedIn(game).names, extra: confirmedIn(game).extra });
    setSaveError("");
    setShowEditModal(true);
  };

  // A booking was for the old turf: a new venue starts as not booked and
  // the sheet asks; Undo puts back what the sheet said before the pick.
  const pickVenue = (v: VenueOption | null) => {
    setNewVenue(v);
    if (v) {
      setBookedBeforePick(editData.turf_booked);
      if (editData.turf_booked) setEditData((d) => ({ ...d, turf_booked: false }));
    } else if (bookedBeforePick) {
      setEditData((d) => ({ ...d, turf_booked: true }));
    }
  };

  const handleSaveEdit = async () => {
    if (!game || !user) return;
    setSaving(true);
    setSaveError("");
    const moved = newVenue && (newVenue.typed || newVenue.id !== game.turf_id) ? newVenue : null;
    // A move is part of the same save: the server tells the players. A typed venue goes as its words, a turf as its id.
    const move = moved?.typed
      ? { venue_name: moved.typed.name, venue_address: moved.typed.address, venue_area: moved.typed.area, venue_city: moved.typed.city, venue_maps_url: moved.typed.mapsUrl }
      : moved
        ? { turf_id: moved.id }
        : {};
    // Already confirmed: only what the host changed goes, so an edit of anything else is the body it always was.
    const was = confirmedIn(game);
    const confirmedChanges = confirmedReady(game)
      ? {
          ...(people.names.length !== was.names.length || people.names.some((n, i) => n !== was.names[i]) ? { confirmed_names: people.names } : {}),
          ...(people.extra !== was.extra ? { confirmed_extra: people.extra } : {}),
          ...(people.tags.length ? { confirmed_tags: people.tags.map((t) => t.u) } : {}),
          ...(people.untag.length ? { confirmed_untag: people.untag } : {}),
        }
      : {};
    const { error } = await updateGame(getToken, game.id, {
      date: editData.date,
      start_time: editData.start_time,
      end_time: editData.end_time,
      max_players: editData.max_players,
      price_per_player: Number(editData.price_per_player),
      // Once the game has updates (20261118_game_updates.sql) its first note is not edited: the host posts an update.
      ...(updatesReady(game) ? {} : { description: editData.description || undefined }),
      turf_booked: editData.turf_booked,
      skill_level: editData.skill_level as Game["skill_level"],
      ...move,
      ...confirmedChanges,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
    } else {
      setShowEditModal(false);
      await loadGame();
      if ("confirmed_tags" in confirmedChanges || "confirmed_untag" in confirmedChanges) await loadTags();
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
  // Its TapTurf turf, or the venue its host typed (not on TapTurf: no turf page, photos or pin).
  const where = gameVenue(game);
  const venue = where?.name || `${sportName} game`;
  const listed = where?.listed ?? true;
  const chip: HeroChip = heroChip({ isHost, status: game.status, timing: status, spotsLeft });
  const note = cta === "cancelled" || cta === "ended" || cta === "full" ? cta : null;
  // The bar's label: "Filling fast" only when players really joined quickly (lib/games/progress.ts), from the lineup's own times.
  const joiners = participants.filter((p) => p.user_id !== game.creator_id);
  const speed = speedOf({
    current: game.current_players,
    max: game.max_players,
    closed: status !== "upcoming" || cancelled || game.status === "completed",
    now,
    createdAt: game.created_at,
    joined: joiners.length,
    joinedAt: joiners.map((p) => p.joined_at),
  });
  // The tagged players named to this visitor: the page's copy, less anyone in the lineup by now and the viewer once they left.
  const named = isHost
    ? []
    : namedTags({ named: tagged, tagged: confirmedIn(game).tagged, inGame: new Set(participants.map((p) => p.user_id)), left: leftTag ? new Set([leftTag]) : undefined });
  // What the host has said, newest first, and whether they can add to it now.
  const updates = updatesList(game, hostNote(game));
  const canPost = isHost && canPostUpdate(game) && status !== "expired" && !cancelled && game.status !== "completed";
  const log = activityLog({ game, hostFirst, participants, clean: cleanVenueName });
  const buttons = tagButtons(!!myTag?.shown);

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

  // A frame-able map only: the stored link is usually a /maps/place/ URL,
  // which Google refuses to frame (an empty white box). A typed venue with
  // the host's own Maps link has no map here (it can't be framed, and a
  // search could pin another place of that name): Open in Maps is the
  // host's pin. Without one, the map is a search for its name, address and
  // city, said to be approximate.
  const hostPin = !listed && isMapsUrl(game.venue_maps_url);
  const mapSrc = listed
    ? mapEmbedSrc({ embedLink: game.turfs?.["Gmap Embed link"], lat: game.turfs?.lat, lng: game.turfs?.lng, address: game.turfs?.address })
    : where && !hostPin
      ? mapEmbedSrc({ address: [where.name, where.address, where.cityLabel].filter(Boolean).join(", ") })
      : null;

  return (
    <div className="md:max-w-2xl lg:max-w-6xl mx-auto sm:px-6 sm:pt-5 lg:pt-6">
      <Link
        href="/games"
        className="hidden lg:inline-flex h-11 mb-2 items-center gap-1.5 text-[15px] font-medium text-primary-700 hover:text-primary-900"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        All games
      </Link>

      {/* No items-start: the aside stretches to the row's height, so its card stays in view (sticky) all the way down. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0">
          <GameHero
            photos={where?.photos}
            family={family}
            sport={game.sport}
            sportName={sportName}
            chip={chip}
            muted={chip === "ended" || chip === "cancelled"}
            onShare={handleShare}
          />

          <div className="relative -mt-5 sm:mt-5 rounded-t-[24px] sm:rounded-none bg-white px-4 sm:px-0 pt-4 sm:pt-0 pb-1">
            <GameTitle
              venue={venue}
              sportName={sportName}
              place={venuePlace(where)}
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

            {/* A tagged player: the host says they are in. Their answer, once. */}
            {(taggedMe || tagSaid) && (
              <section aria-labelledby="tag-h" className="rounded-2xl border border-accent-500/40 bg-accent-50 p-4">
                <h2 id="tag-h" className="flex items-center gap-2 text-[16px] font-bold text-primary-900">
                  <UserCheck className="w-5 h-5 text-accent-700 shrink-0" aria-hidden />
                  {taggedMe ? (myTag?.shown ? "You're on the list" : "Are you in?") : "Thanks"}
                </h2>
                {taggedMe ? (
                  <>
                    <p className="mt-1 text-[14px] leading-snug text-primary-800">
                      {myTag?.shown
                        ? `${hostFirst === "the host" ? "The host" : hostFirst} added you to this game, and your name shows in the lineup. Tap I'm in to confirm, or remove yourself: your name comes off at once.`
                        : `${hostFirst === "the host" ? "The host" : hostFirst} added you as confirmed for this game. Your name shows in the lineup only if you say yes.`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={tagBusy}
                        onClick={() => handleTag(true)}
                        className="h-11 rounded-full bg-accent-600 hover:bg-accent-700 px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                      >
                        {buttons.yes}
                      </button>
                      <button
                        type="button"
                        disabled={tagBusy}
                        onClick={() => handleTag(false)}
                        className="h-11 rounded-full border border-primary-300 bg-white px-5 text-[15px] font-semibold text-primary-900 hover:bg-primary-50 disabled:opacity-60"
                      >
                        {buttons.no}
                      </button>
                    </div>
                    {tagSaid && <p role="alert" className="mt-2 text-[14px] text-hot-600">{tagSaid}</p>}
                  </>
                ) : (
                  <p role="status" className="mt-1 text-[14px] text-primary-800">{tagSaid}</p>
                )}
              </section>
            )}

            {/* Tagged, never answered, and the game is over: the answer is on their Passport. */}
            {askPlayed && !tagSaid && (
              <p className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-[14px] leading-snug text-primary-800">
                {hostFirst === "the host" ? "The host" : hostFirst} added you to this game. Did you play?{" "}
                <Link href="/dashboard?tab=passport" className="font-semibold text-accent-800 underline underline-offset-2">
                  Confirm it on your Passport
                </Link>
              </p>
            )}

            <GameFacts
              day={day}
              past={ended}
              range={range}
              spokenRange={speakTimeRange(game.start_time, game.end_time)}
              length={model.duration}
              price={{ free, label: price }}
              spots={spots}
              skill={skillInfo(game.skill_level)}
              turf={turfInfo(game.turf_booked, listed)}
            />

            {repeat?.info && <GameRepeat info={repeat.info} others={repeat.others} isHost={isHost} onStop={() => setStopOpen(true)} />}

            <GameHostCard
              hostName={game.host_name}
              hostFirst={hostFirst}
              hostPhoto={game.host_profile_image_url}
              hostId={game.creator_id}
              hostBadge={badgeOf(badges, game.creator_id)}
              updates={updates}
              now={now}
              canPost={canPost}
              onPost={() => {
                setUpdateError("");
                setShowUpdate(true);
              }}
              onRemove={handleRemoveUpdate}
              removing={removing}
              error={showUpdate ? "" : updateError}
              isHost={isHost}
              phone={phone}
              showNumber={showNumber}
              closed={ended || cancelled}
              onSignIn={login}
            />

            <GameLineup
              participants={participants}
              confirmed={confirmedIn(game)}
              waitingTags={waitingTags}
              tagged={named}
              badges={badges}
              speed={speed}
              hostFirst={hostFirst}
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

            {game.turfs?.id ? (
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
            ) : where && !where.listed ? (
              // A venue its host typed: no turf page to link; Open in Maps goes to the host's own Google Maps link, else a search for it.
              <GameWhere
                name={where.name}
                address={where.address}
                place={venuePlace(where)}
                photos={undefined}
                family={family}
                lat={null}
                lng={null}
                mapSrc={mapSrc}
                mapNote={mapSrc ? "Approximate: Google's match for the address the host typed." : undefined}
                mapHref={where.mapsHref}
              />
            ) : null}

            {/* Cricket or any sport the Live Scoreboard knows; renders nothing for the rest. A cricket match game
                gets its turf session card (Score this game, or its running result), the promo when that has nothing to show. */}
            {family === "cricket" ? (
              <GameScore
                game={game}
                participants={participants}
                isHost={isHost}
                isParticipant={isParticipant}
                where={where}
                sessionCode={sessionCode}
                fallback={status !== "expired" ? <LiveScorerPromo sport={game.sport} variant="game" venue={where?.name} live={status === "live"} liveLinks={liveLinks} /> : null}
              />
            ) : (
              status !== "expired" && <LiveScorerPromo sport={game.sport} variant="game" venue={where?.name} live={status === "live"} liveLinks={liveLinks} />
            )}

            {/* Last and quiet, as on live score links: a game that is spam,
                fake or unsafe comes to us by email. Not for its own host. */}
            {!isHost && (
              <p className="text-center text-[12px] text-primary-500">
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Report game ${gameId}`)}&body=${encodeURIComponent(`Game: ${game ? gameUrl(game) : `https://www.tapturf.in/game/${gameId}`}\n\nWhat's wrong with it?\n`)}`}
                  className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-800"
                >
                  Report this game
                </a>
              </p>
            )}

            {/* Last on the page: what happened to the game and when (lib/games/activity.ts). */}
            <GameActivity log={log} now={now} />
          </div>
        </div>

        <GameAside m={model} />
      </div>

      <GameCtaBar m={model} />

      {isHost && repeat?.info && (
        <SeriesStopSheet
          open={stopOpen}
          label={repeatLabel(repeat.info.rule)}
          left={repeat.others.length + (cta !== "cancelled" && status === "upcoming" ? 1 : 0)}
          onStop={handleStopSeries}
          onClose={() => setStopOpen(false)}
        />
      )}

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
              maxLength={300}
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
                {joinError || "Couldn't send your request. You may have asked already."}
              </p>
            )}
          </div>
        </ViewportOverlay>
      )}

      {showUpdate && (
        <ViewportOverlay className="z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={() => setShowUpdate(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="update-h" className="relative w-full md:max-w-md max-h-[calc(var(--vv-h,100dvh)*0.92)] overflow-y-auto overscroll-contain bg-white rounded-t-3xl md:rounded-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h2 id="update-h" className="text-[20px] font-bold text-primary-900 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary-500" aria-hidden />
                {UPDATES_COPY.post}
              </h2>
              <button onClick={() => setShowUpdate(false)} aria-label="Close" className="size-11 -mr-2 grid place-items-center rounded-full hover:bg-primary-100">
                <X className="w-5 h-5 text-primary-700" aria-hidden />
              </button>
            </div>
            <label htmlFor="update-text" className="sr-only">Your update</label>
            <textarea
              id="update-text"
              value={updateText}
              onChange={(e) => {
                setUpdateText(e.target.value);
                if (updateError) setUpdateError("");
              }}
              aria-describedby="update-hint"
              placeholder={UPDATES_COPY.placeholder}
              maxLength={UPDATE_CHARS}
              rows={4}
              className={`${field} resize-none`}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <p id="update-hint" className="text-[13px] leading-snug text-primary-500">{UPDATES_COPY.hint}</p>
              <p className="shrink-0 text-[13px] text-primary-500 tabular" aria-hidden>
                {[...updateText].length}/{UPDATE_CHARS}
              </p>
            </div>
            <button
              onClick={handlePostUpdate}
              disabled={updateBusy || !updateText.trim()}
              className="w-full mt-4 h-12 rounded-full bg-accent-600 hover:bg-accent-700 text-white text-[16px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {updateBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  Posting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" aria-hidden />
                  Post update
                </>
              )}
            </button>
            {updateError && <p role="alert" className="text-[14px] text-hot-600 text-center mt-3">{updateError}</p>}
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
              {/* Moving a game that is over or cancelled tells nobody anything useful. */}
              {!ended && game.status !== "cancelled" && game.status !== "completed" && (
                <GameVenueField
                  current={
                    listed
                      ? game.turfs
                      : where && {
                          name: where.name,
                          area: where.area,
                          city: where.city ?? where.cityLabel,
                          address: where.address,
                          typed: { name: where.name, address: where.address, area: where.area, city: game.venue_city ?? where.cityLabel, mapsUrl: game.venue_maps_url ?? null },
                        }
                  }
                  sport={game.sport}
                  picked={newVenue}
                  onPick={pickVenue}
                  wasBooked={bookedBeforePick}
                  booked={editData.turf_booked}
                  onBooked={(b) => setEditData({ ...editData, turf_booked: b })}
                />
              )}

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
                    min={Math.max(2, participants.length + draftCount(people, waitingTags))}
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

              {/* The friends the host says are in: names, people without one, tagged players. Not for a game that is over or off. */}
              {confirmedReady(game) && !ended && game.status !== "cancelled" && game.status !== "completed" && (
                <ConfirmedField
                  value={people}
                  onChange={setPeople}
                  max={editData.max_players}
                  joined={Math.max(1, participants.length)}
                  waiting={waitingTags}
                  className="rounded-2xl border border-primary-200 p-4"
                />
              )}

              <div>
                <label htmlFor="edit-skill" className={label}>Skill level</label>
                <select id="edit-skill" value={editData.skill_level} onChange={(e) => setEditData({ ...editData, skill_level: e.target.value })} className={field}>
                  <option value="all">All levels</option>
                  <option value="beginner">Beginners</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              {updatesReady(game) ? (
                // The note the game went up with stays as it is; what the host adds now is an update, with its time.
                canPost && (
                  <div>
                    <p className={label}>Something to tell the players?</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setUpdateError("");
                        setShowUpdate(true);
                      }}
                      className="h-11 inline-flex items-center gap-2 rounded-full border border-primary-300 px-4 text-[15px] font-semibold text-primary-900 hover:bg-primary-50"
                    >
                      <Megaphone className="w-4 h-4" aria-hidden />
                      {UPDATES_COPY.post}
                    </button>
                    <p className="mt-1 text-[13px] text-primary-500">It shows on the game page with the time, and the players are told.</p>
                  </div>
                )
              ) : (
              <div>
                <label htmlFor="edit-note" className={label}>Note for players</label>
                <textarea
                  id="edit-note"
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  aria-describedby="edit-note-hint"
                  placeholder="Ball type, format, what to bring…"
                  maxLength={500}
                  rows={3}
                  className={`${field} resize-none`}
                />
                <p id="edit-note-hint" className="mt-1 text-[13px] text-primary-500">Shown on the game page</p>
              </div>
              )}

              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editData.turf_booked}
                  onChange={(e) => setEditData({ ...editData, turf_booked: e.target.checked })}
                  aria-describedby="edit-booked-hint"
                  className="size-5 rounded border-primary-300 accent-accent-600"
                />
                <span>
                  <span className="block text-[15px] font-medium text-primary-900">{(newVenue ? newVenue.typed : !listed) ? "Venue booked" : "Turf booked"}</span>
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

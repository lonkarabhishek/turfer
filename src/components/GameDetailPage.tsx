import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, MapPin, Users, DollarSign, Phone, ArrowLeft,
  CheckCircle, Trophy, Star, MessageCircle, Share2, Copy, User, Check, X, Trash2
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { gamesAPI } from '../lib/api';
import { gameRequestHelpers } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { buildWhatsAppShareLink } from '../lib/whatsapp';
import { track } from '../lib/analytics';
import { useToast } from '../lib/toastManager';

interface GameDetailPageProps {
  gameId: string;
  onBack: () => void;
  onNavigate?: (section: string) => void;
}

interface GameDetails {
  id: string;
  hostName: string;
  hostPhone: string;
  turfName: string;
  turfAddress: string;
  date: string;
  timeSlot: string;
  format: string;
  skillLevel: string;
  currentPlayers: number;
  maxPlayers: number;
  costPerPerson: number;
  notes?: string;
  status: 'upcoming' | 'live' | 'completed';
  endTime?: string;
  creatorId?: string; // ID of the user who created the game
  players?: Array<{
    id: string;
    name: string;
    profile_image_url?: string;
    joinedAt: string;
  }>;
}

export function GameDetailPage({ gameId, onBack, onNavigate }: GameDetailPageProps) {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [hostInfo, setHostInfo] = useState<any>(null); // Store host profile info
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadGameDetails();
    loadGameParticipants();
    loadPendingRequests();
    checkUserRequest();
  }, [gameId, user]);

  const loadGameParticipants = async () => {
    setLoadingPlayers(true);
    try {
      const response = await gameRequestHelpers.getGameParticipants(gameId);
      if (response.data) {
        const allParticipants = response.data.map((participant: any) => ({
          id: participant.users?.id || participant.user_id,
          name: participant.users?.name || 'Player',
          profile_image_url: participant.users?.profile_image_url || '',
          joinedAt: participant.joined_at
        }));

        // Separate host from other players
        // Host is identified by creator_id from game data
        if (game?.creatorId) {
          const host = allParticipants.find((p: any) => p.id === game.creatorId);
          const otherPlayers = allParticipants.filter((p: any) => p.id !== game.creatorId);

          setHostInfo(host);
          setPlayers(otherPlayers);
        } else {
          // Fallback: show all participants if creator_id not available
          setPlayers(allParticipants);
        }

        // Check if current user has joined by checking participants
        if (user) {
          const userHasJoined = allParticipants.some((p: any) => p.id === user.id);
          setHasJoined(userHasJoined);
        }
      }
    } catch (error) {
      console.error('Error loading game participants:', error);
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const loadPendingRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await gameRequestHelpers.getGameRequests(gameId);
      if (response.data) {
        // Filter only pending requests
        const pending = response.data.filter((req: any) => req.status === 'pending');
        setPendingRequests(pending);
      }
    } catch (error) {
      console.error('Error loading pending requests:', error);
      setPendingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const checkUserRequest = async () => {
    if (!user) {
      setHasPendingRequest(false);
      return;
    }

    try {
      const response = await gameRequestHelpers.getUserGameRequests(user.id);
      if (response.data) {
        // Check if user has a pending request for this specific game
        const userRequest = response.data.find(
          (req: any) => req.game_id === gameId && req.status === 'pending'
        );
        setHasPendingRequest(!!userRequest);
      }
    } catch (error) {
      console.error('Error checking user request:', error);
      setHasPendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setProcessingRequestId(requestId);
    try {
      const response = await gameRequestHelpers.acceptRequest(requestId, gameId);
      if (response.data && !response.error) {
        // Refresh both the requests list and participants list
        await Promise.all([
          loadPendingRequests(),
          loadGameParticipants(),
          loadGameDetails()
        ]);
        track('game_request_accepted', { game_id: gameId, request_id: requestId });
      } else {
        alert(response.error || 'Failed to accept request');
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      alert('Failed to accept request');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setProcessingRequestId(requestId);
    try {
      const response = await gameRequestHelpers.rejectRequest(requestId, gameId);
      if (response.data && !response.error) {
        // Refresh the requests list
        await loadPendingRequests();
        track('game_request_rejected', { game_id: gameId, request_id: requestId });
      } else {
        alert(response.error || 'Failed to decline request');
      }
    } catch (error) {
      console.error('Error declining request:', error);
      alert('Failed to decline request');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeleteGame = async () => {
    setDeleting(true);
    try {
      const response = await gamesAPI.deleteGame(gameId);
      if (response.success) {
        track('game_deleted', { game_id: gameId });
        success('Game deleted successfully!', 'Redirecting you to find games...');
        setShowDeleteModal(false);
        // Wait a moment for the toast to show before navigating to games page
        setTimeout(() => {
          if (onNavigate) {
            onNavigate('games');
          } else {
            onBack();
          }
        }, 1500);
      } else {
        showError(response.error || 'Failed to delete game');
      }
    } catch (err) {
      console.error('Error deleting game:', err);
      showError('Failed to delete game');
    } finally {
      setDeleting(false);
    }
  };

  const loadGameDetails = async () => {
    try {
      const response = await gamesAPI.getGameById(gameId);
      if (response.success && response.data) {
        const gameData = response.data;
        console.log('Raw game data:', gameData);
        
        // Transform the data to match expected interface
        const transformedGame = {
          id: gameData.id || 'unknown',
          hostName: gameData.users?.name || gameData.host_name || gameData.hostName || "Unknown Host",
          hostPhone: gameData.users?.phone || gameData.host_phone || gameData.hostPhone || "9999999999",
          turfName: gameData.turfs?.name || gameData.turf_name || gameData.turfName || "Unknown Turf",
          turfAddress: gameData.turfs?.address || gameData.turf_address || gameData.turfAddress || "Unknown Address",
          date: gameData.date || new Date().toISOString().split('T')[0],
          timeSlot: `${gameData.start_time || gameData.startTime || '00:00'} - ${gameData.end_time || gameData.endTime || '00:00'}`,
          format: gameData.sport || gameData.format || "Game",
          skillLevel: gameData.skill_level || gameData.skillLevel || 'beginner',
          currentPlayers: gameData.current_players || gameData.currentPlayers || 1,
          maxPlayers: gameData.max_players || gameData.maxPlayers || 10,
          costPerPerson: gameData.price_per_player || gameData.costPerPerson || 0,
          notes: gameData.notes || gameData.description || '',
          creatorId: gameData.creator_id || gameData.creatorId || gameData.host_id || undefined,
          players: gameData.players || []
        };
        
        console.log('Transformed game data:', transformedGame);
        
        // Check if game is completed (past the end time)
        const endTime = gameData.end_time || gameData.endTime || '23:59';
        const gameDateTime = new Date(`${gameData.date}T${endTime}`);
        const now = new Date();
        const status = now > gameDateTime ? 'completed' : 'upcoming';
        
        setGame({
          ...transformedGame,
          status
        });
        
        // Check if user has already joined
        if (user && gameData.players) {
          setHasJoined(gameData.players.some((p: any) => p.userId === user.id));
        }
      } else {
        setError('Game not found');
      }
    } catch (error) {
      console.error('Error loading game:', error);
      setError('Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!user) {
      alert('Please login to join games');
      return;
    }

    setJoining(true);
    try {
      const response = await gamesAPI.joinGame(gameId);
      if (response.success) {
        // Reload participants to update the list and hasJoined status
        await loadGameParticipants();
        await loadGameDetails(); // Refresh to get updated player count
        track('game_joined', { game_id: gameId });
      } else {
        alert(response.error || 'Failed to join game');
      }
    } catch (error) {
      console.error('Error joining game:', error);
      alert('Failed to join game');
    } finally {
      setJoining(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!game) return;
    
    const message = `🏆 JOIN MY GAME! 🏆

${game.format} at ${game.turfName}
📅 ${formatDate(game.date)}
⏰ ${game.timeSlot}
📍 ${game.turfAddress}
👥 ${game.maxPlayers - game.currentPlayers} spots available
💰 ₹{game.costPerPerson}/person

Ready to play? Join now!
${window.location.href}

Hosted by ${game.hostName}
#TapTurf #${game.format.replace(/\\s+/g, '')}`;

    const whatsappUrl = buildWhatsAppShareLink(message);
    window.open(whatsappUrl, '_blank');
    track('whatsapp_share_game', { game_id: gameId });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track('copy_game_link', { game_id: gameId });
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleRequestToJoin = async () => {
    if (!user) {
      alert('Please login to request to join games');
      return;
    }

    setRequestLoading(true);
    try {
      const response = await gameRequestHelpers.sendJoinRequest(gameId, `Hi, I'd like to join your ${game?.format} game!`);
      if (response.data && !response.error) {
        alert('Join request sent! The host will be notified.');
        // Update the hasPendingRequest status
        setHasPendingRequest(true);
        track('game_request_sent', { game_id: gameId });
      } else {
        alert(response.error || 'Failed to send join request');
      }
    } catch (error) {
      console.error('Error sending join request:', error);
      alert('Failed to send join request');
    } finally {
      setRequestLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading game details...</p>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">❌</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Game Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'This game may have been removed or the link is invalid.'}</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Games
          </Button>
        </div>
      </div>
    );
  }

  const isGameCompleted = game.status === 'completed';
  const spotsLeft = game.maxPlayers - game.currentPlayers;
  const isFull = spotsLeft <= 0;
  // Check if the current user is the host/creator of the game
  const isHost = user && game?.creatorId ? user.id === game.creatorId : false;

  // Require login to view game details
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-6">
            Please sign in to view game details and join games.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => {
                if (onNavigate) {
                  onNavigate('profile');
                } else {
                  // Fallback: reload to home and let auth redirect happen
                  window.location.href = '/';
                }
              }}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white"
            >
              Sign In to Continue
            </Button>
            <Button
              onClick={() => {
                if (onBack) {
                  onBack();
                } else {
                  // Fallback: go back in history
                  window.history.back();
                }
              }}
              variant="outline"
              className="w-full"
            >
              Back to Games
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Games
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleShareWhatsApp}>
              <MessageCircle className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" onClick={handleCopyLink}>
              {copied ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
        </div>

        {/* Game Status Badge */}
        {isGameCompleted && (
          <motion.div
            className="bg-yellow-100 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              <span className="font-medium">Game Completed</span>
            </div>
          </motion.div>
        )}
        
        {/* Full Game Badge */}
        {!isGameCompleted && isFull && (
          <motion.div
            className="bg-red-100 border border-red-200 text-red-800 px-4 py-2 rounded-lg mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span className="font-medium">🎯 Game Full - No More Spots Available</span>
            </div>
          </motion.div>
        )}

        {/* Main Game Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-2 border-primary-200 shadow-lg">
            <CardContent className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{game.format}</h1>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    isGameCompleted ? 'bg-yellow-100 text-yellow-800' :
                    isFull ? 'bg-red-100 text-red-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {isGameCompleted ? '🏆 Completed' :
                     isFull ? '👥 Full' :
                     `${spotsLeft} spots left`}
                  </div>
                </div>
                
                {isHost && (
                  <div className="bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm font-medium">
                    👑 Your Game
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">Date & Time</div>
                      <div className="text-gray-600">{formatDate(game.date)}</div>
                      <div className="text-gray-600">{game.timeSlot}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{game.turfName}</div>
                      <div className="text-gray-600 text-sm">{game.turfAddress}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary-600" />
                    <div>
                      <div className="font-semibold text-gray-900">Players</div>
                      <div className="text-gray-600">{game.currentPlayers}/{game.maxPlayers} confirmed</div>
                      <div className="text-sm text-gray-500">Skill: {game.skillLevel}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-primary-600" />
                    <div>
                      <div className="font-semibold text-gray-900">Cost</div>
                      <div className="text-gray-600">₹{game.costPerPerson}/person</div>
                      <div className="text-sm text-gray-500">Total: ₹{game.costPerPerson * game.maxPlayers}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Host Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Host</h3>
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium">{game.hostName}</div>
                    <div className="text-sm text-gray-600">{game.hostPhone}</div>
                  </div>
                </div>
              </div>

              {/* Pending Requests (visible only to host) */}
              {isHost && pendingRequests.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">
                      Pending Join Requests ({pendingRequests.length})
                    </h3>
                    {loadingRequests && (
                      <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <motion.div
                        key={request.id}
                        className="bg-white rounded-lg p-3 border border-blue-200"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1">
                            {request.users?.profile_image_url || request.requester_avatar ? (
                              <img
                                src={request.users?.profile_image_url || request.requester_avatar}
                                alt={request.users?.name || request.requester_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {(request.users?.name || request.requester_name || 'P').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {request.users?.name || request.requester_name || 'Game Player'}
                              </div>
                              {request.note && (
                                <div className="text-sm text-gray-500 mt-1">{request.note}</div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                Requested {new Date(request.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAcceptRequest(request.id)}
                              disabled={processingRequestId === request.id}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {processingRequestId === request.id ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeclineRequest(request.id)}
                              disabled={processingRequestId === request.id}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              {processingRequestId === request.id ? (
                                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {game.notes && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Game Notes</h3>
                  <p className="text-gray-600">{game.notes}</p>
                </div>
              )}

              {/* Players List */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">
                    Players ({game.currentPlayers}/{game.maxPlayers})
                  </h3>
                  {loadingPlayers && (
                    <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
                  )}
                </div>
                
                <div className="space-y-3">
                  {/* Host */}
                  <div className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                    <div className="relative">
                      {hostInfo?.profile_image_url ? (
                        <img
                          src={hostInfo.profile_image_url}
                          alt={game.hostName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {game.hostName?.charAt(0)?.toUpperCase() || 'H'}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-1">
                        <span className="text-xs">👑</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{game.hostName}</div>
                      <div className="text-sm text-primary-600">Host & Organizer</div>
                    </div>
                  </div>
                  
                  {/* Other Players */}
                  {players.length > 0 ? (
                    players.map((player, index) => (
                      <div key={player.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                        {player.profile_image_url ? (
                          <img
                            src={player.profile_image_url}
                            alt={player.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{player.name}</div>
                          <div className="text-sm text-gray-500">
                            Joined {new Date(player.joinedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : !loadingPlayers && game.currentPlayers > 1 && (
                    <div className="text-center py-4 text-gray-500">
                      <Users className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">
                        {game.currentPlayers - 1} other player{game.currentPlayers > 2 ? 's' : ''} joined
                      </p>
                      <p className="text-xs text-gray-400">
                        {game.currentPlayers > 2 ? 'Players confirmed' : 'Player confirmed'}
                      </p>
                    </div>
                  )}
                  
                  {/* Empty Slots */}
                  {Array.from({ length: Math.max(0, game.maxPlayers - game.currentPlayers) }, (_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 rounded-lg">
                      <div className="w-10 h-10 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center text-gray-400">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-400">Open spot</div>
                        <div className="text-sm text-gray-300">Waiting for player...</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              {!isGameCompleted && (
                <div className="space-y-3">
                  {/* Show "You're In!" if user has joined */}
                  {hasJoined && user && (
                    <div className="bg-green-100 text-green-800 px-4 py-3 rounded-lg flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">You're In!</span>
                    </div>
                  )}

                  {/* Show "Request Pending" if user has pending request */}
                  {!hasJoined && hasPendingRequest && user && (
                    <div className="bg-yellow-100 text-yellow-800 px-4 py-3 rounded-lg flex items-center justify-center gap-2">
                      <Clock className="w-5 h-5" />
                      <span className="font-medium">Request Pending</span>
                    </div>
                  )}

                  {/* Show "Request to Join" button if not joined, no pending request, not full, and not host */}
                  {!isHost && !hasJoined && !hasPendingRequest && !isFull && user && (
                    <Button
                      onClick={handleRequestToJoin}
                      disabled={requestLoading}
                      className="w-full bg-primary-600 hover:bg-primary-700"
                    >
                      {requestLoading ? 'Sending...' : 'Request to Join'}
                    </Button>
                  )}

                  {isFull && !hasJoined && (
                    <div className="flex-1 bg-red-100 text-red-800 px-4 py-2 rounded-lg text-center">
                      Game Full
                    </div>
                  )}

                  {!user && (
                    <Button
                      onClick={() => alert('Please login to join this game')}
                      className="flex-1 bg-primary-600 hover:bg-primary-700"
                    >
                      Login to Join
                    </Button>
                  )}

                  {/* Delete Game Button for Host */}
                  {isHost && (
                    <Button
                      onClick={() => setShowDeleteModal(true)}
                      variant="outline"
                      className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 mt-4"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Game
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteModal && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => !deleting && setShowDeleteModal(false)}
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
              >
                <Card className="w-full max-w-md bg-white shadow-2xl">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <Trash2 className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Delete Game?</h3>
                        <p className="text-sm text-gray-500">This action cannot be undone</p>
                      </div>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <p className="text-sm text-red-800">
                        <strong>Warning:</strong> Deleting this game will:
                      </p>
                      <ul className="mt-2 text-sm text-red-700 space-y-1 ml-4 list-disc">
                        <li>Remove all pending join requests</li>
                        <li>Remove all participants from the game</li>
                        <li>Permanently delete the game</li>
                      </ul>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowDeleteModal(false)}
                        disabled={deleting}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDeleteGame}
                        disabled={deleting}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      >
                        {deleting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Game
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, Clock, Trophy, MessageCircle, UserPlus, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { analytics, track } from '../lib/analytics';

// Utility function to show time ago
const timeAgo = (createdAt: string): string => {
  const now = new Date();
  const gameCreated = new Date(createdAt);
  const diffInMs = now.getTime() - gameCreated.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return gameCreated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Utility function to format date in Indian format
const formatDate = (dateString: string): string => {
  if (!dateString) return 'Date not set';

  const date = new Date(dateString);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return dateString; // Return original string if invalid
  }

  const day = date.getDate();
  const month = date.toLocaleDateString('en-IN', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);

  // Add ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return `${getOrdinal(day)} ${month} ${year}`;
};

// Convert 24-hour time to 12-hour AM/PM format
const convertTo12Hour = (timeSlot: string): string => {
  try {
    // Handle formats like "14:00 - 16:00" or "14:00"
    const times = timeSlot.split('-').map(t => t.trim());

    const convert = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    if (times.length === 2) {
      return `${convert(times[0])} - ${convert(times[1])}`;
    }
    return convert(times[0]);
  } catch (e) {
    return timeSlot; // Return original if parsing fails
  }
};
import { gamesAPI } from '../lib/api';
import { useToast } from '../lib/toastManager';

export interface GameData {
  id: string;
  hostName: string;
  hostAvatar?: string;
  turfId?: string;
  turfName: string;
  turfAddress: string;
  date: string;
  timeSlot: string;
  format: string; // e.g., "7v7", "5v5", "Cricket"
  skillLevel: 'Beginner' | 'Intermediate' | 'Advanced' | 'All levels';
  currentPlayers: number;
  maxPlayers: number;
  costPerPerson: number;
  notes?: string;
  hostPhone: string;
  distanceKm?: number;
  isUrgent?: boolean; // Game starting soon
  createdAt?: string; // When the game was created
  creatorId?: string; // ID of the user who created the game
  isTurfBooked?: boolean; // Whether the turf has been confirmed/booked by the host
  turfBookingStatus?: 'pending' | 'confirmed' | 'cancelled'; // Detailed booking status
}

interface GameCardProps {
  game: GameData;
  onJoin?: (game: GameData) => void;
  onGameClick?: (gameId: string) => void;
  onTurfClick?: (turfId: string) => void;
  user?: any;
  hideTurfDetails?: boolean; // Hide turf name/address when showing on turf detail page
}

export function GameCard({ game, onJoin, onGameClick, onTurfClick, user, hideTurfDetails = false }: GameCardProps) {
  const [requestLoading, setRequestLoading] = useState(false);
  const [hasRequestedToJoin, setHasRequestedToJoin] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [checkingRequest, setCheckingRequest] = useState(true);
  const { success, error } = useToast();
  const spotsLeft = game.maxPlayers - game.currentPlayers;
  const isAlmostFull = spotsLeft <= 2;
  const isUrgent = game.isUrgent || spotsLeft === 1;
  const isFull = spotsLeft <= 0;
  const isGameCreator = user && game.creatorId && user.id === game.creatorId;

  // Check if user has already requested to join or has joined this game
  useEffect(() => {
    async function checkUserStatus() {
      if (!user || !game.id) {
        setCheckingRequest(false);
        return;
      }

      try {
        // Check pending requests
        const requestsResponse = await gamesAPI.getMyRequests();
        if (requestsResponse.success && requestsResponse.data) {
          const hasPendingRequest = requestsResponse.data.some(
            (request: any) => request.game_id === game.id && request.status === 'pending'
          );
          setHasRequestedToJoin(hasPendingRequest);

          // If has accepted request, user has joined
          const hasAcceptedRequest = requestsResponse.data.some(
            (request: any) => request.game_id === game.id && request.status === 'accepted'
          );
          setHasJoined(hasAcceptedRequest);
        }
      } catch (err) {
        console.warn('Could not check user status:', err);
      } finally {
        setCheckingRequest(false);
      }
    }

    checkUserStatus();
  }, [user, game.id]);

  const handleJoinClick = () => {
    analytics.gameJoined(game.id, spotsLeft);
    
    // Check if hostPhone is available
    if (!game.hostPhone) {
      error('Host contact information is not available');
      return;
    }
    
    const message = generateGameInviteMessage({
      hostName: game.hostName,
      turfName: game.turfName,
      date: game.date,
      slot: game.timeSlot,
      format: game.format,
      currentPlayers: game.currentPlayers,
      maxPlayers: game.maxPlayers,
      costPerPerson: game.costPerPerson,
      skillLevel: game.skillLevel
    });

    const whatsappUrl = buildWhatsAppLink({
      phone: game.hostPhone,
      text: message
    });

    window.open(whatsappUrl, '_blank');
    onJoin?.(game);
  };

  const handleCardClick = () => {
    try {
      analytics.cardViewed('game', game.id, `${game.format} at ${game.turfName}`);
      if (onGameClick && typeof onGameClick === 'function') {
        onGameClick(game.id);
      } else {
        console.warn('GameCard: onGameClick prop not provided or not a function for game:', game.id);
        // Fallback: just log the click
        console.log('Game card clicked:', game.id);
      }
    } catch (error) {
      console.error('Error in handleCardClick:', error);
    }
  };

  const handleRequestToJoin = async () => {
    if (!user) {
      error('Please sign in to request to join games');
      return;
    }

    // Prevent game creator from joining their own game
    if (game.creatorId && user.id === game.creatorId) {
      error('You cannot send a join request to your own game!');
      return;
    }

    // Check if game is full
    if (game.currentPlayers >= game.maxPlayers) {
      error('This game is already full!');
      return;
    }

    setRequestLoading(true);
    try {
      const response = await gamesAPI.requestToJoin(game.id);
      if (response.success) {
        success('Join request sent! The host will review your request.');
        analytics.gameRequestSent(game.id);
        setHasRequestedToJoin(true);

        // Create notification for the host
        // Note: This would normally be handled server-side, but for now we do it client-side
        try {
          // We would need to get the host's user ID to send them a notification
          // For now, we'll rely on the host checking their dashboard
        } catch (notificationError) {
          console.warn('Could not send notification to host:', notificationError);
        }
      } else {
        if (response.error?.includes('already have a pending request')) {
          setHasRequestedToJoin(true);
        }
        error(response.error || 'Failed to send join request');
      }
    } catch (err) {
      error('Join request feature temporarily unavailable. Please use WhatsApp to contact the host directly.');
    } finally {
      setRequestLoading(false);
    }
  };

  const getSkillLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner': return 'bg-green-100 text-green-700 border-green-200';
      case 'Intermediate': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Advanced': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.1 }}
      className="neuro-card cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="space-y-3">
          {/* Header with host info and urgency badge */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="neuro-orb w-10 h-10 flex items-center justify-center">
                {game.hostAvatar ? (
                  <img
                    src={game.hostAvatar}
                    alt={game.hostName}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-gray-600">
                    {game.hostName?.charAt(0)?.toUpperCase() || 'H'}
                  </span>
                )}
              </div>
              <div>
                <div className="font-medium text-sm">{game.hostName || 'Host'}</div>
                <div className="text-xs text-gray-500">
                  Host {game.createdAt ? `• ${timeAgo(game.createdAt)}` : ''}
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
              {isUrgent && (
                <span className="neuro-badge">
                  {spotsLeft === 1 ? 'Last spot!' : 'Starting soon'}
                </span>
              )}
              {isAlmostFull && !isUrgent && (
                <span className="neuro-badge">
                  Almost full
                </span>
              )}
            </div>
          </div>

          {/* Game details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg text-gray-700">{game.format} Game</div>
              <div className="flex items-center gap-2">
                {/* Turf Booking Status - Always visible */}
                {game.turfBookingStatus === 'confirmed' || game.isTurfBooked ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Check className="w-3 h-3 mr-1" />
                    Turf Booked
                  </span>
                ) : game.turfBookingStatus === 'pending' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                    <Clock className="w-3 h-3 mr-1" />
                    Turf Pending
                  </span>
                ) : game.turfBookingStatus === 'cancelled' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                    Turf Cancelled
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    <Clock className="w-3 h-3 mr-1" />
                    Not Booked
                  </span>
                )}
                <span className="neuro-badge flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  {game.skillLevel}
                </span>
              </div>
            </div>

            {/* Only show turf details if not hidden */}
            {!hideTurfDetails && (
              <div className="flex items-center text-sm text-gray-600 gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <MapPin className="w-4 h-4 text-gray-600" />
                  <div className="flex-1">
                    {game.turfId && onTurfClick ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTurfClick(game.turfId!);
                        }}
                        className="font-medium text-primary-600 hover:text-primary-700 hover:underline text-left"
                      >
                        {game.turfName}
                      </button>
                    ) : (
                      <div className="font-medium">{game.turfName}</div>
                    )}
                    {game.turfId && onTurfClick ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTurfClick(game.turfId!);
                        }}
                        className="text-xs text-gray-500 hover:text-primary-600 hover:underline text-left"
                        title={`View turf: ${game.turfAddress}`}
                      >
                        {game.turfAddress.split(',')[0]}
                      </button>
                    ) : (
                      <div className="text-xs text-gray-500">
                        {game.turfAddress.split(',')[0]}
                      </div>
                    )}
                  </div>
                </div>
                {typeof game.distanceKm === 'number' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const mapsUrl = `https://maps.google.com/maps/dir//${encodeURIComponent(game.turfAddress)}`;
                      window.open(mapsUrl, '_blank');
                    }}
                    className="ml-auto text-xs text-primary-600 hover:text-primary-700 hover:underline transition-colors"
                    title="Open directions in Google Maps"
                  >
                    {game.distanceKm.toFixed(1)}km away
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatDate(game.date)} • {convertTo12Hour(game.timeSlot)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{game.currentPlayers}/{game.maxPlayers} players</span>
              </div>
            </div>
          </div>

          {/* Spots left indicator */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
              </span>
              <span className="text-sm font-semibold text-primary-600">
                {game.costPerPerson > 0 ? `₹${game.costPerPerson}/person` : 'Free'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  isAlmostFull ? 'bg-accent-500' : 'bg-primary-500'
                }`}
                style={{ width: `${(game.currentPlayers / game.maxPlayers) * 100}%` }}
              />
            </div>
          </div>

          {/* Notes */}
          {game.notes && (
            <div className="neuro-inset text-sm text-gray-600 p-2">
              <span className="font-medium">Note:</span> {game.notes}
            </div>
          )}

          {/* Action buttons - only show when user is authenticated */}
          {user ? (
            <div className="space-y-2">
              {isGameCreator ? (
                <div className="w-full p-3 neuro-surface text-center text-sm font-medium" style={{ color: '#388E3C' }}>
                  ✨ You are hosting this game
                </div>
              ) : isFull ? (
                <div className="w-full p-3 neuro-surface text-center text-sm font-medium" style={{ color: '#D84315' }}>
                  🎯 Game is Full
                </div>
              ) : checkingRequest ? (
                <Button
                  className="w-full bg-gray-400 text-white cursor-not-allowed"
                  disabled
                >
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Checking...
                </Button>
              ) : hasJoined ? (
                <div className="w-full p-3 text-center text-sm font-medium rounded-lg flex items-center justify-center gap-2" style={{ backgroundColor: '#E8F5E9', color: '#388E3C' }}>
                  <Check className="w-4 h-4" />
                  <span>You're In!</span>
                </div>
              ) : hasRequestedToJoin ? (
                <div className="w-full p-3 text-center text-sm font-medium rounded-lg flex items-center justify-center gap-2" style={{ backgroundColor: '#FFF9C4', color: '#F57F17' }}>
                  <Clock className="w-4 h-4" />
                  <span>Request Pending</span>
                </div>
              ) : (
                <Button
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRequestToJoin();
                  }}
                  disabled={requestLoading}
                >
                  {requestLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  {requestLoading ? 'Sending...' : 'Request to Join'}
                </Button>
              )}

              {!isFull && !isGameCreator && !hasJoined && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoinClick();
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Chat on WhatsApp
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full p-3 neuro-inset text-center text-sm text-gray-500">
              Sign in to join this game
            </div>
          )}
      </div>
    </motion.div>
  );
}
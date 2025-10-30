import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, Clock, Trophy, MessageCircle, UserPlus } from 'lucide-react';
import { Card, CardContent } from './ui/card';
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
import { gamesAPI } from '../lib/api';
import { useToast } from '../lib/toastManager';

export interface GameData {
  id: string;
  hostName: string;
  hostAvatar?: string;
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
}

interface GameCardProps {
  game: GameData;
  onJoin?: (game: GameData) => void;
  onGameClick?: (gameId: string) => void;
  user?: any;
}

export function GameCard({ game, onJoin, onGameClick, user }: GameCardProps) {
  const [requestLoading, setRequestLoading] = useState(false);
  const [hasRequestedToJoin, setHasRequestedToJoin] = useState(false);
  const [checkingRequest, setCheckingRequest] = useState(true);
  const { success, error } = useToast();
  const spotsLeft = game.maxPlayers - game.currentPlayers;
  const isAlmostFull = spotsLeft <= 2;
  const isUrgent = game.isUrgent || spotsLeft === 1;
  const isFull = spotsLeft <= 0;
  const isGameCreator = user && game.creatorId && user.id === game.creatorId;

  // Check if user has already requested to join this game
  useEffect(() => {
    async function checkExistingRequest() {
      if (!user || !game.id) {
        setCheckingRequest(false);
        return;
      }

      try {
        const response = await gamesAPI.getMyRequests();
        if (response.success && response.data) {
          // Check if there's a pending request for this game
          const hasPendingRequest = response.data.some(
            (request: any) => request.game_id === game.id && request.status === 'pending'
          );
          setHasRequestedToJoin(hasPendingRequest);
        }
      } catch (err) {
        console.warn('Could not check existing requests:', err);
      } finally {
        setCheckingRequest(false);
      }
    }

    checkExistingRequest();
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
    >
      <Card 
        className={`overflow-hidden hover:shadow-airbnb transition-all duration-200 cursor-pointer ${
          isUrgent ? 'border-accent-300 bg-accent-50/20' : ''
        }`}
        onClick={handleCardClick}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header with host info and urgency badge */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                {game.hostAvatar ? (
                  <img 
                    src={game.hostAvatar} 
                    alt={game.hostName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-primary-700">
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
                <Badge className="bg-accent-100 text-accent-700 border-accent-200">
                  {spotsLeft === 1 ? 'Last spot!' : 'Starting soon'}
                </Badge>
              )}
              {isAlmostFull && !isUrgent && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                  Almost full
                </Badge>
              )}
            </div>
          </div>

          {/* Game details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg">{game.format} Game</div>
              <Badge className={getSkillLevelColor(game.skillLevel)} variant="outline">
                <Trophy className="w-3 h-3 mr-1" />
                {game.skillLevel}
              </Badge>
            </div>

            <div className="flex items-center text-sm text-gray-600 gap-2">
              <button
                className="flex items-center gap-2 hover:text-primary-600 transition-colors group"
                onClick={(e) => {
                  e.stopPropagation();
                  // Create Google Maps directions URL
                  const mapsUrl = `https://maps.google.com/maps/dir//${encodeURIComponent(game.turfAddress)}`;
                  window.open(mapsUrl, '_blank');
                  track('whatsapp_cta_clicked', { action: 'google_maps', context: 'game_card', game_id: game.id });
                }}
                title="Open in Google Maps"
              >
                <MapPin className="w-4 h-4 group-hover:text-primary-600" />
                <div>
                  <div className="font-medium group-hover:underline">{game.turfName}</div>
                  <div className="text-xs text-gray-500 group-hover:text-primary-600">{game.turfAddress}</div>
                </div>
              </button>
              {typeof game.distanceKm === 'number' && (
                <div className="ml-auto text-xs text-gray-500">
                  {game.distanceKm.toFixed(1)}km away
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{game.date} • {game.timeSlot}</span>
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
                ₹{game.costPerPerson}/person
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
            <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-2">
              <span className="font-medium">Note:</span> {game.notes}
            </div>
          )}

          {/* Action buttons - only show when user is authenticated */}
          {user ? (
            <div className="space-y-2">
              {isGameCreator ? (
                <div className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center text-sm text-emerald-700 font-medium">
                  ✨ You are hosting this game
                </div>
              ) : isFull ? (
                <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-center text-sm text-red-600 font-medium">
                  🎯 Game is Full
                </div>
              ) : hasRequestedToJoin ? (
                <div className="w-full p-3 bg-orange-50 border border-orange-200 rounded-lg text-center text-sm text-orange-700 font-medium">
                  ⏳ Request Sent - Awaiting Host Response
                </div>
              ) : checkingRequest ? (
                <Button
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white"
                  disabled
                >
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Checking...
                </Button>
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

              {!isFull && !isGameCreator && (
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
            <div className="w-full p-3 bg-gray-50 rounded-lg text-center text-sm text-gray-500 border border-gray-200">
              Sign in to join this game
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
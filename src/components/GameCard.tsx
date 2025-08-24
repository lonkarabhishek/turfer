import { motion } from 'framer-motion';
import { MapPin, Users, Clock, Trophy, MessageCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { analytics, track } from '../lib/analytics';

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
}

interface GameCardProps {
  game: GameData;
  onJoin?: (game: GameData) => void;
}

export function GameCard({ game, onJoin }: GameCardProps) {
  const spotsLeft = game.maxPlayers - game.currentPlayers;
  const isAlmostFull = spotsLeft <= 2;
  const isUrgent = game.isUrgent || spotsLeft === 1;

  const handleJoinClick = () => {
    analytics.gameJoined(game.id, spotsLeft);
    
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
    analytics.cardViewed('game', game.id, `${game.format} at ${game.turfName}`);
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
                    {game.hostName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="font-medium text-sm">{game.hostName}</div>
                <div className="text-xs text-gray-500">Host</div>
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

          {/* Join button */}
          <Button
            className="w-full bg-primary-600 hover:bg-primary-700 text-white"
            onClick={(e) => {
              e.stopPropagation();
              handleJoinClick();
            }}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Join via WhatsApp
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
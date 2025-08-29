import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Check, Clock, MapPin, Users, DollarSign, MessageCircle, Share2, 
  Calendar, Trophy, Copy, ExternalLink, ArrowLeft
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { track } from '../lib/analytics';

interface GameSuccessPageProps {
  game: {
    id: string;
    format: string;
    turfName: string;
    turfAddress: string;
    date: string;
    timeSlot: string;
    maxPlayers: number;
    costPerPerson: number;
    hostName: string;
    hostPhone: string;
    notes?: string;
  };
  onClose: () => void;
}

export function GameSuccessPage({ game, onClose }: GameSuccessPageProps) {
  const [copied, setCopied] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeSlot: string) => {
    // Handle different time slot formats
    if (timeSlot.includes('-')) {
      const [start, end] = timeSlot.split('-');
      return `${start.trim()} - ${end.trim()}`;
    }
    return timeSlot;
  };

  const gameUrl = `${window.location.origin}/game/${game.id}`;

  const generateMessage = () => {
    return `🏆 JOIN MY GAME! 🏆

${game.format} at ${game.turfName}
📅 ${formatDate(game.date)}
⏰ ${formatTime(game.timeSlot)}
📍 ${game.turfAddress}
👥 ${game.maxPlayers - 1} spots available
💰 ₹${game.costPerPerson}/person

Ready to play? Join now!
${gameUrl}

Hosted by ${game.hostName}
#TapTurf #${game.format.replace(/\s+/g, '')}`;
  };

  const handleWhatsAppShare = () => {
    const message = generateMessage();
    const whatsappUrl = buildWhatsAppLink({
      text: message
    });
    window.open(whatsappUrl, '_blank');
    track('whatsapp_cta_clicked', { game_id: game.id });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track('whatsapp_cta_clicked', { game_id: game.id, type: 'copy_link' });
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleCopyMessage = async () => {
    try {
      const message = generateMessage();
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track('whatsapp_cta_clicked', { game_id: game.id, type: 'copy_message' });
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-50 via-white to-blue-50 z-50 overflow-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          className="w-full max-w-2xl"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Success Header */}
          <motion.div 
            className="text-center mb-8"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div 
              className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.3, stiffness: 200 }}
            >
              <Check className="w-12 h-12 text-green-600" />
            </motion.div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Game Created! 🎉</h1>
            <p className="text-xl text-gray-600">Your {game.format} game is ready to share</p>
          </motion.div>

          {/* Game Details Card */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="mb-8 border-2 border-green-200 shadow-lg">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">{game.format}</h2>
                  <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    Active
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">Date & Time</div>
                        <div className="text-gray-600">{formatDate(game.date)}</div>
                        <div className="text-gray-600">{formatTime(game.timeSlot)}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">{game.turfName}</div>
                        <div className="text-gray-600 text-sm">{game.turfAddress}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-semibold text-gray-900">Players</div>
                        <div className="text-gray-600">{game.maxPlayers - 1} spots available</div>
                        <div className="text-sm text-green-600 font-medium">1/{game.maxPlayers} confirmed</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-semibold text-gray-900">Cost</div>
                        <div className="text-gray-600">₹{game.costPerPerson}/person</div>
                        <div className="text-sm text-gray-500">Total: ₹{game.costPerPerson * game.maxPlayers}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {game.notes && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <div className="font-semibold text-gray-900 mb-2">Additional Notes</div>
                    <p className="text-gray-600">{game.notes}</p>
                  </div>
                )}

                {/* Game URL */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-blue-900 mb-1">Game Link</div>
                      <div className="text-blue-700 text-sm font-mono break-all">{gameUrl}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      className="ml-4 flex-shrink-0"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sharing Options */}
          <motion.div
            className="space-y-4 mb-8"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <h3 className="text-xl font-bold text-center text-gray-900 mb-6">
              Share with Friends 📢
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={handleWhatsAppShare}
                className="h-16 bg-green-600 hover:bg-green-700 text-lg font-semibold"
              >
                <MessageCircle className="w-6 h-6 mr-3" />
                Share on WhatsApp
              </Button>

              <Button
                variant="outline"
                onClick={handleCopyMessage}
                className="h-16 border-2 border-gray-300 hover:border-gray-400 text-lg font-semibold"
              >
                {copied ? <Check className="w-6 h-6 mr-3" /> : <Copy className="w-6 h-6 mr-3" />}
                Copy Message
              </Button>
            </div>

            <div className="text-center">
              <Button
                variant="ghost"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `Join my ${game.format} game!`,
                      text: generateMessage(),
                      url: gameUrl,
                    });
                  }
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                <Share2 className="w-4 h-4 mr-2" />
                More sharing options
              </Button>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            className="flex gap-4 justify-center"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Games
            </Button>
            <Button
              onClick={() => window.open(gameUrl, '_blank')}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
            >
              View Game Page
              <ExternalLink className="w-4 h-4" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
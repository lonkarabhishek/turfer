import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, Clock, MapPin, Users, DollarSign, Phone, ArrowLeft, 
  CheckCircle, Trophy, Star, MessageCircle, Share2, Copy, User
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { gamesAPI } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { buildWhatsAppLink } from '../lib/whatsapp';
import { track } from '../lib/analytics';

interface GameDetailPageProps {
  gameId: string;
  onBack: () => void;
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
  players?: Array<{
    id: string;
    name: string;
    joinedAt: string;
  }>;
}

export function GameDetailPage({ gameId, onBack }: GameDetailPageProps) {
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGameDetails();
  }, [gameId]);

  const loadGameDetails = async () => {
    try {
      const response = await gamesAPI.getGameById(gameId);
      if (response.success && response.data) {
        const gameData = response.data;
        
        // Check if game is completed (past the end time)
        const gameDateTime = new Date(`${gameData.date}T${gameData.endTime || '23:59'}`);
        const now = new Date();
        const status = now > gameDateTime ? 'completed' : 'upcoming';
        
        setGame({
          ...gameData,
          status,
          players: gameData.players || []
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
        setHasJoined(true);
        loadGameDetails(); // Refresh to get updated player count
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
💰 ₹${game.costPerPerson}/person

Ready to play? Join now!
${window.location.href}

Hosted by ${game.hostName}
#TapTurf #${game.format.replace(/\\s+/g, '')}`;

    const whatsappUrl = buildWhatsAppLink({ text: message });
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
  const isHost = user?.name === game.hostName || user?.phone === game.hostPhone;

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

              {/* Notes */}
              {game.notes && (
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Game Notes</h3>
                  <p className="text-gray-600">{game.notes}</p>
                </div>
              )}

              {/* Players List */}
              {game.players && game.players.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">Players ({game.players.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {game.players.map((player, index) => (
                      <div key={player.id} className="flex items-center gap-2 text-sm">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span>{player.name}</span>
                        {index === 0 && <span className="text-xs text-gray-500">(Host)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!isGameCompleted && (
                <div className="flex gap-4">
                  {!isHost && !hasJoined && !isFull && user && (
                    <Button 
                      onClick={handleJoinGame}
                      disabled={joining}
                      className="flex-1 bg-primary-600 hover:bg-primary-700"
                    >
                      {joining ? 'Joining...' : `Join Game - ₹${game.costPerPerson}`}
                    </Button>
                  )}
                  
                  {hasJoined && (
                    <div className="flex-1 bg-green-100 text-green-800 px-4 py-2 rounded-lg flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      You're In!
                    </div>
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
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
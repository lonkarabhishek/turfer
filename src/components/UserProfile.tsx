import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Trophy, Target, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../hooks/useAuth';
import { gamesAPI } from '../lib/api';

interface GameStats {
  totalGamesPlayed: number;
  totalGamesHosted: number;
  totalGamesJoined: number;
  upcomingGames: number;
  favoriteVenues: string[];
  favoriteSports: string[];
}

interface UserGame {
  id: string;
  sport: string;
  format: string;
  date: string;
  startTime: string;
  endTime: string;
  turfName: string;
  turfAddress: string;
  currentPlayers: number;
  maxPlayers: number;
  costPerPerson: number;
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  isHost: boolean;
  hostName: string;
}

interface UserProfileProps {
  open: boolean;
  onClose: () => void;
  onCreateGame?: () => void;
}

export function UserProfile({ open, onClose, onCreateGame }: UserProfileProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<UserGame[]>([]);
  const [pastGames, setPastGames] = useState<UserGame[]>([]);
  const [filter, setFilter] = useState<'all' | 'hosted' | 'joined'>('all');

  const loadUserProfile = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get user's hosted games
      const hostedGamesResponse = await gamesAPI.getUserGames(user.id);
      const hostedGames = hostedGamesResponse.success ? (hostedGamesResponse.data || []) : [];

      // Get user's joined games - this would need a new API endpoint
      // For now, we'll simulate this data
      const joinedGames: UserGame[] = [];

      const allGames = [...hostedGames, ...joinedGames];
      const now = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);

      // Separate upcoming and past games
      const upcoming = allGames.filter(game => new Date(game.date) >= now);
      const past = allGames.filter(game => 
        new Date(game.date) < now && new Date(game.date) >= oneMonthAgo
      );

      // Calculate stats
      const gameStats: GameStats = {
        totalGamesPlayed: past.length,
        totalGamesHosted: past.filter(g => g.isHost).length,
        totalGamesJoined: past.filter(g => !g.isHost).length,
        upcomingGames: upcoming.length,
        favoriteVenues: [...new Set(past.map(g => g.turfName))].slice(0, 3),
        favoriteSports: [...new Set(past.map(g => g.sport))].slice(0, 3)
      };

      setStats(gameStats);
      setUpcomingGames(upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setPastGames(past.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      loadUserProfile();
    }
  }, [open, user, loadUserProfile]);

  if (!open) return null;

  const filteredUpcomingGames = upcomingGames.filter(game => {
    if (filter === 'hosted') return game.isHost;
    if (filter === 'joined') return !game.isHost;
    return true;
  });

  const filteredPastGames = pastGames.filter(game => {
    if (filter === 'hosted') return game.isHost;
    if (filter === 'joined') return !game.isHost;
    return true;
  });

  const getNextGame = () => {
    return upcomingGames.length > 0 ? upcomingGames[0] : null;
  };

  const formatGameTime = (date: string, startTime: string, endTime: string) => {
    const gameDate = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let dateStr = '';
    if (gameDate.toDateString() === today.toDateString()) {
      dateStr = 'Today';
    } else if (gameDate.toDateString() === tomorrow.toDateString()) {
      dateStr = 'Tomorrow';
    } else {
      dateStr = gameDate.toLocaleDateString('en-IN', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }

    return `${dateStr} • ${startTime}-${endTime}`;
  };

  return (
    <motion.div 
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{user?.name}'s Profile</h2>
              <p className="text-primary-200 mt-1">{user?.email}</p>
              {user?.phone && (
                <p className="text-primary-200 text-sm">{user.phone}</p>
              )}
            </div>
            <Button variant="ghost" onClick={onClose} className="text-white hover:bg-primary-800">
              ×
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Game Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Trophy className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{stats?.totalGamesPlayed || 0}</div>
                    <div className="text-sm text-gray-600">Games Played</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <Target className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{stats?.totalGamesHosted || 0}</div>
                    <div className="text-sm text-gray-600">Games Hosted</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{stats?.totalGamesJoined || 0}</div>
                    <div className="text-sm text-gray-600">Games Joined</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <Calendar className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{stats?.upcomingGames || 0}</div>
                    <div className="text-sm text-gray-600">Upcoming</div>
                  </CardContent>
                </Card>
              </div>

              {/* Next Game Highlight */}
              {getNextGame() && (
                <Card className="bg-primary-50 border-primary-200">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary-600" />
                      Your Next Game
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <div className="font-semibold text-primary-900">
                          {getNextGame()?.format}
                        </div>
                        <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {getNextGame()?.turfName}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {getNextGame() && formatGameTime(
                            getNextGame()!.date, 
                            getNextGame()!.startTime, 
                            getNextGame()!.endTime
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge variant={getNextGame()?.isHost ? 'default' : 'secondary'}>
                            {getNextGame()?.isHost ? 'Hosting' : 'Playing'}
                          </Badge>
                          <div className="text-sm text-gray-600 mt-1">
                            {getNextGame()?.currentPlayers}/{getNextGame()?.maxPlayers} players
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">₹{getNextGame()?.costPerPerson}</div>
                          <div className="text-xs text-gray-500">per person</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Games Filter */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Games</h3>
                <div className="flex gap-2">
                  <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    variant={filter === 'hosted' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('hosted')}
                  >
                    Hosted
                  </Button>
                  <Button
                    variant={filter === 'joined' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilter('joined')}
                  >
                    Joined
                  </Button>
                </div>
              </div>

              {/* Upcoming Games */}
              {filteredUpcomingGames.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Upcoming Games</h4>
                  <div className="space-y-3">
                    {filteredUpcomingGames.map((game) => (
                      <Card key={game.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{game.format}</div>
                              <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {game.turfName}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {formatGameTime(game.date, game.startTime, game.endTime)}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant={game.isHost ? 'default' : 'secondary'}>
                                  {game.isHost ? 'Hosting' : 'Playing'}
                                </Badge>
                                <Badge variant={game.status === 'open' ? 'outline' : 'secondary'}>
                                  {game.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">₹{game.costPerPerson}</div>
                              <div className="text-xs text-gray-500">per person</div>
                              <div className="text-sm text-gray-600 mt-1">
                                {game.currentPlayers}/{game.maxPlayers} players
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Past Games */}
              {filteredPastGames.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Recent Games (Past Month)</h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {filteredPastGames.map((game) => (
                      <Card key={game.id} className="opacity-75">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{game.format}</div>
                              <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {game.turfName}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {formatGameTime(game.date, game.startTime, game.endTime)}
                              </div>
                              <Badge 
                                variant={game.isHost ? 'default' : 'secondary'}
                                className="mt-2"
                              >
                                {game.isHost ? 'Hosted' : 'Played'}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">₹{game.costPerPerson}</div>
                              <div className="text-xs text-gray-500">per person</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {filteredUpcomingGames.length === 0 && filteredPastGames.length === 0 && (
                <Card className="text-center py-12">
                  <CardContent>
                    <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">
                      No games found
                    </h3>
                    <p className="text-gray-500 mb-4">
                      {filter === 'all' 
                        ? "You haven't joined or hosted any games yet."
                        : `You haven't ${filter} any games yet.`
                      }
                    </p>
                    <Button onClick={onCreateGame} className="bg-primary-600 hover:bg-primary-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Game
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
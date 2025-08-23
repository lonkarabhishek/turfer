import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users, Trophy, Target, Plus, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  user: any;
  onBack: () => void;
  onCreateGame?: () => void;
}

export function UserProfile({ user, onBack, onCreateGame }: UserProfileProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<UserGame[]>([]);
  const [pastGames, setPastGames] = useState<UserGame[]>([]);
  const [filter, setFilter] = useState<'all' | 'hosted' | 'joined'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const loadUserProfile = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get user's hosted games
      const hostedGamesResponse = await gamesAPI.getMyGames();
      const hostedGamesData = hostedGamesResponse.success ? (hostedGamesResponse.data || []) : [];

      // Get user's joined games
      const joinedGamesResponse = await gamesAPI.getJoinedGames();
      const joinedGamesData = joinedGamesResponse.success ? (joinedGamesResponse.data || []) : [];

      // Transform hosted games
      const hostedGames: UserGame[] = hostedGamesData.map((game: any) => ({
        id: game.id,
        sport: game.sport,
        format: game.format,
        date: game.date,
        startTime: game.startTime,
        endTime: game.endTime,
        turfName: game.turf_name || 'Unknown Turf',
        turfAddress: game.turf_address || 'Unknown Address',
        currentPlayers: game.currentPlayers,
        maxPlayers: game.maxPlayers,
        costPerPerson: game.costPerPerson,
        status: game.status,
        isHost: true,
        hostName: user.name
      }));

      // Transform joined games
      const joinedGames: UserGame[] = joinedGamesData.map((game: any) => ({
        id: game.id,
        sport: game.sport,
        format: game.format,
        date: game.date,
        startTime: game.startTime,
        endTime: game.endTime,
        turfName: game.turf_name || 'Unknown Turf',
        turfAddress: game.turf_address || 'Unknown Address',
        currentPlayers: game.currentPlayers,
        maxPlayers: game.maxPlayers,
        costPerPerson: game.costPerPerson,
        status: game.status,
        isHost: false,
        hostName: game.host_name || 'Unknown Host'
      }));

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
    if (user) {
      loadUserProfile();
    }
  }, [user, loadUserProfile]);


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

  const renderCalendarView = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Get first day of the month and number of days
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();
    
    // Generate calendar grid
    const weeks = [];
    let currentWeek = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayWeekday; i++) {
      currentWeek.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    // Add remaining days to complete the last week
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    if (currentWeek.some(day => day !== null)) {
      weeks.push(currentWeek);
    }
    
    // Get games for the current month
    const monthlyGames = filteredUpcomingGames.filter(game => {
      const gameDate = new Date(game.date);
      return gameDate.getMonth() === currentMonth && gameDate.getFullYear() === currentYear;
    });
    
    // Group games by date
    const gamesByDate: { [key: string]: UserGame[] } = {};
    monthlyGames.forEach(game => {
      const gameDate = new Date(game.date);
      const dateKey = gameDate.getDate().toString();
      if (!gamesByDate[dateKey]) {
        gamesByDate[dateKey] = [];
      }
      gamesByDate[dateKey].push(game);
    });
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-center">
            {monthNames[currentMonth]} {currentYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {dayNames.map(day => (
              <div key={day} className="p-3 text-center font-medium text-gray-600 bg-gray-50 border-r last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day, dayIndex) => (
                <div 
                  key={dayIndex} 
                  className="p-2 border-r last:border-r-0 min-h-[100px] bg-white"
                >
                  {day && (
                    <>
                      <div className={`text-sm font-medium mb-2 ${
                        day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
                          ? 'text-primary-600' 
                          : 'text-gray-900'
                      }`}>
                        {day}
                      </div>
                      
                      {gamesByDate[day.toString()]?.map((game, gameIndex) => (
                        <div
                          key={gameIndex}
                          className={`text-xs p-1 mb-1 rounded-sm truncate ${
                            game.isHost 
                              ? 'bg-primary-100 text-primary-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}
                          title={`${game.format} at ${game.turfName} (${game.startTime})`}
                        >
                          {game.startTime} {game.format}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <motion.div 
        className="bg-white shadow-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-emerald-500 p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-600/20 to-transparent" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{user?.name}</h2>
                <p className="text-primary-200 mt-1">{user?.email}</p>
                {user?.phone && (
                  <p className="text-primary-200 text-sm">{user.phone}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-white/20 text-white hover:bg-white/30">
                    {user?.role === 'owner' ? 'Turf Owner' : 'Player'}
                  </Badge>
                  <Badge className="bg-white/20 text-white hover:bg-white/30">
                    Member since {new Date(user?.createdAt || new Date()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </Badge>
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={onBack} className="text-white hover:bg-white/20 backdrop-blur-sm">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Game Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-primary-500">
                    <CardContent className="p-4 text-center">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Trophy className="w-6 h-6 text-primary-600" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.totalGamesPlayed || 0}</div>
                      <div className="text-sm text-gray-600">Games Played</div>
                    </CardContent>
                  </Card>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-emerald-500">
                    <CardContent className="p-4 text-center">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Target className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.totalGamesHosted || 0}</div>
                      <div className="text-sm text-gray-600">Games Hosted</div>
                    </CardContent>
                  </Card>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500">
                    <CardContent className="p-4 text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Users className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.totalGamesJoined || 0}</div>
                      <div className="text-sm text-gray-600">Games Joined</div>
                    </CardContent>
                  </Card>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-orange-500">
                    <CardContent className="p-4 text-center">
                      <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Calendar className="w-6 h-6 text-orange-600" />
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.upcomingGames || 0}</div>
                      <div className="text-sm text-gray-600">Upcoming</div>
                    </CardContent>
                  </Card>
                </motion.div>
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
                        <button
                          className="text-sm text-gray-600 flex items-center gap-1 mt-1 hover:text-primary-600 transition-colors group"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextGame = getNextGame();
                            if (nextGame?.turfAddress) {
                              const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(nextGame.turfAddress)}`;
                              window.open(mapsUrl, '_blank');
                            }
                          }}
                          title="Open in Google Maps"
                        >
                          <MapPin className="w-3 h-3 group-hover:text-primary-600" />
                          <div className="text-left">
                            <div className="group-hover:underline">{getNextGame()?.turfName}</div>
                            {getNextGame()?.turfAddress && (
                              <div className="text-xs text-gray-500 group-hover:text-primary-600">
                                {getNextGame()?.turfAddress}
                              </div>
                            )}
                          </div>
                        </button>
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

              {/* Games Filter & View Toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your Games</h3>
                <div className="flex gap-2">
                  <div className="flex gap-1 border rounded-md p-1">
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="h-8 px-3"
                    >
                      List
                    </Button>
                    <Button
                      variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="h-8 px-3"
                    >
                      <Calendar className="w-4 h-4 mr-1" />
                      Calendar
                    </Button>
                  </div>
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
              </div>

              {/* Calendar/List View */}
              {viewMode === 'calendar' ? (
                renderCalendarView()
              ) : (
                <>
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
                                  <button
                                    className="text-sm text-gray-600 flex items-center gap-1 mt-1 hover:text-primary-600 transition-colors group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (game.turfAddress) {
                                        const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(game.turfAddress)}`;
                                        window.open(mapsUrl, '_blank');
                                      }
                                    }}
                                    title="Open in Google Maps"
                                  >
                                    <MapPin className="w-3 h-3 group-hover:text-primary-600" />
                                    <div className="text-left">
                                      <div className="group-hover:underline">{game.turfName}</div>
                                      <div className="text-xs text-gray-500 group-hover:text-primary-600">
                                        {game.turfAddress}
                                      </div>
                                    </div>
                                  </button>
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
                  {filteredPastGames.length > 0 && viewMode === 'list' && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Recent Games (Past Month)</h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {filteredPastGames.map((game) => (
                          <Card key={game.id} className="opacity-75">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-medium">{game.format}</div>
                                  <button
                                    className="text-sm text-gray-600 flex items-center gap-1 mt-1 hover:text-primary-600 transition-colors group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (game.turfAddress) {
                                        const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(game.turfAddress)}`;
                                        window.open(mapsUrl, '_blank');
                                      }
                                    }}
                                    title="Open in Google Maps"
                                  >
                                    <MapPin className="w-3 h-3 group-hover:text-primary-600" />
                                    <div className="text-left">
                                      <div className="group-hover:underline">{game.turfName}</div>
                                      <div className="text-xs text-gray-500 group-hover:text-primary-600">
                                        {game.turfAddress}
                                      </div>
                                    </div>
                                  </button>
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
                </>
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
    </div>
  );
}
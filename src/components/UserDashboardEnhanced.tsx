import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Clock, MapPin, Star, Users, Trophy, 
  Bell, Settings, CreditCard, Heart, LogOut,
  GamepadIcon, Building, History, User, User as UserIcon,
  Phone, Mail, Edit3, ChevronRight, Plus, Check, X, Search, MessageCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ProfilePhotoUpload } from './ProfilePhotoUpload';
import { MyGameRequests } from './MyGameRequests';
import { ManualBookingUpload } from './ManualBookingUpload';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../lib/toastManager';
import { gamesAPI, bookingsAPI, authManager } from '../lib/api';
import { userHelpers, gameRequestHelpers } from '../lib/supabase';
import { filterNonExpiredGames, isGameExpired } from '../lib/gameUtils';

// Utility function to format time to 12-hour format for Indian users
const formatTo12Hour = (time24: string): string => {
  if (!time24) return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  
  return `${hour12}:${minutes} ${ampm}`;
};

interface UserDashboardEnhancedProps {
  onNavigate: (page: string) => void;
  onCreateGame: () => void;
  initialTab?: string;
  onGameNavigation?: (gameId: string) => void;
}

interface GameData {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string;
  timeSlot?: string;
  turfName: string;
  turfAddress: string;
  players: string;
  status: 'upcoming' | 'live' | 'completed';
}

interface BookingData {
  id: string;
  turfName: string;
  turfAddress: string;
  date: string;
  time: string;
  duration: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  amount: number;
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: UserIcon },
  { id: 'games', label: 'Games', icon: GamepadIcon },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'profile', label: 'Profile', icon: Settings },
];

export function UserDashboardEnhanced({ onNavigate, onCreateGame, initialTab = 'overview', onGameNavigation }: UserDashboardEnhancedProps) {
  const { user, refreshAuth } = useAuth();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [userGames, setUserGames] = useState<GameData[]>([]);
  const [userBookings, setUserBookings] = useState<BookingData[]>([]);
  const [gameRequests, setGameRequests] = useState<any[]>([]);
  const [joinedGames, setJoinedGames] = useState<GameData[]>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user?.profile_image_url || '');
  const [gamesTab, setGamesTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [showManualBookingUpload, setShowManualBookingUpload] = useState(false);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      // Use profile photo from Supabase Auth user instead of database query
      const profilePhotoUrl = user!.profile_image_url || 
                              user!.user_metadata?.profile_image_url || 
                              user!.user_metadata?.avatar_url || 
                              '';
      setProfilePhotoUrl(profilePhotoUrl);

      // Load game requests for games I host
      await loadGameRequests();

      // Load real games hosted by the user
      try {
        const hostedGamesResponse = await gamesAPI.getUserGames(user.id);
        if (hostedGamesResponse.success && hostedGamesResponse.data) {
          const transformedHostedGames = hostedGamesResponse.data.map((gameData: any) => {
            const startTime12 = formatTo12Hour(gameData.start_time || '00:00');
            const endTime12 = formatTo12Hour(gameData.end_time || '00:00');

            return {
              id: gameData.id,
              title: `${gameData.sport || gameData.format || 'Game'}`,
              sport: gameData.sport || gameData.format || 'Game',
              date: gameData.date,
              time: `${startTime12} - ${endTime12}`,
              timeSlot: `${gameData.start_time || '00:00'}-${gameData.end_time || '23:59'}`,
              turfName: gameData.turfs?.name || gameData.turf_name || 'Unknown Turf',
              turfAddress: gameData.turfs?.address || gameData.turf_address || 'Unknown Address',
              players: `${gameData.current_players || 1}/${gameData.max_players || 10}`,
              status: isGameExpired(gameData) ? 'completed' as const : 'upcoming' as const
            };
          });
          setUserGames(transformedHostedGames);
        } else {
          setUserGames([]);
        }
      } catch (error) {
        console.error('Error loading hosted games:', error);
        setUserGames([]);
      }

      // Load games the user has joined (accepted requests)
      try {
        // This would require a new API endpoint to get games user has joined
        // For now, using empty array
        setJoinedGames([]);
      } catch (error) {
        console.error('Error loading joined games:', error);
        setJoinedGames([]);
      }

      // Load user bookings from API
      try {
        console.log('📋 Loading user bookings...');
        const bookingsResponse = await bookingsAPI.getUserBookings(user.id);
        
        if (bookingsResponse.success && bookingsResponse.data) {
          console.log('✅ User bookings loaded:', bookingsResponse.data);
          setUserBookings(bookingsResponse.data);
        } else {
          console.log('📭 No bookings found for user');
          setUserBookings([]);
        }
      } catch (bookingError) {
        console.error('❌ Error loading bookings:', bookingError);
        setUserBookings([]);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGameRequests = async () => {
    if (!user) return;

    try {
      console.log('🔍 Loading game requests for user:', user.id);
      
      // Get all requests for games I host
      const myGames = await gamesAPI.getUserGames(user.id);
      console.log('🎮 My hosted games:', myGames);
      
      if (myGames.success && myGames.data) {
        const allRequests = [];
        
        for (const game of myGames.data) {
          console.log('🔍 Getting requests for game:', game.id);
          const requests = await gameRequestHelpers.getGameRequests(game.id);
          console.log('📋 Requests for game', game.id, ':', requests);
          
          if (requests.data && requests.data.length > 0) {
            // Add game info to each request
            const requestsWithGameInfo = requests.data.map((request: any) => ({
              ...request,
              game: {
                id: game.id,
                sport: game.sport || game.format,
                date: game.date,
                time: `${game.start_time || '00:00'} - ${game.end_time || '00:00'}`,
                turfName: game.turfs?.name || game.turf_name || 'Unknown Turf',
                turfAddress: game.turfs?.address || game.turf_address || 'Unknown Address'
              }
            }));
            allRequests.push(...requestsWithGameInfo);
            console.log('➕ Added requests for game:', game.id, requestsWithGameInfo);
          }
        }
        
        console.log('📊 Total game requests found:', allRequests.length, allRequests);
        setGameRequests(allRequests);
      } else {
        console.log('⚠️ No hosted games found for user');
        setGameRequests([]);
      }
    } catch (error) {
      console.error('❌ Error loading game requests:', error);
      setGameRequests([]);
    }
  };

  const handleAcceptRequest = async (requestId: string, gameId: string, userId: string) => {
    // Prevent duplicate processing
    if (processingRequests.has(requestId)) {
      console.log('⚠️ Request already being processed:', requestId);
      return;
    }

    try {
      // Mark request as processing
      setProcessingRequests(prev => new Set(prev).add(requestId));

      console.log('🎯 UserDashboard: Accepting request:', { requestId, gameId, userId });
      console.log('🔍 UserDashboard: Available requests:', gameRequests);

      // Accept the request with correct parameters
      const response = await gameRequestHelpers.acceptGameRequest(requestId);
      console.log('📡 UserDashboard: Accept response:', response);

      if (response.success) {
        // Refresh the requests list
        await loadGameRequests();
        success('Request accepted! Player has been notified.');
        console.log('✅ UserDashboard: Request accepted successfully');
      } else {
        console.error('❌ UserDashboard: Accept failed:', response.error);
        error(response.error || 'Failed to accept request');
      }
    } catch (error: any) {
      console.error('❌ UserDashboard: Error accepting request:', error);
      error('Failed to accept request: ' + (error?.message || 'Unknown error'));
    } finally {
      // Remove from processing set
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      console.log('🛑 UserDashboard: Rejecting request:', requestId);
      console.log('🔍 UserDashboard: Available requests:', gameRequests);
      
      // Find the request to get the game ID
      const request = gameRequests.find(req => req.id === requestId);
      const gameId = request?.game?.id || 'unknown-game-id';
      
      const response = await gameRequestHelpers.rejectGameRequest(requestId);
      console.log('📡 UserDashboard: Reject response:', response);
      
      if (response.success) {
        // Refresh the requests list
        await loadGameRequests();
        success('Request rejected.');
        console.log('✅ UserDashboard: Request rejected successfully');
      } else {
        console.error('❌ UserDashboard: Reject failed:', response.error);
        error(response.error || 'Failed to reject request');
      }
    } catch (error: any) {
      console.error('❌ UserDashboard: Error rejecting request:', error);
      error('Failed to reject request: ' + (error?.message || 'Unknown error'));
    }
  };

  const handlePhotoUpdated = async (newPhotoUrl: string) => {
    setProfilePhotoUrl(newPhotoUrl);
    // Refresh auth to update user profile in all components
    await refreshAuth();
  };

  const isGameCompleted = (game: GameData) => {
    const gameDate = new Date(`${game.date}T${game.time}`);
    return gameDate < new Date() || game.status === 'completed';
  };

  const upcomingGames = userGames.filter(game => !isGameCompleted(game));
  const completedGames = userGames.filter(game => isGameCompleted(game));

  const renderPendingBookingsAlert = () => {
    const pendingBookings = userBookings.filter(b => b.status === 'pending');

    if (pendingBookings.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <Card className="border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center animate-pulse">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {pendingBookings.length} Booking{pendingBookings.length !== 1 ? 's' : ''} Pending Approval
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Waiting for turf owner approval. You'll be notified once they respond.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('bookings')}
                  className="border-orange-200 text-orange-700 hover:bg-orange-100"
                >
                  View Details
                </Button>
              </div>
            </div>

            {pendingBookings.length > 0 && (
              <div className="mt-4 grid gap-3">
                {pendingBookings.slice(0, 2).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between bg-white/70 rounded-lg p-3 border border-orange-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{booking.turfName}</p>
                        <p className="text-xs text-gray-600">{formatDate(booking.date)} • {booking.time}</p>
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                      Pending
                    </Badge>
                  </div>
                ))}
                {pendingBookings.length > 2 && (
                  <div className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab('bookings')}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 text-xs"
                    >
                      View {pendingBookings.length - 2} more pending booking{pendingBookings.length - 2 !== 1 ? 's' : ''}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-8 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name}! 👋</h1>
              <p className="text-emerald-100 text-lg">Ready for your next game?</p>
            </div>
            <ProfilePhotoUpload
              currentPhotoUrl={profilePhotoUrl}
              onPhotoUpdated={handlePhotoUpdated}
              size="md"
            />
          </div>
        </div>
      </motion.div>

      {/* Pending Bookings Alert */}
      {renderPendingBookingsAlert()}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Card 
            className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer hover:shadow-xl hover:shadow-blue-500/25 transition-all duration-300 group"
            onClick={() => setActiveTab('games')}
          >
            <CardContent className="p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-blue-600/20 rounded-2xl blur-xl group-hover:blur-sm transition-all duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:shadow-blue-500/50 transition-all duration-300">
                  <GamepadIcon className="w-7 h-7 text-white" />
                </div>
                <div className="text-3xl font-bold text-blue-900 mb-1">{userGames.length}</div>
                <div className="text-sm text-blue-600 font-medium">Games Hosted</div>
                <div className="mt-2 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Click to view →</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Card 
            className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-green-50 to-green-100 cursor-pointer hover:shadow-xl hover:shadow-green-500/25 transition-all duration-300 group"
            onClick={() => setActiveTab('games')}
          >
            <CardContent className="p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-400/20 to-green-600/20 rounded-2xl blur-xl group-hover:blur-sm transition-all duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-green-600 to-green-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:shadow-green-500/50 transition-all duration-300">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <div className="text-3xl font-bold text-green-900 mb-1">{completedGames.length}</div>
                <div className="text-sm text-green-600 font-medium">Games Played</div>
                <div className="mt-2 text-xs text-green-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Click to view →</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Card 
            className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 cursor-pointer hover:shadow-xl hover:shadow-purple-500/25 transition-all duration-300 group"
            onClick={() => setActiveTab('overview')}
          >
            <CardContent className="p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-purple-600/20 rounded-2xl blur-xl group-hover:blur-sm transition-all duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-purple-600 to-purple-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:shadow-purple-500/50 transition-all duration-300">
                  <Bell className="w-7 h-7 text-white" />
                  {gameRequests.length > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-xs text-white font-bold">{gameRequests.length}</span>
                    </div>
                  )}
                </div>
                <div className="text-3xl font-bold text-purple-900 mb-1">{gameRequests.length}</div>
                <div className="text-sm text-purple-600 font-medium">Join Requests</div>
                <div className="mt-2 text-xs text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Click to manage →</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Card
            className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 cursor-pointer hover:shadow-xl hover:shadow-orange-500/25 transition-all duration-300 group"
            onClick={() => setActiveTab('bookings')}
          >
            <CardContent className="p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400/20 to-orange-600/20 rounded-2xl blur-xl group-hover:blur-sm transition-all duration-300"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-r from-orange-600 to-orange-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:shadow-orange-500/50 transition-all duration-300">
                  <Calendar className="w-7 h-7 text-white" />
                </div>
                <div className="text-3xl font-bold text-orange-900 mb-1">{userBookings.length}</div>
                <div className="text-sm text-orange-600 font-medium">Total Bookings</div>
                <div className="mt-2 text-xs text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">Click to view →</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-0 shadow-lg rounded-3xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              <Button
                onClick={onCreateGame}
                className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-xl p-4 h-auto flex flex-col items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-300"
              >
                <GamepadIcon className="w-6 h-6" />
                <span className="text-sm font-semibold">Create Game</span>
              </Button>
              
              <Button
                onClick={() => onNavigate('turfs')}
                variant="outline"
                className="rounded-xl p-4 h-auto flex flex-col items-center gap-2 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
              >
                <Building className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold text-blue-600">Find Turf</span>
              </Button>
              
              <Button
                onClick={() => onNavigate('games')}
                variant="outline"
                className="rounded-xl p-4 h-auto flex flex-col items-center gap-2 border-2 border-green-200 hover:border-green-400 hover:bg-green-50 hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
              >
                <Search className="w-6 h-6 text-green-600" />
                <span className="text-sm font-semibold text-green-600">Find Games</span>
              </Button>
              
              <Button
                onClick={() => setActiveTab('bookings')}
                variant="outline"
                className="rounded-xl p-4 h-auto flex flex-col items-center gap-2 border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
              >
                <Calendar className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-semibold text-purple-600">My Bookings</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity Preview */}
      {upcomingGames.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="border-0 shadow-lg rounded-3xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Next Game</CardTitle>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab('games')}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-2xl p-6 border border-emerald-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-emerald-900 mb-2">
                      {upcomingGames[0].title}
                    </h3>
                    <div className="space-y-2 text-emerald-700">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(upcomingGames[0].date)} • {upcomingGames[0].time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{upcomingGames[0].turfName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{upcomingGames[0].players} players</span>
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-emerald-200 text-emerald-800 border-emerald-300">
                    {upcomingGames[0].sport}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Incoming Game Requests Section */}
      {gameRequests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="border-0 shadow-lg rounded-3xl">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Bell className="w-6 h-6 text-purple-600" />
                Join Requests for Your Games
                <Badge className="bg-purple-100 text-purple-700">
                  {gameRequests.length} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AnimatePresence>
                {gameRequests.map((request, index) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => request.game_id && onGameNavigation?.(request.game_id)}
                    className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 cursor-pointer hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-purple-900">
                              {request.users?.name || request.requester_name || request.user?.name || request.user_name || `User ${request.user_id?.slice(0, 8)}`} wants to join
                            </h3>
                            <p className="text-purple-700 font-medium">
                              {request.game?.sport || 'Game'} at {request.game?.turfName || 'Unknown Turf'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm">
                          <div className="flex items-center gap-2 text-purple-700">
                            <Calendar className="w-4 h-4" />
                            <span>{request.game?.date ? formatDate(request.game.date) : 'Unknown date'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-purple-700">
                            <Clock className="w-4 h-4" />
                            <span>{request.game?.time || 'Unknown time'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-purple-700">
                            <MapPin className="w-4 h-4" />
                            <span>{request.game?.turfName || 'Unknown venue'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-purple-700">
                            <Users className="w-4 h-4" />
                            <span>{request.game?.players || '1/10'} players</span>
                          </div>
                        </div>
                        
                        {request.message && (
                          <div className="bg-white/50 rounded-lg p-3 mb-4 border border-purple-200">
                            <div className="flex items-start gap-2">
                              <MessageCircle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-purple-800 italic">"{request.message}"</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
                          <Button
                            onClick={() => handleAcceptRequest(request.id, request.game_id, request.user_id)}
                            disabled={processingRequests.has(request.id)}
                            className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            {processingRequests.has(request.id) ? 'Processing...' : 'Accept'}
                          </Button>
                          <Button
                            onClick={() => handleRejectRequest(request.id)}
                            disabled={processingRequests.has(request.id)}
                            variant="outline"
                            className="border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* My Game Requests Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
      >
        <MyGameRequests />
      </motion.div>
    </div>
  );

  const renderGames = () => {
    const currentGames = gamesTab === 'upcoming' ? upcomingGames : completedGames;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">My Games</h2>
          <Button 
            onClick={onCreateGame}
            className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Game
          </Button>
        </div>
        
        {/* Enhanced Games Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
          <button 
            onClick={() => setGamesTab('upcoming')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
              gamesTab === 'upcoming' 
                ? 'bg-white shadow-lg text-emerald-600 scale-105' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Upcoming ({upcomingGames.length})
          </button>
          <button 
            onClick={() => setGamesTab('completed')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
              gamesTab === 'completed' 
                ? 'bg-white shadow-lg text-emerald-600 scale-105' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Completed ({completedGames.length})
          </button>
        </div>
        
        <div className="space-y-4">
          {currentGames.map((game, index) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-lg rounded-3xl hover:shadow-xl transition-all duration-300 group cursor-pointer"
                    onClick={() => onGameNavigation?.(game.id)}>
                <CardContent className="p-8">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg">
                          <GamepadIcon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">{game.title}</h3>
                          <Badge className="bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300 mt-2">
                            {game.sport}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-6 text-gray-600">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Date</p>
                            <p className="font-semibold text-gray-900">{formatDate(game.date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <Clock className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Time</p>
                            <p className="font-semibold text-gray-900">{game.time}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Venue</p>
                            <p className="font-semibold text-gray-900">{game.turfName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Players</p>
                            <p className="font-semibold text-gray-900">{game.players}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-sm text-emerald-600 font-medium">
                        Click to view details →
                      </div>
                      <Badge className={`${
                        gamesTab === 'upcoming' 
                          ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border-green-300'
                          : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-600 border-gray-300'
                      }`}>
                        {gamesTab === 'upcoming' ? 'Upcoming' : 'Completed'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          
          {currentGames.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="w-24 h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-6">
                <GamepadIcon className="w-12 h-12 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-600 mb-2">
                {gamesTab === 'upcoming' ? 'No upcoming games' : 'No completed games yet'}
              </p>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                {gamesTab === 'upcoming' 
                  ? 'Create or join a game to get started on your sports journey!' 
                  : 'Complete some games and they\'ll show up here.'}
              </p>
              {gamesTab === 'upcoming' && (
                <Button 
                  onClick={onCreateGame} 
                  className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-2xl px-8 py-4 text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Your First Game
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    );
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Date not set';

    const date = new Date(dateString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original string if invalid
    }

    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);

    // Add ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return `${getOrdinal(day)} ${month} ${year}`;
  };

  const renderBookings = () => {
    // Combine regular bookings and demo bookings
    const allBookings = [];

    // Add regular bookings
    userBookings.forEach(booking => {
      allBookings.push({
        id: booking.id,
        turfName: booking.turfName,
        turfAddress: booking.turfAddress,
        date: booking.date,
        time: booking.time,
        duration: booking.duration,
        status: booking.status,
        amount: booking.amount,
        type: 'regular'
      });
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">My Bookings</h2>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowManualBookingUpload(true)}
              variant="outline"
              className="rounded-full border-2 border-green-600 text-green-600 hover:bg-green-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Booking
            </Button>
            <Button
              onClick={() => onNavigate('turfs')}
              className="bg-blue-600 hover:bg-blue-700 rounded-full"
            >
              Browse Turfs
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {allBookings.map((booking) => (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-0 shadow-lg rounded-2xl hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold">{booking.turfName}</h3>
                        <Badge
                          className={`${
                            booking.status === 'confirmed'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : booking.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                              : 'bg-red-100 text-red-700 border-red-200'
                          }`}
                        >
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-gray-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(booking.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{booking.time}</span>
                          {booking.duration && <span className="text-gray-400">• {booking.duration}</span>}
                        </div>
                        <div className="flex items-center gap-2 col-span-2">
                          <MapPin className="w-4 h-4" />
                          <span>{booking.turfAddress}</span>
                        </div>
                      </div>

                      {booking.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">Note:</span> {booking.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900 mb-2">
                        ₹{booking.amount.toLocaleString()}
                      </div>
                      <Button variant="outline" size="sm" className="rounded-full">
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {allBookings.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No bookings yet</p>
              <p className="mb-4">Book a turf to see your reservations here!</p>
              <Button onClick={() => onNavigate('turfs')} className="bg-blue-600 hover:bg-blue-700 rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                Book Your First Turf
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Profile Settings</h2>
      </div>

      {/* Profile Photo Section */}
      <Card className="border-0 shadow-lg rounded-3xl">
        <CardHeader>
          <CardTitle className="text-xl">Profile Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            <ProfilePhotoUpload
              currentPhotoUrl={profilePhotoUrl}
              onPhotoUpdated={handlePhotoUpdated}
              size="lg"
            />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">Upload your photo</h3>
              <p className="text-gray-600 mb-4">
                A great profile photo helps other players recognize you during games.
              </p>
              <div className="text-sm text-gray-500">
                <p>• JPG, PNG or WebP format</p>
                <p>• Maximum file size: 5MB</p>
                <p>• Square images work best</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="border-0 shadow-lg rounded-3xl">
        <CardHeader>
          <CardTitle className="text-xl">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Full Name
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <UserIcon className="w-5 h-5 text-gray-400" />
                <span className="flex-1">{user?.name}</span>
                <Button variant="ghost" size="sm">
                  <Edit3 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Email Address
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="flex-1">{user?.email}</span>
                <Button variant="ghost" size="sm">
                  <Edit3 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Phone Number
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Phone className="w-5 h-5 text-gray-400" />
                <span className="flex-1">{user?.phone || 'Not provided'}</span>
                <Button variant="ghost" size="sm">
                  <Edit3 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Account Type
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 capitalize">
                  {user?.role} Account
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
            <Button
              onClick={() => onNavigate('home')}
              variant="outline" 
              className="rounded-full text-sm sm:text-base"
            >
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Home</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Mobile Navigation */}
          <div className="lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-4">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'text-gray-600 bg-white hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop Sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl transition-all duration-200 ${
                        activeTab === tab.id
                          ? 'bg-emerald-600 text-white shadow-lg'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'games' && renderGames()}
                {activeTab === 'bookings' && renderBookings()}
                {activeTab === 'profile' && renderProfile()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Manual Booking Upload Modal */}
      <ManualBookingUpload
        isOpen={showManualBookingUpload}
        onClose={() => setShowManualBookingUpload(false)}
        onSuccess={() => {
          setShowManualBookingUpload(false);
          loadUserData(); // Refresh bookings
        }}
      />
    </div>
  );
}
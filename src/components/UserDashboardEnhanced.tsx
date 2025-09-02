import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Clock, MapPin, Star, Users, Trophy, 
  Bell, Settings, CreditCard, Heart, LogOut,
  GamepadIcon, Building, History, User as UserIcon,
  Phone, Mail, Edit3, ChevronRight, Plus, Check, X, Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ProfilePhotoUpload } from './ProfilePhotoUpload';
import { GameRequestSystem } from './GameRequestSystem';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../lib/toastManager';
import { gamesAPI, bookingsAPI, authManager } from '../lib/api';
import { userHelpers, gameRequestHelpers } from '../lib/supabase';

interface UserDashboardEnhancedProps {
  onNavigate: (page: string) => void;
  onCreateGame: () => void;
}

interface GameData {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string;
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
  { id: 'requests', label: 'Game Requests', icon: Bell },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'profile', label: 'Profile', icon: Settings },
];

export function UserDashboardEnhanced({ onNavigate, onCreateGame }: UserDashboardEnhancedProps) {
  const { user, refreshAuth } = useAuth();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [userGames, setUserGames] = useState<GameData[]>([]);
  const [userBookings, setUserBookings] = useState<BookingData[]>([]);
  const [gameRequests, setGameRequests] = useState<any[]>([]);
  const [joinedGames, setJoinedGames] = useState<GameData[]>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user?.profile_image_url || '');

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

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
          const transformedHostedGames = hostedGamesResponse.data.map((gameData: any) => ({
            id: gameData.id,
            title: `${gameData.sport || gameData.format || 'Game'}`,
            sport: gameData.sport || gameData.format || 'Game',
            date: gameData.date,
            time: `${gameData.start_time || '00:00'} - ${gameData.end_time || '00:00'}`,
            turfName: gameData.turfs?.name || gameData.turf_name || 'Unknown Turf',
            turfAddress: gameData.turfs?.address || gameData.turf_address || 'Unknown Address',
            players: `${gameData.current_players || 1}/${gameData.max_players || 10}`,
            status: new Date(`${gameData.date}T${gameData.end_time || '23:59'}`) < new Date() ? 'completed' as const : 'upcoming' as const
          }));
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

      setUserBookings([
        {
          id: '1',
          turfName: 'Premium Sports Club',
          turfAddress: 'Gangapur Road',
          date: '2024-01-22',
          time: '19:00',
          duration: '2 hours',
          status: 'confirmed',
          amount: 1200
        }
      ]);
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
        
        // If no real requests found, show some test data for demonstration
        if (allRequests.length === 0) {
          console.log('💡 No real requests found, showing test data');
          const testRequests = [{
            id: 'test-req-1',
            user_id: 'test-user',
            user_name: 'Test Player',
            note: 'Hi, I would like to join your game!',
            status: 'pending',
            created_at: new Date().toISOString(),
            game: {
              id: 'test-game',
              sport: 'Football',
              date: new Date().toISOString().split('T')[0],
              time: '18:00 - 20:00',
              turfName: 'Test Arena',
              turfAddress: 'Test Location'
            }
          }];
          setGameRequests(testRequests);
        } else {
          setGameRequests(allRequests);
        }
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
    try {
      console.log('🎯 UserDashboard: Accepting request:', { requestId, gameId, userId });
      console.log('🔍 UserDashboard: Available requests:', gameRequests);
      
      // Accept the request with correct parameters
      const response = await gameRequestHelpers.acceptGameRequest(requestId, gameId);
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
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      console.log('🛑 UserDashboard: Rejecting request:', requestId);
      console.log('🔍 UserDashboard: Available requests:', gameRequests);
      
      // Find the request to get the game ID
      const request = gameRequests.find(req => req.id === requestId);
      const gameId = request?.game?.id || 'unknown-game-id';
      
      const response = await gameRequestHelpers.rejectGameRequest(requestId, gameId);
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <GamepadIcon className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-blue-900">{userGames.length}</div>
              <div className="text-sm text-blue-600">Games Hosted</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-green-900">{completedGames.length}</div>
              <div className="text-sm text-green-600">Games Played</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-purple-900">{gameRequests.length}</div>
              <div className="text-sm text-purple-600">Join Requests</div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-orange-900">{upcomingGames.length}</div>
              <div className="text-sm text-orange-600">Upcoming Games</div>
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
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Plus className="w-6 h-6 text-emerald-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={onCreateGame}
                className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-2xl p-6 h-auto flex flex-col items-center gap-3"
              >
                <GamepadIcon className="w-8 h-8" />
                <span className="text-lg font-semibold">Create Game</span>
              </Button>
              
              <Button
                onClick={() => onNavigate('turfs')}
                variant="outline"
                className="rounded-2xl p-6 h-auto flex flex-col items-center gap-3 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50"
              >
                <Building className="w-8 h-8 text-blue-600" />
                <span className="text-lg font-semibold text-blue-600">Find Turf</span>
              </Button>
              
              <Button
                onClick={() => onNavigate('games')}
                variant="outline"
                className="rounded-2xl p-6 h-auto flex flex-col items-center gap-3 border-2 border-green-200 hover:border-green-400 hover:bg-green-50"
              >
                <Search className="w-8 h-8 text-green-600" />
                <span className="text-lg font-semibold text-green-600">Find Games</span>
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
                        <span>{upcomingGames[0].date} • {upcomingGames[0].time}</span>
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

      {/* Game Requests Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <GameRequestSystem 
          onRequestStatusChange={(requestId, status) => {
            console.log(`Request ${requestId} ${status}`);
            // Handle request status change - could update game player count, etc.
          }}
        />
      </motion.div>
    </div>
  );

  const renderGames = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Games</h2>
        <Button 
          onClick={onCreateGame}
          className="bg-emerald-600 hover:bg-emerald-700 rounded-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Game
        </Button>
      </div>

      {/* Games Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button className="pb-3 px-1 border-b-2 border-emerald-600 text-emerald-600 font-semibold">
          Upcoming ({upcomingGames.length})
        </button>
        <button className="pb-3 px-1 text-gray-500 hover:text-gray-700">
          Completed ({completedGames.length})
        </button>
      </div>

      <div className="space-y-4">
        {upcomingGames.map((game) => (
          <Card key={game.id} className="border-0 shadow-lg rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-bold">{game.title}</h3>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                      {game.sport}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{game.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{game.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{game.turfName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{game.players}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-full">
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {upcomingGames.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <GamepadIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">No upcoming games</p>
            <p className="mb-4">Create or join a game to get started!</p>
            <Button onClick={onCreateGame} className="bg-emerald-600 hover:bg-emerald-700 rounded-full">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Game
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const renderBookings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Bookings</h2>
        <Button 
          onClick={() => onNavigate('turfs')}
          className="bg-blue-600 hover:bg-blue-700 rounded-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Book Turf
        </Button>
      </div>

      <div className="space-y-4">
        {userBookings.map((booking) => (
          <Card key={booking.id} className="border-0 shadow-lg rounded-2xl">
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
                      <span>{booking.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{booking.time} • {booking.duration}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <MapPin className="w-4 h-4" />
                      <span>{booking.turfAddress}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 mb-2">
                    ₹{booking.amount}
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full">
                    View Receipt
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {userBookings.length === 0 && (
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

  const renderGameRequests = () => (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Game Requests</h2>
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          {gameRequests.length} pending
        </Badge>
      </div>

      {gameRequests.length === 0 ? (
        <Card className="border-0 shadow-lg rounded-3xl">
          <CardContent className="text-center py-16">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No pending requests</h3>
            <p className="text-gray-500">
              When players request to join your games, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {gameRequests.map((request) => (
            <Card key={request.id} className="border-0 shadow-lg rounded-3xl">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {(request.users?.name || request.user_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {request.users?.name || request.user_name || 'Unknown Player'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          wants to join your {request.game?.sport} game
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span>{new Date(request.game?.date).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span>{request.game?.time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-500" />
                          <span className="truncate">{request.game?.turfName}</span>
                        </div>
                      </div>
                    </div>

                    {request.note && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                        <p className="text-sm text-blue-800">
                          <strong>Message:</strong> "{request.note}"
                        </p>
                      </div>
                    )}

                    <div className="text-xs text-gray-400">
                      Requested {new Date(request.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => handleRejectRequest(request.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleAcceptRequest(request.id, request.game.id, request.user_id)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
                {activeTab === 'requests' && renderGameRequests()}
                {activeTab === 'bookings' && renderBookings()}
                {activeTab === 'profile' && renderProfile()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
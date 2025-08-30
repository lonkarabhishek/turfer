import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Calendar, Heart, Wallet, Bell, Settings, 
  MapPin, Clock, Users, Trophy, Star, CreditCard,
  Plus, Filter, Search, ChevronRight, Activity,
  Gamepad2, BarChart3
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { authManager, bookingsAPI, gamesAPI, turfsAPI } from '../lib/api';

interface UserDashboardProps {
  onNavigate: (section: string) => void;
}

type DashboardSection = 'overview' | 'bookings' | 'games' | 'requests' | 'favorites' | 'wallet' | 'notifications' | 'settings';

export function UserDashboard({ onNavigate }: UserDashboardProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [activeGamesTab, setActiveGamesTab] = useState<'created' | 'joined'>('created');
  const [user] = useState(authManager.getUser());
  const [bookings, setBookings] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [joinedGames, setJoinedGames] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [gameRequests, setGameRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    setLoading(true);
    try {
      const [bookingsRes, gamesRes, joinedGamesRes, requestsRes] = await Promise.all([
        bookingsAPI.getMyBookings(),
        gamesAPI.getMyGames(),
        gamesAPI.getJoinedGames(),
        gamesAPI.getMyRequests()
      ]);

      if (bookingsRes.success) setBookings(bookingsRes.data || []);
      if (gamesRes.success) setGames(gamesRes.data || []);
      if (joinedGamesRes.success) setJoinedGames(joinedGamesRes.data || []);
      if (requestsRes.success) setGameRequests(requestsRes.data || []);
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to check if a game is completed
  const isGameCompleted = (game: any) => {
    const gameDateTime = new Date(`${game.date}T${game.endTime || '23:59'}`);
    return new Date() > gameDateTime;
  };

  // Filter games by completion status
  const upcomingGames = games.filter(game => !isGameCompleted(game));
  const completedGames = games.filter(game => isGameCompleted(game));
  const upcomingJoinedGames = joinedGames.filter(game => !isGameCompleted(game));
  const completedJoinedGames = joinedGames.filter(game => isGameCompleted(game));

  const sidebarItems = [
    { id: 'overview', icon: BarChart3, label: 'Overview', count: undefined },
    { id: 'bookings', icon: Calendar, label: 'My Bookings', count: bookings.length },
    { id: 'games', icon: Gamepad2, label: 'My Games', count: upcomingGames.length + upcomingJoinedGames.length },
    { id: 'requests', icon: Users, label: 'Game Requests', count: gameRequests.length },
    { id: 'favorites', icon: Heart, label: 'Favorites', count: favorites.length },
    { id: 'wallet', icon: Wallet, label: 'Wallet & Payments', count: undefined },
    { id: 'notifications', icon: Bell, label: 'Notifications', count: 3 },
    { id: 'settings', icon: Settings, label: 'Account Settings', count: undefined },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]}!</h1>
            <p className="opacity-90 mt-1">Ready for your next game?</p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8" />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white border rounded-lg p-3 md:p-4 text-center">
          <Calendar className="w-5 h-5 md:w-6 md:h-6 text-primary-600 mx-auto mb-2" />
          <div className="text-lg md:text-2xl font-bold text-gray-900">{bookings.length}</div>
          <div className="text-xs md:text-sm text-gray-600">Bookings</div>
        </div>
        <div className="bg-white border rounded-lg p-3 md:p-4 text-center">
          <Gamepad2 className="w-5 h-5 md:w-6 md:h-6 text-green-600 mx-auto mb-2" />
          <div className="text-lg md:text-2xl font-bold text-gray-900">{upcomingGames.length + upcomingJoinedGames.length}</div>
          <div className="text-xs md:text-sm text-gray-600">Upcoming Games</div>
        </div>
        <div className="bg-white border rounded-lg p-3 md:p-4 text-center">
          <Heart className="w-5 h-5 md:w-6 md:h-6 text-red-600 mx-auto mb-2" />
          <div className="text-lg md:text-2xl font-bold text-gray-900">{favorites.length}</div>
          <div className="text-xs md:text-sm text-gray-600">Favorites</div>
        </div>
        <div className="bg-white border rounded-lg p-3 md:p-4 text-center">
          <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-600 mx-auto mb-2" />
          <div className="text-lg md:text-2xl font-bold text-gray-900">4.8</div>
          <div className="text-xs md:text-sm text-gray-600">Rating</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <Button variant="outline" size="sm">View All</Button>
        </div>
        <div className="space-y-3">
          {bookings.slice(0, 3).map((booking, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mr-3">
                  <Calendar className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <div className="font-medium">Booking at {booking.turfName || 'Turf'}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(booking.date).toLocaleDateString()} • {booking.startTime}
                  </div>
                </div>
              </div>
              <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                {booking.status}
              </Badge>
            </div>
          ))}
          {bookings.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
              <Button 
                className="mt-3" 
                onClick={() => onNavigate('search')}
              >
                Book Your First Turf
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Button 
          className="h-16 md:h-24 flex-col space-y-1 md:space-y-2 bg-primary-600 hover:bg-primary-700"
          onClick={() => onNavigate('search')}
        >
          <Plus className="w-5 h-5 md:w-6 md:h-6" />
          <span className="text-sm md:text-base">Book a Turf</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-16 md:h-24 flex-col space-y-1 md:space-y-2"
          onClick={() => onNavigate('games')}
        >
          <Users className="w-5 h-5 md:w-6 md:h-6" />
          <span className="text-sm md:text-base">Find Games</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-16 md:h-24 flex-col space-y-1 md:space-y-2"
          onClick={() => setActiveSection('wallet')}
        >
          <Wallet className="w-5 h-5 md:w-6 md:h-6" />
          <span className="text-sm md:text-base">Add Money</span>
        </Button>
      </div>
    </div>
  );

  const renderBookings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="text-gray-600">Manage your turf reservations</p>
        </div>
        <Button onClick={() => onNavigate('search')}>
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="Search bookings..." className="pl-10" />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Bookings List */}
      <div className="space-y-4">
        {bookings.map((booking, idx) => (
          <div key={idx} className="bg-white border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{booking.turfName || `Turf #${booking.turfId}`}</h3>
                <div className="flex items-center text-gray-600 mt-1">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span className="text-sm">{booking.address || 'Location not specified'}</span>
                </div>
              </div>
              <Badge variant={booking.status === 'confirmed' ? 'default' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                {booking.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Date</div>
                  <div className="font-medium">{new Date(booking.date).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Time</div>
                  <div className="font-medium">{booking.startTime} - {booking.endTime}</div>
                </div>
              </div>
              <div className="flex items-center">
                <Users className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Players</div>
                  <div className="font-medium">{booking.totalPlayers}</div>
                </div>
              </div>
              <div className="flex items-center">
                <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Amount</div>
                  <div className="font-medium">₹{booking.totalAmount}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <div className="flex items-center space-x-4">
                <Button variant="outline" size="sm">View Details</Button>
                {booking.status === 'confirmed' && new Date(booking.date) > new Date() && (
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                    Cancel
                  </Button>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Booked on {new Date(booking.createdAt || Date.now()).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}

        {bookings.length === 0 && (
          <div className="text-center py-12 bg-white border rounded-lg">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings yet</h3>
            <p className="text-gray-600 mb-4">Book your first turf to get started</p>
            <Button onClick={() => onNavigate('search')}>
              <Plus className="w-4 h-4 mr-2" />
              Book Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const renderGames = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Games</h1>
          <p className="text-gray-600">Manage games you created and joined</p>
        </div>
        <Button onClick={() => onNavigate('search')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Game
        </Button>
      </div>

      {/* Games Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button className="border-b-2 border-primary-500 text-primary-600 py-2 px-1 text-sm font-medium">
            Games I Created ({upcomingGames.length})
          </button>
          <button className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 py-2 px-1 text-sm font-medium">
            Games I Joined ({upcomingJoinedGames.length})
          </button>
        </nav>
      </div>

      {/* Games Content based on active tab */}
      <div className="space-y-4">
        {activeGamesTab === 'created' ? (
          <>
            {/* Created Games Tab */}
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-600" />
              Upcoming Games ({upcomingGames.length})
            </h3>
            {upcomingGames.map((game, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{game.sport || game.format} Game</h3>
                    <div className="flex items-center text-gray-600 mt-1">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span className="text-sm">{game.turfName || game.venue}</span>
                    </div>
                  </div>
                  <Badge variant={game.status === 'confirmed' ? 'default' : game.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {game.status || 'pending'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Date</div>
                      <div className="font-medium">{new Date(game.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Time</div>
                      <div className="font-medium">{game.startTime} - {game.endTime}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Players</div>
                      <div className="font-medium">{game.currentPlayers || 0}/{game.maxPlayers}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Cost</div>
                      <div className="font-medium">₹{game.costPerPerson}/person</div>
                    </div>
                  </div>
                </div>

                {game.notes && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Note: {game.notes}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    <Button variant="outline" size="sm">Manage Players</Button>
                    <Button variant="outline" size="sm">Share Game</Button>
                    {game.status === 'confirmed' && new Date(game.date) > new Date() && (
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                        Cancel Game
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    Created on {new Date(game.createdAt || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {upcomingGames.length === 0 && (
              <div className="text-center py-8 bg-white border rounded-lg">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming games</h3>
                <p className="text-gray-600 mb-4">Create your first game and invite players</p>
                <Button onClick={() => onNavigate('search')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Game
                </Button>
              </div>
            )}

            {/* Completed Created Games */}
            {completedGames.length > 0 && (
              <>
                <div className="border-t border-gray-200 mt-8 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-gray-500" />
                    Completed Games ({completedGames.length})
                  </h3>
                </div>
                {completedGames.map((game, idx) => (
                  <div key={`completed-${idx}`} className="bg-white border rounded-lg p-6 opacity-75">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{game.sport || game.format} Game</h3>
                        <div className="flex items-center text-gray-600 mt-1">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span className="text-sm">{game.turfName || game.venue}</span>
                        </div>
                      </div>
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                        Completed
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Date</div>
                          <div className="font-medium">{new Date(game.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Time</div>
                          <div className="font-medium">{game.startTime} - {game.endTime}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Players</div>
                          <div className="font-medium">{game.currentPlayers || 0}/{game.maxPlayers}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Cost</div>
                          <div className="font-medium">₹{game.costPerPerson}/person</div>
                        </div>
                      </div>
                    </div>

                    {game.notes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Note: {game.notes}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center space-x-4">
                        <Button variant="outline" size="sm" className="text-gray-500">
                          View Details
                        </Button>
                      </div>
                      <div className="text-sm text-gray-500">
                        Completed on {new Date(game.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Joined Games Tab */}
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-600" />
              Upcoming Games I Joined ({upcomingJoinedGames.length})
            </h3>
            {upcomingJoinedGames.map((game, idx) => (
              <div key={`joined-${idx}`} className="bg-white border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{game.sport || game.format} Game</h3>
                    <div className="flex items-center text-gray-600 mt-1">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span className="text-sm">{game.turfName || game.venue}</span>
                    </div>
                    <div className="flex items-center text-gray-600 mt-1">
                      <User className="w-4 h-4 mr-1" />
                      <span className="text-sm">Hosted by {game.hostName}</span>
                    </div>
                  </div>
                  <Badge variant={game.status === 'confirmed' ? 'default' : game.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {game.status || 'joined'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Date</div>
                      <div className="font-medium">{new Date(game.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Time</div>
                      <div className="font-medium">{game.startTime} - {game.endTime}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Users className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Players</div>
                      <div className="font-medium">{game.currentPlayers || 0}/{game.maxPlayers}</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                    <div>
                      <div className="text-sm text-gray-600">Cost</div>
                      <div className="font-medium">₹{game.costPerPerson}/person</div>
                    </div>
                  </div>
                </div>

                {game.notes && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">Note: {game.notes}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    <Button variant="outline" size="sm">View Game</Button>
                    <Button variant="outline" size="sm">Contact Host</Button>
                  </div>
                  <div className="text-sm text-gray-500">
                    Joined on {new Date(game.joinedAt || Date.now()).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
            {upcomingJoinedGames.length === 0 && (
              <div className="text-center py-8 bg-white border rounded-lg">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No joined games</h3>
                <p className="text-gray-600 mb-4">Find and join games in your area</p>
                <Button onClick={() => onNavigate('search')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Find Games
                </Button>
              </div>
            )}

            {/* Completed Joined Games */}
            {completedJoinedGames.length > 0 && (
              <>
                <div className="border-t border-gray-200 mt-8 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-gray-500" />
                    Completed Games I Played ({completedJoinedGames.length})
                  </h3>
                </div>
                {completedJoinedGames.map((game, idx) => (
                  <div key={`completed-joined-${idx}`} className="bg-white border rounded-lg p-6 opacity-75">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{game.sport || game.format} Game</h3>
                        <div className="flex items-center text-gray-600 mt-1">
                          <MapPin className="w-4 h-4 mr-1" />
                          <span className="text-sm">{game.turfName || game.venue}</span>
                        </div>
                        <div className="flex items-center text-gray-600 mt-1">
                          <User className="w-4 h-4 mr-1" />
                          <span className="text-sm">Hosted by {game.hostName}</span>
                        </div>
                      </div>
                      <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                        Completed
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Date</div>
                          <div className="font-medium">{new Date(game.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Time</div>
                          <div className="font-medium">{game.startTime} - {game.endTime}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Players</div>
                          <div className="font-medium">{game.currentPlayers || 0}/{game.maxPlayers}</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <CreditCard className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-600">Cost</div>
                          <div className="font-medium">₹{game.costPerPerson}/person</div>
                        </div>
                      </div>
                    </div>

                    {game.notes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Note: {game.notes}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center space-x-4">
                        <Button variant="outline" size="sm" className="text-gray-500">
                          View Details
                        </Button>
                      </div>
                      <div className="text-sm text-gray-500">
                        Played on {new Date(game.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderGameRequests = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Game Requests</h1>
          <p className="text-gray-600">Manage requests to join your games</p>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {gameRequests.map((request, idx) => (
          <div key={idx} className="bg-white border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{request.playerName}</h3>
                <p className="text-gray-600 text-sm">wants to join your {request.gameFormat} game</p>
                <div className="flex items-center text-gray-600 mt-1">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span className="text-sm">{request.turfName}</span>
                </div>
              </div>
              <Badge variant={request.status === 'pending' ? 'secondary' : request.status === 'accepted' ? 'default' : 'destructive'}>
                {request.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Date</div>
                  <div className="font-medium">{new Date(request.gameDate).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Time</div>
                  <div className="font-medium">{request.startTime} - {request.endTime}</div>
                </div>
              </div>
              <div className="flex items-center">
                <Trophy className="w-4 h-4 text-gray-400 mr-2" />
                <div>
                  <div className="text-sm text-gray-600">Skill Level</div>
                  <div className="font-medium">{request.playerSkillLevel || 'Not specified'}</div>
                </div>
              </div>
            </div>

            {request.message && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Message: {request.message}</span>
              </div>
            )}

            {request.status === 'pending' && (
              <div className="flex items-center space-x-3 pt-4 border-t border-gray-100">
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {/* Handle accept */}}
                >
                  Accept Request
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {/* Handle reject */}}
                >
                  Decline
                </Button>
              </div>
            )}
          </div>
        ))}

        {gameRequests.length === 0 && (
          <div className="text-center py-12 bg-white border rounded-lg">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No game requests</h3>
            <p className="text-gray-600">When players request to join your games, they'll appear here</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderWallet = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet & Payments</h1>
        <p className="text-gray-600">Manage your payments and wallet balance</p>
      </div>

      {/* Wallet Balance Card */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Wallet Balance</h2>
            <div className="text-3xl font-bold mt-2">₹248.50</div>
          </div>
          <Wallet className="w-12 h-12 opacity-80" />
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Money
          </Button>
          <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10">
            Transaction History
          </Button>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Payment Methods</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center">
              <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded mr-3"></div>
              <div>
                <div className="font-medium">•••• •••• •••• 1234</div>
                <div className="text-sm text-gray-600">Expires 12/25</div>
              </div>
            </div>
            <Badge>Primary</Badge>
          </div>
          <Button variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Payment Method
          </Button>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="space-y-3">
          {[
            { type: 'booking', amount: -500, description: 'Booking at Green Field Arena', date: '2024-01-15' },
            { type: 'refund', amount: +200, description: 'Refund for cancelled booking', date: '2024-01-12' },
            { type: 'wallet', amount: +1000, description: 'Wallet top-up', date: '2024-01-10' },
          ].map((transaction, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
                  transaction.amount > 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <Activity className={`w-5 h-5 ${
                    transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <div className="font-medium">{transaction.description}</div>
                  <div className="text-sm text-gray-600">{transaction.date}</div>
                </div>
              </div>
              <div className={`font-medium ${
                transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {transaction.amount > 0 ? '+' : ''}₹{Math.abs(transaction.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-gray-600">Manage your profile and account preferences</p>
      </div>

      {/* Profile Section */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Profile Information</h2>
        
        <div className="flex items-start space-x-6">
          {/* Profile Photo */}
          <div className="flex flex-col items-center space-y-3">
            <div className="w-24 h-24 bg-gradient-to-r from-primary-600 to-primary-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="text-center">
              <Button variant="outline" size="sm" className="mb-2">
                <User className="w-4 h-4 mr-2" />
                Upload Photo
              </Button>
              <p className="text-xs text-gray-500">JPG, PNG up to 5MB</p>
            </div>
          </div>

          {/* Profile Form */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <Input defaultValue={user?.name || ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input defaultValue={user?.email || ''} disabled className="bg-gray-50" />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <Input defaultValue={user?.phone || ''} placeholder="Enter phone number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border">
                {user?.role === 'owner' ? 'Turf Owner' : 'Player'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
          <Button className="bg-primary-600 hover:bg-primary-700">
            Save Changes
          </Button>
        </div>
      </div>

      {/* Account Security */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Security</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Password</h3>
              <p className="text-sm text-gray-600">Change your account password</p>
            </div>
            <Button variant="outline" size="sm">
              Change Password
            </Button>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Email Notifications</h3>
              <p className="text-sm text-gray-600">Receive booking and game updates via email</p>
            </div>
            <input type="checkbox" className="toggle" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">SMS Notifications</h3>
              <p className="text-sm text-gray-600">Receive important updates via SMS</p>
            </div>
            <input type="checkbox" className="toggle" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'bookings':
        return renderBookings();
      case 'games':
        return renderGames();
      case 'requests':
        return renderGameRequests();
      case 'wallet':
        return renderWallet();
      case 'settings':
        return renderSettings();
      default:
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚧</div>
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-gray-600">This section is under development</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row">
        {/* Mobile Header */}
        <div className="md:hidden bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                <User className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">{user?.name}</div>
                <div className="text-xs text-gray-600 capitalize">{user?.role} Account</div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden bg-white border-b border-gray-200 p-4">
          <div className="flex space-x-2 overflow-x-auto">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as DashboardSection)}
                className={`flex-shrink-0 flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeSection === item.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-4 h-4 mr-2" />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.count !== undefined && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    {item.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 bg-white border-r border-gray-200 min-h-screen">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                <User className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <div className="font-semibold">{user?.name}</div>
                <div className="text-sm text-gray-600 capitalize">{user?.role} Account</div>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as DashboardSection)}
                className={`w-full flex items-center justify-between p-3 text-left rounded-lg transition-colors ${
                  activeSection === item.id
                    ? 'bg-primary-50 text-primary-600 border border-primary-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center">
                  <item.icon className="w-5 h-5 mr-3" />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && (
                  <Badge variant="secondary" className="text-xs">
                    {item.count}
                  </Badge>
                )}
              </button>
            ))}
          </nav>

        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            renderSection()
          )}
        </div>
      </div>
    </div>
  );
}
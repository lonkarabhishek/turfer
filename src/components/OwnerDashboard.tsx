import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Plus, Calendar, Users, DollarSign, Star,
  MapPin, Clock, Settings, Bell, BarChart3, TrendingUp,
  Filter, Search, Edit, Trash2, Eye, ChevronRight,
  AlertCircle, CheckCircle, XCircle, Activity,
  CreditCard, MessageSquare, Award, Target, Trophy, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ResponsiveContainer, AreaChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Area } from 'recharts';
import { authManager, turfsAPI, bookingsAPI, gamesAPI } from '../lib/api';
import { filterNonExpiredGames, isGameExpired } from '../lib/gameUtils';
import type { GameData } from './GameCard';

type DashboardSection = 'overview' | 'turfs' | 'bookings' | 'earnings' | 'games' | 'notifications' | 'settings';

interface OwnerDashboardProps {
  onNavigate?: (section: string) => void;
}

export function OwnerDashboard({ onNavigate }: OwnerDashboardProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [user] = useState(authManager.getUser());
  const [turfs, setTurfs] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTurf, setShowAddTurf] = useState(false);

  // Mock data for analytics
  const MOCK_BOOKINGS_SERIES = [
    { month: "Feb", bookings: 22, revenue: 28600, occupancy: 48 },
    { month: "Mar", bookings: 35, revenue: 45500, occupancy: 60 },
    { month: "Apr", bookings: 32, revenue: 41600, occupancy: 58 },
    { month: "May", bookings: 44, revenue: 57200, occupancy: 66 },
    { month: "Jun", bookings: 57, revenue: 74100, occupancy: 72 },
    { month: "Jul", bookings: 62, revenue: 80600, occupancy: 74 },
  ];

  const totalRevenue = MOCK_BOOKINGS_SERIES.reduce((a, c) => a + c.revenue, 0);
  const avgOccupancy = MOCK_BOOKINGS_SERIES.reduce((a, c) => a + c.occupancy, 0) / MOCK_BOOKINGS_SERIES.length;

  useEffect(() => {
    loadOwnerData();
  }, []);

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      console.log('🏢 Loading owner dashboard data for user:', user?.id);

      // Load owner's turfs
      try {
        console.log('🏟️ Loading turfs...');
        const turfsRes = await turfsAPI.search({ ownerId: user?.id });
        if (turfsRes.success && turfsRes.data?.turfs) {
          console.log('✅ Turfs loaded:', turfsRes.data.turfs);
          setTurfs(turfsRes.data.turfs);
        } else {
          console.log('⚠️ No turfs found for owner');
          setTurfs([]);
        }
      } catch (turfError) {
        console.error('❌ Error loading turfs:', turfError);
        setTurfs([]);
      }

      // Load owner's bookings
      try {
        console.log('📅 Loading bookings...');
        const bookingsRes = await bookingsAPI.getOwnerBookings(user?.id);
        if (bookingsRes.success && bookingsRes.data) {
          console.log('✅ Bookings loaded:', bookingsRes.data);
          setBookings(bookingsRes.data);
        } else {
          console.log('⚠️ No bookings found for owner');
          setBookings([]);
        }
      } catch (bookingError) {
        console.error('❌ Error loading bookings:', bookingError);

        // Fallback: create sample booking data for demonstration
        console.log('💡 Using sample booking data');
        const sampleBookings = [
          {
            id: 'book-1',
            customerName: 'John Doe',
            turfName: 'Elite Sports Arena',
            date: '2024-01-15',
            timeSlot: '18:00 - 20:00',
            amount: 1500,
            status: 'confirmed'
          },
          {
            id: 'book-2',
            customerName: 'Sarah Wilson',
            turfName: 'Champions Ground',
            date: '2024-01-16',
            timeSlot: '16:00 - 18:00',
            amount: 1200,
            status: 'pending'
          }
        ];
        setBookings(sampleBookings);
      }

      // Load games for owner's turfs
      try {
        console.log('🎮 Loading games...');
        const gamesRes = await gamesAPI.getAvailableGames();
        if (gamesRes.success && gamesRes.data) {
          // Filter games that are at owner's turfs
          const turfIds = turfs.map(t => t.id);
          const ownerGames = gamesRes.data.filter((game: GameData) =>
            game.turfId && turfIds.includes(game.turfId)
          );
          console.log('✅ Games loaded:', ownerGames);
          setGames(ownerGames);
        } else {
          console.log('⚠️ No games found');
          setGames([]);
        }
      } catch (gameError) {
        console.error('❌ Error loading games:', gameError);
        setGames([]);
      }

    } catch (error) {
      console.error('❌ Failed to load owner data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { id: 'overview', icon: BarChart3, label: 'Overview', count: undefined },
    { id: 'turfs', icon: Building2, label: 'My Turfs', count: turfs.length },
    { id: 'bookings', icon: Calendar, label: 'Bookings', count: undefined },
    { id: 'earnings', icon: DollarSign, label: 'Earnings', count: undefined },
    { id: 'games', icon: Users, label: 'Games', count: games.length },
    { id: 'notifications', icon: Bell, label: 'Notifications', count: 3 },
    { id: 'settings', icon: Settings, label: 'Settings', count: undefined },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]}!</h1>
            <p className="opacity-90 mt-1">Manage your turf business with ease</p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-600 mx-auto mb-2" />
            <div className="text-lg md:text-2xl font-bold text-gray-900">₹{Math.round(totalRevenue/1000)}K</div>
            <div className="text-xs md:text-sm text-gray-600">Revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600 mx-auto mb-2" />
            <div className="text-lg md:text-2xl font-bold text-gray-900">{turfs.length}</div>
            <div className="text-xs md:text-sm text-gray-600">Turfs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <Calendar className="w-5 h-5 md:w-6 md:h-6 text-purple-600 mx-auto mb-2" />
            <div className="text-lg md:text-2xl font-bold text-gray-900">{bookings.length}</div>
            <div className="text-xs md:text-sm text-gray-600">Bookings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-orange-600 mx-auto mb-2" />
            <div className="text-lg md:text-2xl font-bold text-gray-900">{avgOccupancy.toFixed(0)}%</div>
            <div className="text-xs md:text-sm text-gray-600">Occupancy</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Revenue Trends
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_BOOKINGS_SERIES}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`₹${value}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#revenueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { type: 'booking', message: 'New booking at Green Field', time: '2 min ago', icon: Calendar },
                { type: 'payment', message: 'Payment received ₹1,200', time: '15 min ago', icon: CreditCard },
                { type: 'review', message: 'New 5-star review', time: '1 hour ago', icon: Star },
                { type: 'turf', message: 'Turf maintenance completed', time: '2 hours ago', icon: CheckCircle }
              ].map((activity, idx) => (
                <div key={idx} className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <activity.icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Button 
          className="h-14 md:h-16 flex-col space-y-1 md:space-y-2 bg-green-600 hover:bg-green-700"
          onClick={() => setShowAddTurf(true)}
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5" />
          <span className="text-xs md:text-sm">Add Turf</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-14 md:h-16 flex-col space-y-1 md:space-y-2"
          onClick={() => setActiveSection('bookings')}
        >
          <Calendar className="w-4 h-4 md:w-5 md:h-5" />
          <span className="text-xs md:text-sm">Bookings</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-14 md:h-16 flex-col space-y-1 md:space-y-2"
          onClick={() => setActiveSection('earnings')}
        >
          <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
          <span className="text-xs md:text-sm">Reports</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-14 md:h-16 flex-col space-y-1 md:space-y-2"
          onClick={() => setActiveSection('settings')}
        >
          <Settings className="w-4 h-4 md:w-5 md:h-5" />
          <span className="text-xs md:text-sm">Settings</span>
        </Button>
      </div>
    </div>
  );

  const renderTurfs = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Turfs</h1>
          <p className="text-gray-600">Manage your turf properties</p>
        </div>
        <Button onClick={() => setShowAddTurf(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add New Turf
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="Search turfs..." className="pl-10" />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Turfs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {turfs.map((turf, idx) => (
          <Card key={idx} className="overflow-hidden">
            <div className="aspect-video bg-gradient-to-r from-green-400 to-green-600 relative">
              <div className="absolute top-4 right-4">
                <Badge variant={turf.isActive ? 'success' : 'secondary'}>
                  {turf.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="absolute bottom-4 left-4 text-white">
                <div className="flex items-center space-x-1">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-medium">{turf.rating || '4.5'}</span>
                </div>
              </div>
            </div>
            
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg">{turf.name || `Turf ${idx + 1}`}</h3>
                <div className="flex items-center space-x-1">
                  <Button variant="ghost" size="sm">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>{turf.address || 'Address not set'}</span>
                </div>
                <div className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" />
                  <span>₹{turf.pricePerHour || '500'}/hour</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  <span>{turf.sports?.join(', ') || 'Football, Cricket'}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-green-600">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    <span>68% booked this month</span>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty State */}
        {turfs.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No turfs yet</h3>
              <p className="text-gray-600 mb-4">Add your first turf to start managing bookings</p>
              <Button onClick={() => setShowAddTurf(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Turf
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderBookings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bookings & Manual Booking</h2>
      </div>

      {/* Coming Soon Message */}
      <Card className="border-2 border-dashed border-gray-300">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full mx-auto mb-6 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-purple-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Coming Soon!</h3>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            We're working hard to bring you an amazing bookings management and manual booking system.
            Stay tuned for updates!
          </p>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <Badge className="bg-purple-100 text-purple-700 px-4 py-2 text-sm">
              📅 Automated Booking Management
            </Badge>
            <Badge className="bg-blue-100 text-blue-700 px-4 py-2 text-sm">
              ✍️ Manual Booking Upload
            </Badge>
            <Badge className="bg-green-100 text-green-700 px-4 py-2 text-sm">
              📊 Analytics & Reports
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEarnings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Earnings & Analytics</h2>
        <Button variant="outline">
          <BarChart3 className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Earnings Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Total Revenue</div>
                <div className="text-3xl font-bold text-green-600">₹{Math.round(totalRevenue/1000)}K</div>
                <div className="text-sm text-green-600 mt-1">+12% from last month</div>
              </div>
              <DollarSign className="w-12 h-12 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Average Occupancy</div>
                <div className="text-3xl font-bold text-blue-600">{Math.round(avgOccupancy)}%</div>
                <div className="text-sm text-blue-600 mt-1">+5% from last month</div>
              </div>
              <Activity className="w-12 h-12 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Active Turfs</div>
                <div className="text-3xl font-bold text-purple-600">{turfs.filter(t => t.isActive).length}</div>
                <div className="text-sm text-gray-600 mt-1">of {turfs.length} total</div>
              </div>
              <Building2 className="w-12 h-12 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_BOOKINGS_SERIES}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderGames = () => {
    // Helper function to format date
    const formatGameDate = (dateString: string): string => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Filter games into upcoming and completed
    const now = new Date();
    const upcomingGames = games.filter(game => {
      const gameDate = new Date(game.date);
      return gameDate >= now;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const completedGames = games.filter(game => {
      const gameDate = new Date(game.date);
      return gameDate < now;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Games & Events</h2>
            <p className="text-gray-600 text-sm">Manage games happening at your turfs</p>
          </div>
        </div>

        {/* Game Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3 sm:p-5 text-center">
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mx-auto mb-1.5 sm:mb-2" />
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-blue-900">{upcomingGames.length}</div>
              <div className="text-[10px] sm:text-xs lg:text-sm text-blue-700 font-medium">Upcoming</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3 sm:p-5 text-center">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 mx-auto mb-1.5 sm:mb-2" />
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-900">{completedGames.length}</div>
              <div className="text-[10px] sm:text-xs lg:text-sm text-green-700 font-medium">Completed</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-3 sm:p-5 text-center">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 mx-auto mb-1.5 sm:mb-2" />
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-900">{games.reduce((acc, g) => acc + g.currentPlayers, 0)}</div>
              <div className="text-[10px] sm:text-xs lg:text-sm text-purple-700 font-medium">Players</div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Games Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Upcoming Games
            </h3>
            <Badge className="bg-blue-100 text-blue-700">{upcomingGames.length}</Badge>
          </div>

          {upcomingGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {upcomingGames.map((game) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                    <CardContent className="p-3 sm:p-4">
                      {/* Game Header */}
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm sm:text-base text-gray-900 mb-0.5 truncate">{game.format}</h4>
                          <p className="text-xs text-gray-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{game.turfName}</span>
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-700 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                          Active
                        </Badge>
                      </div>

                      {/* Game Details - More Compact */}
                      <div className="space-y-1.5 mb-3 py-2 bg-gray-50 rounded-lg px-2">
                        <div className="flex items-center justify-between text-xs text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span className="truncate">{formatGameDate(game.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>{game.timeSlot}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>{game.currentPlayers}/{game.maxPlayers}</span>
                          </div>
                          <div className="flex items-center gap-1 font-semibold text-green-700">
                            <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>₹{game.costPerPerson}</span>
                          </div>
                        </div>
                      </div>

                      {/* Host Info - Simplified */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {game.hostName?.charAt(0) || 'H'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {game.hostName}
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500 truncate">{game.skillLevel}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-gray-200">
              <CardContent className="p-12 text-center">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No upcoming games</h4>
                <p className="text-gray-600 text-sm">
                  Games scheduled at your turfs will appear here
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Completed Games Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Completed Games
            </h3>
            <Badge className="bg-green-100 text-green-700">{completedGames.length}</Badge>
          </div>

          {completedGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {completedGames.slice(0, 6).map((game) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="hover:shadow-md transition-shadow border-l-4 border-l-gray-400 opacity-90">
                    <CardContent className="p-3 sm:p-4">
                      {/* Game Header */}
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm sm:text-base text-gray-900 mb-0.5 truncate">{game.format}</h4>
                          <p className="text-xs text-gray-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{game.turfName}</span>
                          </p>
                        </div>
                        <Badge className="bg-gray-100 text-gray-600 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                          Done
                        </Badge>
                      </div>

                      {/* Game Details - More Compact */}
                      <div className="space-y-1.5 mb-3 py-2 bg-gray-50 rounded-lg px-2">
                        <div className="flex items-center justify-between text-xs text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span className="truncate">{formatGameDate(game.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>{game.currentPlayers}/{game.maxPlayers}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-700">
                            <DollarSign className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>₹{game.costPerPerson}</span>
                          </div>
                        </div>
                      </div>

                      {/* Host Info - Simplified */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {game.hostName?.charAt(0) || 'H'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {game.hostName}
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-500 truncate">{game.skillLevel}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-gray-200">
              <CardContent className="p-12 text-center">
                <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No completed games yet</h4>
                <p className="text-gray-600 text-sm">
                  Past games will be shown here for your reference
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  const renderNotifications = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Notifications</h2>
      
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {[
              { id: 1, type: 'booking', title: 'New booking request', message: 'John Doe wants to book Elite Arena for tomorrow 6 PM', time: '2 minutes ago', unread: true },
              { id: 2, type: 'payment', title: 'Payment received', message: 'Payment of ₹1,500 received for booking #12345', time: '1 hour ago', unread: true },
              { id: 3, type: 'review', title: 'New review', message: 'Sarah rated your turf 5 stars', time: '3 hours ago', unread: false },
              { id: 4, type: 'maintenance', title: 'Maintenance reminder', message: 'Elite Arena is due for maintenance', time: '1 day ago', unread: false },
            ].map((notification) => (
              <div key={notification.id} className={`p-4 ${notification.unread ? 'bg-blue-50' : 'bg-white'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold">{notification.title}</div>
                      {notification.unread && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">{notification.message}</div>
                    <div className="text-xs text-gray-500">{notification.time}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Business Name</label>
              <Input defaultValue={user?.name} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input defaultValue={user?.phone} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input defaultValue={user?.email} />
            </div>
            <Button>Update Profile</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>New bookings</span>
              <input type="checkbox" defaultChecked className="toggle" />
            </div>
            <div className="flex items-center justify-between">
              <span>Payment notifications</span>
              <input type="checkbox" defaultChecked className="toggle" />
            </div>
            <div className="flex items-center justify-between">
              <span>Review notifications</span>
              <input type="checkbox" defaultChecked className="toggle" />
            </div>
            <Button>Save Preferences</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'turfs':
        return renderTurfs();
      case 'bookings':
        return renderBookings();
      case 'earnings':
        return renderEarnings();
      case 'games':
        return renderGames();
      case 'notifications':
        return renderNotifications();
      case 'settings':
        return renderSettings();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row">
        {/* Mobile Header */}
        <div className="md:hidden bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">{user?.name}</div>
                <div className="text-xs text-gray-600">Turf Owner</div>
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
                    ? 'bg-blue-100 text-blue-700'
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
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold">{user?.name}</div>
                <div className="text-sm text-gray-600">Turf Owner</div>
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
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
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
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            renderSection()
          )}
        </div>
      </div>

      {/* Add Turf Modal */}
      {showAddTurf && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add New Turf</h2>
              <Button variant="ghost" onClick={() => setShowAddTurf(false)}>
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Turf Name</label>
                  <Input placeholder="Enter turf name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price per Hour</label>
                  <Input type="number" placeholder="500" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <Input placeholder="Enter complete address" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                  rows={3}
                  placeholder="Describe your turf..."
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" onClick={() => setShowAddTurf(false)}>
                  Cancel
                </Button>
                <Button className="bg-green-600 hover:bg-green-700">
                  Add Turf
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
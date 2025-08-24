import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, Plus, Calendar, Users, DollarSign, Star, 
  MapPin, Clock, Settings, Bell, BarChart3, TrendingUp,
  Filter, Search, Edit, Trash2, Eye, ChevronRight,
  AlertCircle, CheckCircle, XCircle, Activity,
  CreditCard, MessageSquare, Award, Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ResponsiveContainer, AreaChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Area } from 'recharts';
import { authManager, turfsAPI, bookingsAPI } from '../lib/api';

type DashboardSection = 'overview' | 'turfs' | 'bookings' | 'earnings' | 'games' | 'notifications' | 'settings';

interface OwnerDashboardProps {
  onNavigate?: (section: string) => void;
}

export function OwnerDashboard({ onNavigate }: OwnerDashboardProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [user] = useState(authManager.getUser());
  const [turfs, setTurfs] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
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
      // Load owner's turfs and bookings
      const [turfsRes, bookingsRes] = await Promise.all([
        turfsAPI.search({ ownerId: user?.id }),
        bookingsAPI.getMyBookings()
      ]);

      if (turfsRes.success) setTurfs(turfsRes.data?.turfs || []);
      if (bookingsRes.success) setBookings(bookingsRes.data || []);
    } catch (error) {
      console.error('Failed to load owner data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { id: 'overview', icon: BarChart3, label: 'Overview', count: undefined },
    { id: 'turfs', icon: Building2, label: 'My Turfs', count: turfs.length },
    { id: 'bookings', icon: Calendar, label: 'Bookings', count: bookings.length },
    { id: 'earnings', icon: DollarSign, label: 'Earnings', count: undefined },
    { id: 'games', icon: Users, label: 'Games', count: 5 },
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">₹{totalRevenue.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{turfs.length}</div>
            <div className="text-sm text-gray-600">Active Turfs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-6 h-6 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{bookings.length}</div>
            <div className="text-sm text-gray-600">Total Bookings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="w-6 h-6 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-gray-900">{avgOccupancy.toFixed(0)}%</div>
            <div className="text-sm text-gray-600">Avg Occupancy</div>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Button 
          className="h-16 flex-col space-y-2 bg-green-600 hover:bg-green-700"
          onClick={() => setShowAddTurf(true)}
        >
          <Plus className="w-5 h-5" />
          <span>Add New Turf</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-16 flex-col space-y-2"
          onClick={() => setActiveSection('bookings')}
        >
          <Calendar className="w-5 h-5" />
          <span>View Bookings</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-16 flex-col space-y-2"
          onClick={() => setActiveSection('earnings')}
        >
          <TrendingUp className="w-5 h-5" />
          <span>View Reports</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-16 flex-col space-y-2"
          onClick={() => setActiveSection('settings')}
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'turfs':
        return renderTurfs();
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
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen">
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

          <div className="absolute bottom-4 left-4 right-4">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                authManager.clearAuth();
                onNavigate?.('home');
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
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
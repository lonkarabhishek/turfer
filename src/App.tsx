import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, Plus, Users } from "lucide-react";
import { ResponsiveContainer, AreaChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Area } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";

import { SmartBookingModal } from "./components/SmartBookingModal";
import { AssistantWidget } from "./components/AssistantWidget";
import { TopNav } from "./components/TopNav";
import { MobileNav } from "./components/MobileNav";
import { TurfSearch } from "./components/TurfSearch";
import { GameCard, type GameData } from "./components/GameCard";
import { CreateGameFlow } from "./components/CreateGameFlow";
import { SimpleAuth } from "./components/SimpleAuth";

import { useAuth } from "./hooks/useAuth";
import { gamesAPI } from "./lib/api";

// Sample game data - will be replaced with API calls
const SAMPLE_GAMES: GameData[] = [
  {
    id: "game_1",
    hostName: "Rahul Sharma",
    hostAvatar: "",
    turfName: "Big Bounce Turf",
    turfAddress: "Govind Nagar Link Road, Govind Nagar",
    date: "Today",
    timeSlot: "07:00-08:00 PM",
    format: "7v7 Football",
    skillLevel: "Intermediate",
    currentPlayers: 12,
    maxPlayers: 14,
    costPerPerson: 100,
    notes: "Need 2 more players. Bring your own water bottles!",
    hostPhone: "9876543210",
    distanceKm: 1.2,
    isUrgent: true
  },
  {
    id: "game_2",
    hostName: "Priya Patel",
    turfName: "Greenfield The Multisports Turf",
    turfAddress: "Near K.K. Wagh Engineering, Gangotri Vihar",
    date: "Tomorrow",
    timeSlot: "06:00-07:00 AM",
    format: "Cricket",
    skillLevel: "All levels",
    currentPlayers: 8,
    maxPlayers: 16,
    costPerPerson: 75,
    hostPhone: "9876543212",
    distanceKm: 2.8
  },
  {
    id: "game_3",
    hostName: "Amit Kumar",
    turfName: "Kridabhumi The Multisports Turf",
    turfAddress: "Tigraniya Road, Dwarka",
    date: "Sunday",
    timeSlot: "08:00-09:00 PM",
    format: "5v5 Football",
    skillLevel: "Advanced",
    currentPlayers: 8,
    maxPlayers: 10,
    costPerPerson: 120,
    notes: "Competitive level. Looking for skilled players only.",
    hostPhone: "9876543211",
    distanceKm: 3.5
  }
];

function HeroSection({ currentCity = 'your city' }: { currentCity?: string }) {
  return (
    <div className="relative bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-600/20 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center text-white space-y-4">
          <motion.h1 
            className="text-3xl sm:text-5xl font-bold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Play tonight in {currentCity}.
          </motion.h1>
          
          <motion.p 
            className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Find a turf or find a team in 10 seconds — no app needed.
          </motion.p>
        </div>
      </div>
    </div>
  );
}

function GamesYouCanJoin({ games, user }: { games: GameData[], user: any }) {
  const [userGames, setUserGames] = useState<GameData[]>([]);
  const [loadingUserGames, setLoadingUserGames] = useState(false);

  // Load user's joined games when user is authenticated
  useEffect(() => {
    if (user) {
      loadUserGames();
    } else {
      setUserGames([]);
    }
  }, [user]);

  const loadUserGames = async () => {
    setLoadingUserGames(true);
    try {
      const response = await gamesAPI.getJoinedGames();
      if (response.success && response.data) {
        setUserGames(response.data);
      }
    } catch (error) {
      console.error('Error loading user games:', error);
    } finally {
      setLoadingUserGames(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* User's Upcoming Games */}
      {user && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Your upcoming games</h3>
              <p className="text-sm text-gray-600">Games you're playing in</p>
            </div>
          </div>
          
          {loadingUserGames ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="h-20 bg-gray-200 rounded mb-2" />
                  <div className="h-4 bg-gray-200 rounded mb-1" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : userGames.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userGames.slice(0, 3).map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No upcoming games yet</p>
              <p className="text-sm text-gray-400">Join a game below to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Available Games to Join */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Games you can join now</h3>
            <p className="text-sm text-gray-600">Live games looking for players</p>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-primary-600 font-medium">Community</span>
          </div>
        </div>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.slice(0, 6).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
        
        {games.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No active games right now</p>
            {user && (
              <Button className="mt-4 bg-primary-600 hover:bg-primary-700">
                <Plus className="w-4 h-4 mr-2" />
                Create the first game
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function UserSurface({ user, currentCity = 'your city' }: { user: any, currentCity?: string }) {
  const [smartOpen, setSmartOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'turfs' | 'games'>('turfs');
  const [games, setGames] = useState<GameData[]>(SAMPLE_GAMES);

  // Load games when user is authenticated
  useEffect(() => {
    if (user && activeSection === 'games') {
      loadGames();
    }
  }, [user, activeSection]);

  const loadGames = async () => {
    try {
      const response = await gamesAPI.getAvailable({ limit: 20 });
      if (response.success && response.data) {
        // Transform API games to match GameData interface
        setGames(response.data);
      }
    } catch (error) {
      console.error('Error loading games:', error);
      // Keep sample games on error
    }
  };

  return (
    <div className="pb-20 sm:pb-0">
      <HeroSection currentCity={currentCity} />
      
      <div className="pt-12">
        {/* Section toggle */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="flex items-center gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveSection('turfs')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSection === 'turfs'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Find Turfs
            </button>
            <button
              onClick={() => setActiveSection('games')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSection === 'games'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Join Games
            </button>
          </div>
        </div>

        {activeSection === 'turfs' ? (
          <TurfSearch user={user} currentCity={currentCity} />
        ) : (
          <GamesYouCanJoin games={games} user={user} />
        )}
      </div>

      <SmartBookingModal 
        open={smartOpen} 
        onClose={() => setSmartOpen(false)} 
        onBook={(id, slot) => console.log("BOOK", id, slot)} 
        searchTurfs={() => []} 
      />
      
      <AssistantWidget
        onSmartSearch={() => []}
        onRecommend={() => "Please search for turfs to get recommendations."}
      />
    </div>
  );
}

function OwnerDashboard() {
  const MOCK_BOOKINGS_SERIES = [
    { month: "Feb", bookings: 22, occupancy: 48 },
    { month: "Mar", bookings: 35, occupancy: 60 },
    { month: "Apr", bookings: 32, occupancy: 58 },
    { month: "May", bookings: 44, occupancy: 66 },
    { month: "Jun", bookings: 57, occupancy: 72 },
    { month: "Jul", bookings: 62, occupancy: 74 },
  ];
  
  const revenue = MOCK_BOOKINGS_SERIES.reduce((a, c) => a + c.bookings * 1300, 0);
  const occupancy = MOCK_BOOKINGS_SERIES[MOCK_BOOKINGS_SERIES.length - 1].occupancy;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Owner Dashboard</h2>
          <p className="text-gray-500">Track performance and manage your turfs</p>
        </div>
        <Button className="bg-primary-600 hover:bg-primary-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Turf
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ₹{revenue.toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Avg. Rating</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
            4.6
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Occupancy</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {occupancy}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Active Turfs</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">3</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bookings & Occupancy</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_BOOKINGS_SERIES}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00A699" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00A699" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="bookings" stroke="#00A699" fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top Slots</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                {slot: "6-7 AM", count: 48},
                {slot: "7-8 AM", count: 53},
                {slot: "8-9 PM", count: 72},
                {slot: "9-10 PM", count: 66}
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="slot" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#00A699" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, refreshAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("home");
  const [currentCity] = useState('your city');
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Auto-set dashboard tab for owners
  useEffect(() => {
    if (user?.role === 'owner' && activeTab === 'home') {
      setActiveTab('dashboard');
    }
  }, [user]);

  // Show login modal when user clicks profile but not authenticated
  const handleProfileClick = () => {
    if (!user) {
      setShowLogin(true);
    }
  };

  // Determine which interface to show based on user role
  const showOwnerDashboard = user?.role === 'owner' && (activeTab === "owner" || activeTab === "dashboard");

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav 
        currentCity={currentCity}
        user={user}
        onAuthChange={refreshAuth}
        onProfileClick={handleProfileClick}
        onCreateGame={() => setShowCreateGame(true)}
      />
      
      {showOwnerDashboard ? (
        <OwnerDashboard />
      ) : activeTab === "create" ? (
        <div className="max-w-xl mx-auto mt-8 px-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Game
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                {user ? "Create a game and invite players!" : "Sign in to create games and invite players via WhatsApp!"}
              </p>
              {user ? (
                <Button 
                  onClick={() => setShowCreateGame(true)}
                  className="w-full bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Game
                </Button>
              ) : (
                <Button 
                  onClick={() => setShowLogin(true)}
                  className="w-full bg-primary-600 hover:bg-primary-700"
                >
                  Sign In to Create Games
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <UserSurface user={user} currentCity={currentCity} />
      )}
      
      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} user={user} />
      
      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between">
          <div>© {new Date().getFullYear()} TapTurf • Made for turf lovers</div>
          <div className="flex gap-4">
            <a className="hover:text-gray-700" href="#">Privacy</a>
            <a className="hover:text-gray-700" href="#">Terms</a>
            <a className="hover:text-gray-700" href="#">Support</a>
          </div>
        </div>
      </footer>
      
      <CreateGameFlow 
        open={showCreateGame} 
        onClose={() => setShowCreateGame(false)}
        onGameCreated={(game) => {
          console.log('Game created:', game);
          setShowCreateGame(false);
        }}
      />

      <SimpleAuth
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={refreshAuth}
      />
    </div>
  );
}
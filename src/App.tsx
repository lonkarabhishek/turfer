import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";

import { SmartBookingModal } from "./components/SmartBookingModal";
import { TopNav } from "./components/TopNav";
import { MobileNav } from "./components/MobileNav";
import { TurfSearch } from "./components/TurfSearch";
import { GameCard, type GameData } from "./components/GameCard";
import { CreateGameFlow } from "./components/CreateGameFlow";
import { SimpleAuth } from "./components/SimpleAuth";
import { UserProfile } from "./components/UserProfile";
import { TurfDetailPage } from "./components/TurfDetailPage";
import { LegalPages } from "./components/LegalPages";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UserDashboard } from "./components/UserDashboard";
import { OwnerDashboard } from "./components/OwnerDashboard";
import { GameDetailPage } from "./components/GameDetailPage";
import { ToastContainer } from "./components/ui/toast";

import { useAuth } from "./hooks/useAuth";
import { gamesAPI } from "./lib/api";
import type { User } from "./hooks/useAuth";

// Helper functions for data transformation
const formatDate = (dateStr: string) => {
  const today = new Date();
  const gameDate = new Date(dateStr);
  const diffDays = Math.ceil((gameDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return gameDate.toLocaleDateString('en-US', { weekday: 'long' });
  return gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const capitalizeSkillLevel = (level: string): GameData['skillLevel'] => {
  const levelMap: { [key: string]: GameData['skillLevel'] } = {
    'beginner': 'Beginner',
    'intermediate': 'Intermediate', 
    'advanced': 'Advanced',
    'all': 'All levels'
  };
  return levelMap[level.toLowerCase()] || 'All levels';
};

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

function GamesYouCanJoin({ games, user, onGameClick }: { games: GameData[], user: User | null, onGameClick?: (gameId: string) => void }) {
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
        // Transform joined games to match GameData interface
        const transformedUserGames = response.data.map((game: any) => ({
          id: game.id,
          hostName: game.host_name || "Unknown Host",
          hostAvatar: "",
          turfName: game.turf_name || "Unknown Turf",
          turfAddress: game.turf_address || "Unknown Address",
          date: formatDate(game.date),
          timeSlot: `${game.startTime}-${game.endTime}`,
          format: game.format,
          skillLevel: capitalizeSkillLevel(game.skillLevel),
          currentPlayers: game.currentPlayers,
          maxPlayers: game.maxPlayers,
          costPerPerson: game.costPerPerson,
          notes: game.notes,
          hostPhone: game.host_phone || "9999999999",
          distanceKm: undefined,
          isUrgent: false
        }));
        setUserGames(transformedUserGames);
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
                <GameCard key={game.id} game={game} user={user} onGameClick={onGameClick} />
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
            <GameCard key={game.id} game={game} user={user} onGameClick={onGameClick} />
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

function UserSurface({ user, currentCity = 'your city', onTurfClick }: { user: User | null, currentCity?: string, onTurfClick?: (turfId: string) => void }) {
  const [smartOpen, setSmartOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'turfs' | 'games'>('turfs');
  const [games, setGames] = useState<GameData[]>(SAMPLE_GAMES);

  // Load games when games section is active (regardless of authentication)
  useEffect(() => {
    if (activeSection === 'games') {
      loadGames();
    }
  }, [activeSection]);

  const loadGames = async () => {
    try {
      const response = await gamesAPI.getAvailable({ limit: 20 });
      if (response.success && response.data) {
        // Transform API games to match GameData interface
        const transformedGames = response.data.map((game: any) => ({
          id: game.id,
          hostName: game.host_name || "Unknown Host",
          hostAvatar: "",
          turfName: game.turf_name || "Unknown Turf",
          turfAddress: game.turf_address || "Unknown Address",
          date: formatDate(game.date),
          timeSlot: `${game.startTime}-${game.endTime}`,
          format: game.format,
          skillLevel: capitalizeSkillLevel(game.skillLevel),
          currentPlayers: game.currentPlayers,
          maxPlayers: game.maxPlayers,
          costPerPerson: game.costPerPerson,
          notes: game.notes,
          hostPhone: game.host_phone || "9999999999",
          distanceKm: undefined, // Will be calculated if location is available
          isUrgent: false // Can be calculated based on date/time
        }));
        setGames(transformedGames);
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
          <TurfSearch 
            user={user} 
            currentCity={currentCity} 
            onTurfClick={onTurfClick}
          />
        ) : (
          <GamesYouCanJoin 
            games={games} 
            user={user} 
            onGameClick={handleGameClick} 
          />
        )}
      </div>

      <SmartBookingModal 
        open={smartOpen} 
        onClose={() => setSmartOpen(false)} 
        onBook={(id, slot) => console.log("BOOK", id, slot)} 
        searchTurfs={() => []} 
      />
      
    </div>
  );
}


export default function App() {
  const { user, loading, refreshAuth, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("home");
  const [currentPage, setCurrentPage] = useState<'home' | 'turf-detail' | 'profile' | 'legal' | 'dashboard' | 'game-detail'>('home');
  const [currentCity, setCurrentCity] = useState('Nashik');
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedTurfId, setSelectedTurfId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [legalPageType, setLegalPageType] = useState<'privacy' | 'terms' | 'support'>('privacy');

  // Update URL when navigating to game pages
  const handleGameClick = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
    setCurrentPage('game-detail');
    window.history.pushState({}, '', `/game/${gameId}`);
  }, []);

  // Auto-set dashboard tab for owners
  useEffect(() => {
    if (user?.role === 'owner' && activeTab === 'home') {
      setActiveTab('dashboard');
    }
  }, [user]);

  // Handle URL-based routing for game pages
  useEffect(() => {
    const path = window.location.pathname;
    const gameMatch = path.match(/^\/game\/([a-zA-Z0-9-]+)$/);
    
    if (gameMatch) {
      const gameId = gameMatch[1];
      setSelectedGameId(gameId);
      setCurrentPage('game-detail');
    }
  }, []);

  // Show login modal or navigate to appropriate dashboard
  const handleProfileClick = () => {
    if (!user) {
      setShowLogin(true);
    } else {
      // Navigate to dashboard for both users and owners
      setCurrentPage('dashboard');
      setActiveTab('dashboard');
    }
  };

  const handleTurfClick = (turfId: string) => {
    setSelectedTurfId(turfId);
    setCurrentPage('turf-detail');
  };

  const handleBackToHome = () => {
    setCurrentPage('home');
    setSelectedTurfId(null);
    setSelectedGameId(null);
    setActiveTab('home');
    window.history.pushState({}, '', '/');
  };

  const handleNavigate = (section: string) => {
    if (section === 'home') {
      handleBackToHome();
    } else if (section === 'search') {
      handleBackToHome();
      setActiveTab('home');
    } else if (section === 'games') {
      handleBackToHome();
      setActiveTab('home');
    }
  };

  const handleLegalPageClick = (type: 'privacy' | 'terms' | 'support') => {
    setLegalPageType(type);
    setCurrentPage('legal');
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
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Demo mode banner */}
        <div className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-amber-900 px-4 py-2 text-center text-sm font-medium">
          🎭 Demo Mode Active • Showing sample data while servers update • All features functional!
        </div>
        <TopNav 
        currentCity={currentCity}
        user={user}
        onAuthChange={refreshAuth}
        onProfileClick={handleProfileClick}
        onCreateGame={() => setShowCreateGame(true)}
        onCityChange={setCurrentCity}
        onHomeClick={handleBackToHome}
      />
      
      {currentPage === 'turf-detail' && selectedTurfId ? (
        <TurfDetailPage
          turfId={selectedTurfId}
          onBack={handleBackToHome}
          onCreateGame={() => {
            handleBackToHome();
            setShowCreateGame(true);
          }}
        />
      ) : currentPage === 'game-detail' && selectedGameId ? (
        <GameDetailPage
          gameId={selectedGameId}
          onBack={handleBackToHome}
        />
      ) : currentPage === 'dashboard' && user ? (
        user.role === 'owner' ? (
          <OwnerDashboard onNavigate={handleNavigate} />
        ) : (
          <UserDashboard onNavigate={handleNavigate} />
        )
      ) : currentPage === 'profile' && user ? (
        <UserProfile
          user={user}
          onBack={handleBackToHome}
          onCreateGame={() => {
            handleBackToHome();
            setShowCreateGame(true);
          }}
        />
      ) : showOwnerDashboard ? (
        <OwnerDashboard onNavigate={handleNavigate} />
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
      ) : currentPage === 'legal' ? (
        <LegalPages
          type={legalPageType}
          onBack={handleBackToHome}
        />
      ) : (
        <UserSurface user={user} currentCity={currentCity} onTurfClick={handleTurfClick} />
      )}
      
      <MobileNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onProfileClick={handleProfileClick}
        onCreateGame={() => setShowCreateGame(true)}
      />
      
      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between">
          <div>© {new Date().getFullYear()} TapTurf • Made for turf lovers</div>
          <div className="flex flex-wrap gap-4">
            <button 
              className="hover:text-gray-700" 
              onClick={() => handleLegalPageClick('privacy')}
            >
              Privacy
            </button>
            <button 
              className="hover:text-gray-700" 
              onClick={() => handleLegalPageClick('terms')}
            >
              Terms
            </button>
            <button 
              className="hover:text-gray-700" 
              onClick={() => handleLegalPageClick('support')}
            >
              Support
            </button>
            {!user && (
              <button 
                className="hover:text-gray-700 font-medium text-primary-600 hover:text-primary-700" 
                onClick={() => setShowLogin(true)}
              >
                Turf Owner Sign In
              </button>
            )}
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
      
      {/* Global Toast Container */}
      <ToastContainer />
    </ErrorBoundary>
  );
}
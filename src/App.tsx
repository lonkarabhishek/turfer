import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Users, ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";

import { SmartBookingModal } from "./components/SmartBookingModal";
import { TopNav } from "./components/TopNav";
import { MobileNav } from "./components/MobileNav";
import { TurfSearch } from "./components/TurfSearch";
import { GameCard, type GameData } from "./components/GameCard";
import { CreateGameFlow } from "./components/CreateGameFlow";
import { SupabaseAuth } from "./components/SupabaseAuth";
import { UserProfile } from "./components/UserProfile";
import { TurfDetailPage } from "./components/TurfDetailPage";
import { TurfDetailPageEnhanced } from "./components/TurfDetailPageEnhanced";
import { LegalPages } from "./components/LegalPages";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UserDashboardEnhanced } from "./components/UserDashboardEnhanced";
import { OwnerDashboard } from "./components/OwnerDashboard";
import { GameDetailPage } from "./components/GameDetailPage";
import { NotificationsPage } from "./components/NotificationsPage";
import { WelcomePage } from "./components/WelcomePage";
import { EmailConfirmation } from "./components/EmailConfirmation";
import { ToastContainer } from "./components/ui/toast";
import { UserSyncUtility } from "./components/UserSyncUtility";
import { TossCoin } from "./components/TossCoin";
import { AdminTurfUpload } from "./components/AdminTurfUpload";

import { useAuth } from "./hooks/useAuth";
import { useNotifications } from "./hooks/useNotifications";
import { gamesAPI } from "./lib/api";
import type { AppUser } from "./hooks/useAuth";
import TapTurfLogo from "./assets/TapTurf_Logo.png";
import { transformGamesData, filterGamesByLocation, getUniqueLocations, getUniqueSports } from "./lib/gameTransformers";
import { filterNonExpiredGames, isGameExpired } from "./lib/gameUtils";


// Games will be loaded from API

function HeroSection({ 
  currentCity = 'your city',
  onFindGames,
  onBookTurf,
  onSignIn,
  user
}: { 
  currentCity?: string;
  onFindGames?: () => void;
  onBookTurf?: () => void;
  onSignIn?: () => void;
  user?: AppUser | null;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--neuro-bg)' }}>
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0" style={{ background: 'var(--neuro-bg)' }} />
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, #000 2px, transparent 2px)`,
          backgroundSize: '50px 50px'
        }} />
      </div>
      
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center justify-center min-h-screen text-center">
        
        {/* Logo */}
        <motion.div
          className="flex justify-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-lg bg-white border border-gray-200">
            <img 
              src={TapTurfLogo} 
              alt="TapTurf" 
              className="w-full h-full object-contain p-2"
            />
          </div>
        </motion.div>

        {/* Hero Text */}
        <motion.div 
          className="space-y-8 mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 leading-tight max-w-4xl">
            Your Next Game
            <br />
            <span className="text-primary-600">Starts Here</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            ⚽ Book premium turfs, join local games, and play with athletes in <span className="font-semibold text-gray-900">{currentCity}</span>
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <button 
            onClick={onBookTurf}
            className="w-full sm:w-auto px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
          >
            Book a Turf
          </button>
          
          <button 
            onClick={onFindGames}
            className="w-full sm:w-auto px-8 py-4 bg-white text-gray-900 font-semibold border-2 border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            Find Games to Join
          </button>

          {!user && (
            <button 
              onClick={onSignIn}
              className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-all duration-200 text-sm"
            >
              Sign In / Sign Up
            </button>
          )}
        </motion.div>

        {/* Sports Categories */}
        <motion.div
          className="grid grid-cols-3 sm:grid-cols-5 gap-6 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          {[
            { icon: '⚽', name: 'Football' },
            { icon: '🏀', name: 'Basketball' },
            { icon: '🏏', name: 'Cricket' },
            { icon: '🏸', name: 'Badminton' },
            { icon: '🎾', name: 'Tennis' }
          ].map((sport, index) => (
            <motion.div
              key={sport.name}
              className="flex flex-col items-center p-4 rounded-xl bg-gray-50 hover:bg-primary-50 transition-colors duration-200 cursor-pointer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 + (index * 0.1) }}
            >
              <div className="text-3xl mb-2">{sport.icon}</div>
              <div className="text-sm font-medium text-gray-700">{sport.name}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function GamesYouCanJoin({ games, user, onGameClick, onCreateGame }: { games: GameData[], user: AppUser | null, onGameClick?: (gameId: string) => void, onCreateGame?: () => void }) {
  const [userGames, setUserGames] = useState<GameData[]>([]);
  const [loadingUserGames, setLoadingUserGames] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [sportFilter, setSportFilter] = useState<string>('');

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
      if (!user?.id) {
        setUserGames([]);
        return;
      }

      // Get user's created games from Supabase
      const response = await gamesAPI.getUserGames(user.id);
      if (response.success && response.data) {
        const transformedGames = await transformGamesData(response.data);
        setUserGames(transformedGames);
      } else {
        setUserGames([]);
      }
    } catch (error) {
      console.error('Error loading user games:', error);
      setUserGames([]);
    } finally {
      setLoadingUserGames(false);
    }
  };

  // Filter games based on location, sport, and expiry
  const locationFiltered = locationFilter ? filterGamesByLocation(games, locationFilter) : games;
  const nonExpiredGames = filterNonExpiredGames(locationFiltered);
  const filteredGames = sportFilter
    ? nonExpiredGames.filter(game => game.format.toLowerCase().includes(sportFilter.toLowerCase()))
    : nonExpiredGames;

  // Get unique locations and sports for filter options
  const uniqueLocations = getUniqueLocations(games);
  const uniqueSports = getUniqueSports(games);

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
          ) : filterNonExpiredGames(userGames).length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filterNonExpiredGames(userGames).slice(0, 3).map((game) => (
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

        {/* Filters */}
        {games.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All areas</option>
                {uniqueLocations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
              <select
                value={sportFilter}
                onChange={(e) => setSportFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All sports</option>
                {uniqueSports.map((sport) => (
                  <option key={sport} value={sport}>{sport}</option>
                ))}
              </select>
            </div>

            {(locationFilter || sportFilter) && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocationFilter('');
                    setSportFilter('');
                  }}
                  className="px-4 py-2 h-10"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        )}
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGames.slice(0, 6).map((game) => (
            <GameCard key={game.id} game={game} user={user} onGameClick={onGameClick} />
          ))}
        </div>

        {filteredGames.length === 0 && games.length > 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No games match your filters</p>
            <Button 
              onClick={() => {
                setLocationFilter('');
                setSportFilter('');
              }}
              variant="outline"
              className="mt-4"
            >
              Clear filters
            </Button>
          </div>
        )}
        
        {games.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No active games right now</p>
            {user && (
              <Button 
                onClick={onCreateGame}
                className="mt-4 bg-primary-600 hover:bg-primary-700"
              >
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

function UserSurface({ user, currentCity = 'your city', onTurfClick, onGameClick, onCreateGame, onNavigateToGames, onNavigateToTurfs, onSignIn }: { user: AppUser | null, currentCity?: string, onTurfClick?: (turfId: string) => void, onGameClick?: (gameId: string) => void, onCreateGame?: () => void, onNavigateToGames?: () => void, onNavigateToTurfs?: () => void, onSignIn?: () => void }) {
  const [smartOpen, setSmartOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'turfs' | 'games'>('turfs');
  const [games, setGames] = useState<GameData[]>([]);

  // Load games when games section is active (regardless of authentication)
  useEffect(() => {
    console.log('🎮 activeSection changed to:', activeSection);
    if (activeSection === 'games') {
      console.log('🎯 Triggering loadGames...');
      loadGames();
    }
  }, [activeSection]);

  const sortGames = (games: GameData[]) => {
    return games.sort((a, b) => {
      // Calculate spots left for each game
      const spotsLeftA = a.maxPlayers - a.currentPlayers;
      const spotsLeftB = b.maxPlayers - b.currentPlayers;

      // Primary sort: FEWER spots left = higher priority (ascending)
      // Games that are almost full appear first
      if (spotsLeftA !== spotsLeftB) {
        return spotsLeftA - spotsLeftB;
      }

      // Secondary sort: More recently created = higher priority (descending)
      // If createdAt is available, use it
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      return 0;
    });
  };

  const loadGames = async () => {
    try {
      console.log('🔄 Loading games...');
      const response = await gamesAPI.getAvailable();
      console.log('📊 Games API response:', response);
      if (response.success && response.data) {
        console.log('✅ Found games:', response.data.length);
        const transformedGames = await transformGamesData(response.data);
        const sortedGames = sortGames(transformedGames);
        console.log('🎮 Sorted games:', sortedGames);
        setGames(sortedGames);
      } else {
        console.log('❌ No games found or API error:', response);
        setGames([]);
      }
    } catch (error) {
      console.error('Error loading games:', error);
      setGames([]);
    }
  };

  return (
    <div className="pb-20 sm:pb-0">
      <HeroSection 
        currentCity={currentCity} 
        onFindGames={onNavigateToGames}
        onBookTurf={onNavigateToTurfs}
        onSignIn={onSignIn}
        user={user}
      />
      
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
            onGameClick={onGameClick}
            onCreateGame={onCreateGame}
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
  const { unreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState<string>("home");
  const [currentPage, setCurrentPage] = useState<'home' | 'turf-detail' | 'profile' | 'legal' | 'dashboard' | 'game-detail' | 'create-game' | 'games' | 'turfs' | 'confirm' | 'notifications' | 'admin-turf-upload'>('home');
  const [currentCity, setCurrentCity] = useState('Nashik');
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTossCoin, setShowTossCoin] = useState(false);
  const [selectedTurfId, setSelectedTurfId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [turfIdForGame, setTurfIdForGame] = useState<string | undefined>(undefined);
  const [legalPageType, setLegalPageType] = useState<'privacy' | 'terms' | 'support'>('privacy');
  const [games, setGames] = useState<GameData[]>([]);
  const [turfs, setTurfs] = useState<any[]>([]);
  const [dashboardSection, setDashboardSection] = useState<string>('overview');

  // Sort games by spots left (ascending - almost full first) and then by creation time (newest first)
  const sortGames = (games: GameData[]) => {
    return games.sort((a, b) => {
      // Calculate spots left for each game
      const spotsLeftA = a.maxPlayers - a.currentPlayers;
      const spotsLeftB = b.maxPlayers - b.currentPlayers;

      // Primary sort: FEWER spots left = higher priority (ascending)
      // Games that are almost full appear first
      if (spotsLeftA !== spotsLeftB) {
        return spotsLeftA - spotsLeftB;
      }

      // Secondary sort: More recently created = higher priority (descending)
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      return 0;
    });
  };

  // Load games for the games page
  const loadGames = async () => {
    try {
      console.log('🔄 Loading games...');
      const response = await gamesAPI.getAvailable();
      console.log('📊 Games API response:', response);
      if (response.success && response.data) {
        console.log('✅ Found games:', response.data.length);
        const transformedGames = await transformGamesData(response.data);
        const sortedGames = sortGames(transformedGames);
        console.log('🎮 Sorted games:', sortedGames);
        setGames(sortedGames);
      } else {
        console.log('❌ No games found or API error:', response);
        setGames([]);
      }
    } catch (error) {
      console.error('Error loading games:', error);
      setGames([]);
    }
  };

  // Load games when navigating to games page
  useEffect(() => {
    if (currentPage === 'games') {
      loadGames();
    }
  }, [currentPage]);

  // Handle URL routing on mount and browser navigation
  useEffect(() => {
    const handleRouting = () => {
      const path = window.location.pathname;
      console.log('🔍 Routing to path:', path);

      if (path.includes('/confirm')) {
        setCurrentPage('confirm');
      } else if (path.includes('/notifications')) {
        console.log('🔔 Navigating to notifications');
        setCurrentPage('notifications');
      } else if (path.includes('/game/')) {
        const gameId = path.split('/game/')[1]?.split('?')[0]; // Remove query params
        console.log('🎮 Navigating to game:', gameId);
        if (gameId) {
          setSelectedGameId(gameId);
          setCurrentPage('game-detail');
        }
      } else if (path.includes('/turf/')) {
        const turfId = path.split('/turf/')[1]?.split('?')[0]; // Remove query params
        console.log('🏟️ Navigating to turf:', turfId);
        if (turfId) {
          setSelectedTurfId(turfId);
          setCurrentPage('turf-detail');
        }
      } else if (path === '/' || path === '') {
        console.log('🏠 Navigating to home');
        setCurrentPage('home');
        setSelectedTurfId(null);
        setSelectedGameId(null);
      }
    };

    // Handle initial route
    handleRouting();

    // Listen for browser back/forward navigation
    const handlePopState = () => {
      console.log('↩️ Browser navigation detected');
      handleRouting();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Update URL when navigating to game pages
  const handleGameClick = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
    setCurrentPage('game-detail');
    window.history.pushState({}, '', `/game/${gameId}`);
  }, []);

  // Auto-set dashboard tab for owners - Disabled for now (owner dashboard hidden)
  // useEffect(() => {
  //   if (user?.role === 'owner' && activeTab === 'home') {
  //     setActiveTab('dashboard');
  //   }
  // }, [user]);

  // Handle welcome flow for new signups
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasWelcomeParam = urlParams.has('welcome');
    const currentPath = window.location.pathname;
    
    // Show welcome page if user just signed up and was redirected to /welcome
    if (currentPath === '/welcome' || hasWelcomeParam) {
      if (user && !loading) {
        setShowWelcome(true);
        // Clean up URL without refreshing page
        window.history.replaceState({}, '', '/');
      }
    }
  }, [user, loading]);

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
    window.history.pushState({}, '', `/turf/${turfId}`);
  };

  const handleBackToHome = () => {
    setCurrentPage('home'); // Navigate to landing page
    setSelectedTurfId(null);
    setSelectedGameId(null);
    setActiveTab('home');
    window.history.pushState({}, '', '/');
  };

  const handleNavigate = (section: string) => {
    console.log('🧭 handleNavigate called with section:', section);
    if (section === 'home') {
      handleBackToHome();
    } else if (section === 'search') {
      handleBackToHome();
      setActiveTab('home');
    } else if (section === 'games') {
      setCurrentPage('games');
      setActiveTab('games');
    } else if (section === 'turfs') {
      setCurrentPage('turfs');
      setActiveTab('turfs');
    } else if (section === 'profile') {
      console.log('🧭 Navigating to profile, user:', user ? 'logged in' : 'not logged in');
      if (user) {
        // User is logged in, show profile page
        setCurrentPage('profile');
        setActiveTab('profile');
      } else {
        // User not logged in, show login modal
        console.log('🧭 Opening login modal');
        setShowLogin(true);
      }
    } else {
      handleBackToHome();
      setActiveTab('home');
    }
  };

  const handleLegalPageClick = (type: 'privacy' | 'terms' | 'support') => {
    setLegalPageType(type);
    setCurrentPage('legal');
  };

  const handleDashboardNavigation = (section: string) => {
    setDashboardSection(section);
    setCurrentPage('dashboard');
    setActiveTab('dashboard');
  };

  const handleGameNavigation = (gameId: string) => {
    setSelectedGameId(gameId);
    setCurrentPage('game-detail');
    window.history.pushState({}, '', `/game/${gameId}`);
  };

  const handleNotificationsClick = () => {
    if (!user) {
      setShowLogin(true);
    } else {
      setCurrentPage('notifications');
      setActiveTab('notifications');
      window.history.pushState({}, '', '/notifications');
    }
  };

  const handleTossClick = () => {
    setShowTossCoin(true);
  };

  const handleFindGamesClick = () => {
    setCurrentPage('games');
    setActiveTab('games');
  };


  // Owner dashboard functionality hidden for now - focusing on user experience
  // const showOwnerDashboard = user?.role === 'owner' && (activeTab === "owner" || activeTab === "dashboard");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--neuro-bg)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {/* Ensure user is synced to users table */}
      <UserSyncUtility />

      <div className="min-h-screen" style={{ background: 'var(--neuro-bg)' }}>
        <TopNav
        currentCity={currentCity}
        user={user}
        onAuthChange={refreshAuth}
        onProfileClick={handleProfileClick}
        onCreateGame={() => setShowCreateGame(true)}
        onCityChange={setCurrentCity}
        onHomeClick={handleBackToHome}
        onDashboardNavigation={handleDashboardNavigation}
        onGameNavigation={handleGameNavigation}
        onTossClick={handleTossClick}
      />
      
      {currentPage === 'confirm' ? (
        <EmailConfirmation />
      ) : currentPage === 'turf-detail' && selectedTurfId ? (
        <TurfDetailPageEnhanced
          turfId={selectedTurfId}
          onBack={handleBackToHome}
          onCreateGame={() => {
            setTurfIdForGame(selectedTurfId);
            setShowCreateGame(true);
          }}
          onBookTurf={() => {
            // Handle booking
            console.log('Booking turf:', selectedTurfId);
          }}
        />
      ) : currentPage === 'game-detail' && selectedGameId ? (
        <GameDetailPage
          gameId={selectedGameId}
          onBack={handleBackToHome}
          onNavigate={handleNavigate}
        />
      ) : currentPage === 'notifications' && user ? (
        <NotificationsPage
          onBack={handleBackToHome}
          onGameNavigation={handleGameNavigation}
        />
      ) : currentPage === 'admin-turf-upload' ? (
        <AdminTurfUpload
          onBack={handleBackToHome}
        />
      ) : currentPage === 'dashboard' && user ? (
        // Owner dashboard hidden for now - focusing on user experience
        // user.role === 'owner' ? (
        //   <OwnerDashboard onNavigate={handleNavigate} />
        // ) : (
        <UserDashboardEnhanced onNavigate={handleNavigate} onCreateGame={() => setShowCreateGame(true)} initialTab={dashboardSection} onGameNavigation={handleGameNavigation} />
        // )
      ) : currentPage === 'profile' && user ? (
        <UserProfile
          user={user}
          onBack={handleBackToHome}
          onCreateGame={() => {
            handleBackToHome();
            setShowCreateGame(true);
          }}
        />
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
      ) : currentPage === 'games' ? (
        <div className="min-h-screen">
          <div className="bg-white shadow-sm border-b px-4 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackToHome}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Find Games to Join</h1>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <GamesYouCanJoin games={games} user={user} onGameClick={handleGameClick} onCreateGame={() => setShowCreateGame(true)} />
          </div>
        </div>
      ) : currentPage === 'turfs' ? (
        <div className="min-h-screen">
          <div className="bg-white shadow-sm border-b px-4 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackToHome}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Book a Turf</h1>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <TurfSearch user={user} onTurfClick={handleTurfClick} />
          </div>
        </div>
      ) : (
        <UserSurface 
          user={user} 
          currentCity={currentCity} 
          onTurfClick={handleTurfClick} 
          onGameClick={handleGameClick} 
          onCreateGame={() => setShowCreateGame(true)}
          onNavigateToGames={() => setCurrentPage('games')}
          onNavigateToTurfs={() => setCurrentPage('turfs')}
          onSignIn={() => setShowLogin(true)}
        />
      )}

      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onProfileClick={handleProfileClick}
        onCreateGame={() => setShowCreateGame(true)}
        onHomeClick={handleBackToHome}
        onNotificationsClick={handleNotificationsClick}
        onTossClick={handleTossClick}
        onFindGamesClick={handleFindGamesClick}
        unreadCount={unreadCount}
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
        onClose={() => {
          setShowCreateGame(false);
          setTurfIdForGame(undefined);
        }}
        initialTurfId={turfIdForGame}
        onGameCreated={async (game) => {
          console.log('Game created:', game);
          // Don't close immediately - let user see success page first
          // setShowCreateGame(false);
          // Always refresh the games list to show the newly created game
          try {
            const response = await gamesAPI.getAvailable();
            if (response.success && response.data) {
              const transformedGames = await transformGamesData(response.data);
              // Call loadGames to refresh the state properly
              await loadGames();
            }
          } catch (error) {
            console.error('Error refreshing games after creation:', error);
          }
        }}
      />

      <TossCoin
        isOpen={showTossCoin}
        onClose={() => setShowTossCoin(false)}
      />

      <SupabaseAuth
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={() => {
          refreshAuth();
          // Check if this was a signup that should show welcome
          setTimeout(() => {
            if (window.location.pathname === '/welcome' || window.location.search.includes('welcome')) {
              setShowWelcome(true);
            }
          }, 500);
        }}
      />

      {showWelcome && (
        <WelcomePage
          onComplete={() => {
            setShowWelcome(false);
            // Optionally refresh auth to get latest user data
            refreshAuth();
          }}
          userName={user?.name || user?.email?.split('@')[0]}
        />
      )}

      {/* Global Toast Container */}
      <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}
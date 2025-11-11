import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Calendar, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { GameCard } from './GameCard';
import { TurfCardEnhanced } from './TurfCardEnhanced';
import { gamesAPI, turfsAPI } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import { usePageScrollToTop } from '../hooks/useScrollToTop';
import type { GameData } from './GameCard';
import type { TurfData } from './TurfCard';

interface SportPageProps {
  sport: string;
  onNavigateHome: () => void;
  onNavigateToFindTurfs?: () => void;
}

const sportInfo: { [key: string]: { name: string; icon: string; color: string } } = {
  'football': { name: 'Football', icon: '⚽', color: 'bg-emerald-500' },
  'basketball': { name: 'Basketball', icon: '🏀', color: 'bg-purple-500' },
  'cricket': { name: 'Cricket', icon: '🏏', color: 'bg-orange-500' },
  'badminton': { name: 'Badminton', icon: '🏸', color: 'bg-blue-500' },
  'tennis': { name: 'Tennis', icon: '🎾', color: 'bg-green-500' },
  'pickleball': { name: 'Pickleball', icon: '🏓', color: 'bg-pink-500' }
};

export function SportPage({ sport, onNavigateHome, onNavigateToFindTurfs }: SportPageProps) {
  const [games, setGames] = useState<GameData[]>([]);
  const [turfs, setTurfs] = useState<TurfData[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingTurfs, setLoadingTurfs] = useState(true);

  // Scroll to top when component mounts
  usePageScrollToTop();

  const info = sportInfo[sport.toLowerCase()] || {
    name: sport,
    icon: '🏆',
    color: 'bg-gray-500'
  };

  // Add SEO for this sport page
  useSEO({
    title: `${info.name} Turfs & Games in Your City`,
    description: `Find ${info.name.toLowerCase()} turfs and join active games near you. Book premium ${info.name.toLowerCase()} facilities instantly. Connect with players and play ${info.name.toLowerCase()} today!`,
    keywords: `${info.name.toLowerCase()}, ${info.name.toLowerCase()} turf, ${info.name.toLowerCase()} games, play ${info.name.toLowerCase()}, ${info.name.toLowerCase()} booking, ${info.name.toLowerCase()} near me, ${info.name.toLowerCase()} facilities`,
    canonicalUrl: `https://www.tapturf.in/sport/${sport.toLowerCase()}`,
    ogType: 'website'
  });

  useEffect(() => {
    loadGames();
    loadTurfs();
  }, [sport]);

  const loadGames = async () => {
    setLoadingGames(true);
    try {
      const response = await gamesAPI.getAvailableGames();
      if (response.success && response.data) {
        // Filter games by sport
        const filteredGames = response.data.filter((game: GameData) =>
          game.format.toLowerCase().includes(sport.toLowerCase())
        );
        setGames(filteredGames);
      }
    } catch (error) {
      console.error('Error loading games:', error);
    } finally {
      setLoadingGames(false);
    }
  };

  const loadTurfs = async () => {
    setLoadingTurfs(true);
    try {
      const response = await turfsAPI.search({ sport: sport.toLowerCase() });
      if (response.success && response.data) {
        // Extract turfs from the response (it returns SearchTurfsResponse with turfs array)
        const turfs = response.data.turfs || [];
        setTurfs(turfs);
      }
    } catch (error) {
      console.error('Error loading turfs:', error);
    } finally {
      setLoadingTurfs(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className={`${info.color} text-white`}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={onNavigateHome}
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <div className="flex items-center gap-4 mb-2">
            <div className="text-6xl">{info.icon}</div>
            <div>
              <h1 className="text-4xl font-bold mb-2">{info.name}</h1>
              <p className="text-white/90 text-lg">
                Find games and turfs for {info.name.toLowerCase()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Upcoming Games Section */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="w-6 h-6 text-gray-700" />
            <h2 className="text-2xl font-bold text-gray-900">
              Upcoming Games
            </h2>
            {!loadingGames && (
              <span className="text-sm text-gray-500">
                ({games.length} {games.length === 1 ? 'game' : 'games'})
              </span>
            )}
          </div>

          {loadingGames ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : games.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">{info.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No upcoming games
              </h3>
              <p className="text-gray-600 mb-6">
                Be the first to create a {info.name.toLowerCase()} game!
              </p>
              <Button
                onClick={onNavigateToFindTurfs}
                className="bg-primary-600 hover:bg-primary-700"
              >
                Find a Turf
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <GameCard game={game} />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Available Turfs Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <MapPin className="w-6 h-6 text-gray-700" />
            <h2 className="text-2xl font-bold text-gray-900">
              Available Turfs
            </h2>
            {!loadingTurfs && (
              <span className="text-sm text-gray-500">
                ({turfs.length} {turfs.length === 1 ? 'turf' : 'turfs'})
              </span>
            )}
          </div>

          {loadingTurfs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : turfs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
              <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No turfs found
              </h3>
              <p className="text-gray-600">
                We couldn't find any turfs offering {info.name.toLowerCase()} at the moment.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {turfs.map((turf) => (
                <motion.div
                  key={turf.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <TurfCardEnhanced turf={turf} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
